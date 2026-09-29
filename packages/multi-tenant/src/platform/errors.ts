import {
  EnvironmentError,
  type EnvironmentFailure,
} from "@dsh/environment-connector-internal";
/** Platform state errors are separate from the runtime's fixed error vocabulary. */
export class PlatformError extends Error {
  constructor(
    readonly code: string,
    readonly correlationId: string,
    readonly nextAction: string,
    readonly target: { allocationKey?: string } = {},
    readonly detail: {
      stage?: string;
      effect?: "unknown" | "accepted" | "not-submitted";
    } = {},
  ) {
    super(code);
  }
  toJSON() {
    return {
      code: this.code,
      correlationId: this.correlationId,
      nextAction: this.nextAction,
      allocationKey: this.target.allocationKey ?? "",
      stage: this.detail.stage ?? "access",
      effect: this.detail.effect ?? "not-submitted",
      observedState: "unverified",
      retry: "read-first",
    };
  }
}
export function diagnostic(
  error: unknown,
  correlationId: string,
): EnvironmentFailure | ReturnType<PlatformError["toJSON"]> {
  if (error instanceof EnvironmentError) return error.toJSON();
  if (error instanceof PlatformError) return error.toJSON();
  return new PlatformError(
    "StateUnavailable",
    correlationId,
    "Inspect the original environment and private state; do not replay writes",
    {},
    { effect: "unknown" },
  ).toJSON();
}
