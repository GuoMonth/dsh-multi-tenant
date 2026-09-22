/** Fixed diagnostics only: dependency errors can contain URLs, tokens or file contents. */
const actions = {
  configuration:
    "Check the current configuration schema and environment template bindings",
  secret:
    "Check OIDC client secret exists, is nonempty, readable and mode 0600",
  runtime:
    "Check the cell-mvp-v1 image, storage, resources, namespace map and domain against the runtime contract",
  state:
    "Check private SQLite permissions, exclusive ownership and current schema; configure one environment per owner; do not erase existing allocations",
  oidc: "Check HTTPS issuer discovery, CA trust, client registration and membership mapping",
  admin:
    "Check private socket directory ownership and mode 0700; inspect an existing socket before any manual removal",
  listen: "Check configured listen address and port availability",
} as const;
export type StartupStage = keyof typeof actions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Platform-owned binding only; runtime remains the authority for allocation fields. */
export function validateCellMvpBinding(
  allocation: unknown,
  environments: unknown,
): void {
  if (!isRecord(allocation)) throw new Error("Invalid allocation configuration");
  if (
    "profiles" in allocation ||
    "expectedSpec" in allocation ||
    "expectedPodSpec" in allocation
  )
    throw new Error("Legacy allocation profiles are unsupported");
  if ("securityClass" in allocation)
    throw new Error("securityClass is runtime-fixed and must not be configured");
  if (allocation.template !== "cell-mvp-v1")
    throw new Error("Unsupported allocation template");
  if (typeof allocation.image !== "string" || allocation.image.length === 0)
    throw new Error("Runtime image digest is required");
  if (!Array.isArray(environments) || environments.length === 0)
    throw new Error("At least one environment is required");
  if (
    environments.some(
      (environment) =>
        !isRecord(environment) || environment.template !== allocation.template,
    )
  )
    throw new Error("Environment template must match allocation template");
}

export function startupDiagnostic(stage: StartupStage, correlationId: string) {
  return {
    code: "PlatformStartupRejected",
    stage,
    target: { component: "cell-platform" },
    observedState: "not-listening",
    message: "Platform startup rejected",
    effect: "not-submitted",
    retry: "never",
    correlationId,
    nextAction: actions[stage],
  };
}
