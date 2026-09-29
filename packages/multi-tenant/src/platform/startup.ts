/** Fixed diagnostics only: dependency errors can contain URLs, tokens or file contents. */
const actions = {
  configuration:
    "Check the current configuration schema and environment template bindings",
  secret:
    "Check OIDC client secret exists, is nonempty, readable and mode 0600",
  runtime:
    "Check the fixed environment image, storage, resources, namespace prefix and domain against the runtime contract",
  state:
    "Check private SQLite permissions, exclusive ownership and current schema; check owner bindings; do not erase existing allocations",
  oidc: "Check HTTPS issuer discovery, CA trust, client registration and membership mapping",
  admin:
    "Check private socket directory ownership and mode 0700; inspect an existing socket before any manual removal",
  listen: "Check configured listen address and port availability",
} as const;
export type StartupStage = keyof typeof actions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateEnvironmentConfiguration(runtime: unknown): void {
  if (
    !isRecord(runtime) ||
    typeof runtime.image !== "string" ||
    !runtime.image.includes("@sha256:") ||
    !isRecord(runtime.kubernetes) ||
    !isRecord(runtime.storage) ||
    !isRecord(runtime.resources)
  )
    throw new Error("Invalid runtime configuration");
}

export function startupDiagnostic(stage: StartupStage, correlationId: string) {
  return {
    code: "PlatformStartupRejected",
    stage,
    target: { component: "environment-platform" },
    observedState: "not-listening",
    message: "Platform startup rejected",
    effect: "not-submitted",
    retry: "never",
    correlationId,
    nextAction: actions[stage],
  };
}
