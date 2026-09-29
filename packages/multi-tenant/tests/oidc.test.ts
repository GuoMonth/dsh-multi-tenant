import { test, expect, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentEnvironmentRuntime } from "../src/environment-contract.js";
import { EnvironmentBindingStore } from "../src/platform/bindings.js";
import { createEnvironmentControl } from "../src/platform/control.js";
import { createOIDCAuthentication } from "../src/platform/oidc.js";
const issuer = "https://issuer.example",
  origin = "https://platform.example.test";
const member = {
  issuer,
  subject: "alice",
  owner: { tenantId: "t", principalId: "alice" },
};
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: "fixture",
  alg: "RS256",
  use: "sig",
};
function jwt(claims: object) {
  const h = Buffer.from(
      JSON.stringify({ alg: "RS256", kid: "fixture" }),
    ).toString("base64url"),
    p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${h}.${p}.${sign("sha256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url")}`;
}
test.each(["valid", "state", "nonce", "expired", "subject"] as const)(
  "OIDC signed code exchange: %s",
  async (mode) => {
    let nonce = "",
      exchanges = 0;
    vi.stubGlobal("fetch", async (input: URL | string) => {
      const url = String(input);
      const body = url.endsWith("/.well-known/openid-configuration")
        ? {
            issuer,
            authorization_endpoint: issuer + "/authorize",
            token_endpoint: issuer + "/token",
            jwks_uri: issuer + "/jwks",
            response_types_supported: ["code"],
            subject_types_supported: ["public"],
            id_token_signing_alg_values_supported: ["RS256"],
          }
        : url.endsWith("/jwks")
          ? { keys: [jwk] }
          : (exchanges++,
            {
              access_token: "fixture-access",
              token_type: "Bearer",
              id_token: jwt({
                iss: issuer,
                sub: mode === "subject" ? "unlisted" : "alice",
                aud: "client",
                iat: Math.floor(Date.now() / 1000),
                exp:
                  Math.floor(Date.now() / 1000) +
                  (mode === "expired" ? -3600 : 600),
                nonce: mode === "nonce" ? "wrong" : nonce,
              }),
            });
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    });
    const dir = mkdtempSync(join(tmpdir(), "oidc-platform-"));
    const store = new EnvironmentBindingStore(join(dir, "state.sqlite"));
    const control = createEnvironmentControl(
      {} as AgentEnvironmentRuntime,
      store,
    );
    const auth = await createOIDCAuthentication(
      {
        issuer,
        clientId: "client",
        platformOrigin: origin,
        siteDomain: "example.test",
      },
      undefined,
      control.environments,
      control.origins,
      [member],
      new AbortController().signal,
      control,
    );
    async function request(
      url: string,
      cookie?: string,
      method = "GET",
      requestOrigin?: string,
    ) {
      let status = 0,
        body = "";
      const headers = new Map<string, string[]>();
      const response = {
        headersSent: false,
        destroyed: false,
        setHeader(k: string, v: string) {
          headers.set(k, [v]);
        },
        appendHeader(k: string, v: string) {
          headers.set(k, [...(headers.get(k) ?? []), v]);
        },
        writeHead(s: number, h?: Record<string, string>) {
          status = s;
          for (const [k, v] of Object.entries(h ?? {})) headers.set(k, [v]);
        },
        end(text?: string) {
          body = text ?? "";
        },
      };
      await auth.authenticator.handle!(
        {
          url,
          method,
          headers: {
            host: "platform.example.test",
            ...(cookie ? { cookie } : {}),
            ...(requestOrigin ? { origin: requestOrigin } : {}),
          },
        } as IncomingMessage,
        response as unknown as ServerResponse,
        new AbortController().signal,
      );
      return { status, body, headers };
    }
    try {
      const login = await request("/auth/login");
      expect(login.status).toBe(303);
      const authorization = new URL(login.headers.get("location")![0]!);
      nonce = authorization.searchParams.get("nonce")!;
      expect(authorization.searchParams.get("code_challenge_method")).toBe(
        "S256",
      );
      const cookie = login.headers.get("set-cookie")![0]!.split(";")[0]!;
      const callback = `/auth/callback?code=fixture-code&state=${mode === "state" ? "incorrect" : authorization.searchParams.get("state")}`;
      const result = await request(callback, cookie);
      if (mode === "valid") {
        expect(result.status).toBe(303);
        const parent = result.headers
          .get("set-cookie")!
          .find((c) => c.startsWith("__Host-dsh-platform="))!
          .split(";")[0]!;
        const home = await request("/", parent);
        expect(home.headers.get("referrer-policy")).toEqual(["same-origin"]);
        expect(home.body).toContain("Stop");
        expect(home.body).toContain("Enter / create");
        expect(home.body).toContain("env-");
        const id = store.reserve(member.owner).id;
        expect(
          (
            await request(
              `/api/environments/${id}/stop`,
              parent,
              "POST",
              "https://evil.example",
            )
          ).status,
        ).toBe(403);
        auth.updateMembers([]);
        expect((await request(`/api/environments/${id}`, parent)).status).toBe(
          403,
        );
      } else expect(result.status).toBe(403);
      expect((await request(callback, cookie)).status).toBe(403); // transaction consumed, never replayed
      if (mode === "state") expect(exchanges).toBe(0);
    } finally {
      auth.close();
      store.close();
      rmSync(dir, { recursive: true });
      vi.unstubAllGlobals();
    }
  },
);
