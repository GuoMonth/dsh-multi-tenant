/** Fixed diagnostics only: dependency errors can contain URLs, tokens or file contents. */
const actions = {
  configuration:
    'Check the platform configuration schema and the fixed adapter module path',
  secret:
    'Check OIDC client secret exists, is nonempty, readable and mode 0600',
  runtime:
    'Check the trusted adapter module, environment contract version and adapter options',
  state:
    'Check private SQLite permissions, exclusive ownership and current schema; check owner bindings; do not erase existing allocations',
  oidc: 'Check HTTPS issuer discovery, CA trust, client registration and membership mapping',
  admin:
    'Check private socket directory ownership and mode 0700; inspect an existing socket before any manual removal',
  listen: 'Check configured listen address and port availability',
} as const
export type StartupStage = keyof typeof actions

export function startupDiagnostic(stage: StartupStage, correlationId: string) {
  return {
    code: 'PlatformStartupRejected',
    stage,
    target: { component: 'environment-platform' },
    observedState: 'not-listening',
    message: 'Platform startup rejected',
    effect: 'not-submitted',
    retry: 'never',
    correlationId,
    nextAction: actions[stage],
  }
}
