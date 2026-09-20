import type { IncomingMessage, ServerResponse } from "node:http";
import * as oidc from "openid-client";
import { AsyncLocalStorage } from "node:async_hooks";
import { RuntimeAccessError } from "@dsh/cell-connector-internal";
import { randomUUID } from "node:crypto";
import type { createEnvironmentControl } from "./control.js";
import type { Environment, PlatformAuthenticator } from "./ingress.js";
import {
  Sessions,
  Once,
  digest,
  randomToken,
  type Member,
} from "./sessions.js";

export interface OIDCOptions {
  issuer: string;
  clientId: string;
  platformOrigin: string;
  siteDomain: string;
  sessionLifetimeMs?: number;
}
interface Entry {
  environmentId: string;
  nonceHash: string;
}
interface Transaction {
  entry: Entry | undefined;
  verifier: string;
  state: string;
  nonce: string;
}
interface Ticket {
  entry: Entry;
  parentKey: string;
}
const parentCookie = "__Host-dsh-platform";
const childCookie = "__Host-dsh-environment";
const entryCookie = "__Host-dsh-entry";
const transactionCookie = "__Host-dsh-oidc";
function cookie(request: IncomingMessage, name: string) {
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(name + "="))
    .map((x) => x.slice(name.length + 1));
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]!)
    ? values[0]
    : undefined;
}
function setCookie(
  response: ServerResponse,
  name: string,
  value: string,
  maxAge: number,
) {
  response.appendHeader(
    "set-cookie",
    `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  );
}
function redirect(response: ServerResponse, url: string) {
  response.writeHead(303, {
    location: url,
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  response.end();
}
function page(response: ServerResponse, body: string) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
  });
  response.end(body);
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export async function createOIDCAuthentication(
  options: OIDCOptions,
  secret: string | undefined,
  environments: ReadonlyMap<string, Environment>,
  origins: ReadonlyMap<string, string>,
  members: readonly Member[],
  shutdown: AbortSignal,
  control: ReturnType<typeof createEnvironmentControl>,
) {
  const platform = new URL(options.platformOrigin),
    issuer = new URL(options.issuer);
  const validOrigin = (value: string) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.origin === value &&
      !u.username &&
      !u.password &&
      (u.hostname === options.siteDomain ||
        u.hostname.endsWith("." + options.siteDomain))
    );
  };
  if (
    !options.clientId ||
    !/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(options.siteDomain) ||
    !validOrigin(options.platformOrigin) ||
    issuer.protocol !== "https:" ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash
  )
    throw new Error("Invalid OIDC topology");
  function environmentForHost(host: string) {
    const byHost = new Map<string, Environment>();
    for (const environment of environments.values()) {
      const origin = origins.get(environment.id);
      if (
        !origin ||
        !validOrigin(origin) ||
        origin === platform.origin ||
        byHost.has(new URL(origin).host)
      )
        throw new Error("Invalid environment origin");
      byHost.set(new URL(origin).host, environment);
    }
    return byHost.get(host);
  }
  const requestScope = new AsyncLocalStorage<AbortSignal>();
  const config = await oidc.discovery(
    issuer,
    options.clientId,
    undefined,
    secret ? oidc.ClientSecretBasic(secret) : oidc.None(),
    {
      timeout: 10,
      [oidc.customFetch]: (url, init) =>
        fetch(url, {
          ...init,
          body:
            init.body instanceof Uint8Array
              ? new Uint8Array(init.body).buffer
              : (init.body ?? null),
          redirect: "error",
          signal: AbortSignal.any([
            shutdown,
            ...(init?.signal ? [init.signal] : []),
            ...(requestScope.getStore() ? [requestScope.getStore()!] : []),
            AbortSignal.timeout(10000),
          ]),
        }),
    },
  );
  oidc.enableNonRepudiationChecks(config);
  const sessions = new Sessions(members, options.sessionLifetimeMs);
  control.setRevoker((id) => sessions.revokeEnvironment(id));
  const entries = new Once<Entry>(),
    transactions = new Once<Transaction>(),
    tickets = new Once<Ticket>();
  const callback = new URL("/auth/callback", platform).href;
  const csrf = (request: IncomingMessage, origin: string) =>
    request.headers.origin === origin &&
    request.headers["sec-fetch-site"] !== "cross-site";
  function exchange(entry: Entry, parentKey: string) {
    const environment = environments.get(entry.environmentId),
      parent = sessions.byKey(parentKey);
    if (
      !environment ||
      !parent ||
      parent.member.owner.tenantId !== environment.owner.tenantId ||
      parent.member.owner.principalId !== environment.owner.principalId
    )
      throw new Error("EnvironmentForbidden");
    const ticket = tickets.put({ entry, parentKey }, 30000);
    const destination = new URL("/auth/complete", origins.get(environment.id)!);
    destination.searchParams.set("ticket", ticket);
    return destination.href;
  }
  const authenticator: PlatformAuthenticator = {
    async authenticate(request, signal) {
      signal.throwIfAborted();
      const environment = environmentForHost(request.headers.host ?? "");
      return environment
        ? sessions.child(cookie(request, childCookie), environment)
        : undefined;
    },
    async handle(request, response, signal) {
      const host = request.headers.host ?? "",
        environment = environmentForHost(host);
      if (host !== platform.host && !environment) {
        response.writeHead(421);
        response.end();
        return true;
      }
      const origin = environment
        ? origins.get(environment.id)!
        : platform.origin;
      if (
        !request.url?.startsWith("/") ||
        request.url.startsWith("//") ||
        request.url.length > 16384
      ) {
        response.writeHead(400);
        response.end();
        return true;
      }
      const url = new URL(request.url, origin);
      if (url.origin !== origin) {
        response.writeHead(400);
        response.end();
        return true;
      }
      if (environment && !url.pathname.startsWith("/auth/")) {
        if (
          request.method === "GET" &&
          url.pathname === "/" &&
          !sessions.child(cookie(request, childCookie), environment)
        ) {
          page(
            response,
            '<a href="/auth/login">Sign in to this environment</a>',
          );
          return true;
        }
        return false;
      }
      const correlationId = randomUUID();
      try {
        signal.throwIfAborted();
        response.setHeader("cache-control", "no-store");
        response.setHeader("referrer-policy", "no-referrer");
        if (!environment && url.pathname.startsWith("/api/")) {
          const parent = sessions.parent(cookie(request, parentCookie));
          if (!parent || (request.method !== "GET" && !csrf(request, origin)))
            throw new Error("EnvironmentForbidden");
          await control.handle(request, response, parent.member, {
            signal: AbortSignal.any([signal, parent.abort.signal]),
            correlationId,
          });
          return true;
        }
        if (request.method === "POST" && url.pathname === "/auth/logout") {
          if (!csrf(request, origin)) throw new Error("InvalidLogoutOrigin");
          if (environment)
            sessions.logoutChild(cookie(request, childCookie), environment);
          else {
            const parent = sessions.parent(cookie(request, parentCookie));
            if (parent) sessions.revoke(parent.key);
          }
          setCookie(response, environment ? childCookie : parentCookie, "", 0);
          page(
            response,
            "Logged out of this platform session. Existing environment connections have been revoked.",
          );
          return true;
        }
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET, POST" });
          response.end();
          return true;
        }
        if (environment && url.pathname === "/auth/login") {
          if (request.headers["sec-fetch-site"] === "cross-site")
            throw new Error("CrossSiteLogin");
          const nonce = randomToken(),
            entry = entries.put(
              { environmentId: environment.id, nonceHash: digest(nonce) },
              5 * 60 * 1000,
            );
          setCookie(response, entryCookie, nonce, 300);
          const destination = new URL("/auth/authorize", platform);
          destination.searchParams.set("entry", entry);
          redirect(response, destination.href);
          return true;
        }
        if (
          !environment &&
          (url.pathname === "/auth/authorize" || url.pathname === "/auth/login")
        ) {
          if (request.headers["sec-fetch-site"] === "cross-site")
            throw new Error("CrossSiteLogin");
          const entry =
            url.pathname === "/auth/authorize"
              ? entries.take(url.searchParams.get("entry") ?? undefined)
              : undefined;
          if (url.pathname === "/auth/authorize" && !entry)
            throw new Error("LoginExpired");
          const parent = sessions.parent(cookie(request, parentCookie));
          if (parent) {
            redirect(
              response,
              entry ? exchange(entry, parent.key) : platform.origin,
            );
            return true;
          }
          const verifier = oidc.randomPKCECodeVerifier(),
            state = oidc.randomState(),
            nonce = oidc.randomNonce();
          const tx = transactions.put(
            { entry, verifier, state, nonce },
            5 * 60 * 1000,
          );
          setCookie(response, transactionCookie, tx, 300);
          const challenge = await oidc.calculatePKCECodeChallenge(verifier);
          signal.throwIfAborted();
          redirect(
            response,
            oidc.buildAuthorizationUrl(config, {
              redirect_uri: callback,
              scope: "openid",
              code_challenge: challenge,
              code_challenge_method: "S256",
              state,
              nonce,
              response_mode: "query",
            }).href,
          );
          return true;
        }
        if (!environment && url.pathname === "/auth/callback") {
          const tx = transactions.take(cookie(request, transactionCookie));
          setCookie(response, transactionCookie, "", 0);
          if (!tx) throw new Error("LoginExpired");
          const tokens = await requestScope.run(signal, () =>
            oidc.authorizationCodeGrant(config, url, {
              pkceCodeVerifier: tx.verifier,
              expectedState: tx.state,
              expectedNonce: tx.nonce,
              idTokenExpected: true,
            }),
          );
          signal.throwIfAborted();
          shutdown.throwIfAborted();
          const claims = tokens.claims();
          if (!claims?.sub || claims.iss !== config.serverMetadata().issuer)
            throw new Error("InvalidIdentity");
          const { token, parent } = sessions.issueParent(
            claims.iss,
            claims.sub,
          );
          try {
            const destination = tx.entry
              ? exchange(tx.entry, parent.key)
              : platform.origin;
            const previous = sessions.parent(cookie(request, parentCookie));
            if (previous) sessions.revoke(previous.key);
            setCookie(
              response,
              parentCookie,
              token,
              (parent.expiresAt - Date.now()) / 1000,
            );
            redirect(response, destination);
          } catch (error) {
            sessions.revoke(parent.key);
            throw error;
          }
          return true;
        }
        if (environment && url.pathname === "/auth/complete") {
          const ticket = tickets.take(
              url.searchParams.get("ticket") ?? undefined,
            ),
            nonce = cookie(request, entryCookie);
          setCookie(response, entryCookie, "", 0);
          if (
            !ticket ||
            !nonce ||
            ticket.entry.environmentId !== environment.id ||
            ticket.entry.nonceHash !== digest(nonce)
          )
            throw new Error("InvalidExchange");
          const child = sessions.issueChild(ticket.parentKey, environment);
          setCookie(
            response,
            childCookie,
            child.token,
            (child.expiresAt - Date.now()) / 1000,
          );
          redirect(response, origin + "/");
          return true;
        }
        if (url.pathname === "/" && !environment) {
          const parent = sessions.parent(cookie(request, parentCookie));
          const links = parent
            ? control
                .list(parent.member)
                .map(
                  (e) =>
                    `<li>${escape(e.id)} (${escape(e.phase)}) <form method="post" action="/api/environments/${escape(e.id)}"><button>Create or inspect</button></form><a href="/api/environments/${escape(e.id)}">Inspect</a>${e.origin ? ` <a href="${escape(e.origin + "/auth/login")}">Open environment</a>` : ""}</li>`,
                )
                .join("")
            : "";
          page(
            response,
            parent
              ? `<h1>Your environments</h1><ul>${links}</ul><form method="post" action="/auth/logout"><button>Log out</button></form>`
              : '<a href="/auth/login">Sign in</a>',
          );
          return true;
        }
        response.writeHead(404);
        response.end();
        return true;
      } catch (error) {
        if (error instanceof RuntimeAccessError) {
          if (!response.headersSent && !response.destroyed) {
            response.writeHead(503, { "content-type": "application/json" });
            response.end(JSON.stringify(error));
          } else if (!response.destroyed) response.destroy();
          return true;
        }
        const reasons = new Set([
          "EnvironmentForbidden",
          "InvalidLogoutOrigin",
          "CrossSiteLogin",
          "LoginExpired",
          "InvalidIdentity",
          "MemberNotAllowed",
          "SessionCapacity",
          "LoginCapacity",
          "InvalidExchange",
        ]);
        const reason =
          error instanceof Error && reasons.has(error.message)
            ? error.message
            : "IdentityFlowRejected";
        console.warn(
          JSON.stringify({
            code: "AuthenticationRejected",
            reason,
            correlationId,
          }),
        );
        if (!response.headersSent && !response.destroyed) {
          response.writeHead(403, { "content-type": "application/json" });
          response.end(
            JSON.stringify(
              new RuntimeAccessError(
                "AccessRejected",
                correlationId,
                `${reason}: restart login from the configured environment origin; check membership and identity-provider configuration`,
              ),
            ),
          );
        } else if (!response.destroyed) response.destroy();
        return true;
      }
    },
  };
  return {
    authenticator,
    updateMembers: (next: readonly Member[]) => sessions.updateMembers(next),
    close() {
      entries.clear();
      transactions.clear();
      tickets.clear();
      sessions.close();
    },
  };
}
