/** Fixed diagnostics only: dependency errors can contain URLs, tokens or file contents. */
const actions = {
  configuration:
    "Check current configuration fields and membership definitions",
  secret:
    "Check OIDC client secret exists, is nonempty, readable and mode 0600",
  runtime: "Check tenant namespace map, domain and pinned allocation profiles",
  state:
    "Check private SQLite permissions, exclusive ownership and current schema; configure one environment per owner; do not erase existing allocations",
  oidc: "Check HTTPS issuer discovery, CA trust, client registration and membership mapping",
  admin:
    "Check private socket directory ownership and mode 0700; inspect an existing socket before any manual removal",
  listen: "Check configured listen address and port availability",
} as const;
export type StartupStage = keyof typeof actions;
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
