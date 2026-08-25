export type ProductExperienceStage =
  | 'identity'
  | 'tenant-mcp-config'
  | 'principal-credential'
  | 'session-ownership'
  | 'mcp-setup'
  | 'mcp-discovery'

export type ProductExperienceErrorCode =
  | 'IDENTITY_RESOLUTION_FAILED'
  | 'TENANT_MCP_CONFIG_FAILED'
  | 'PRINCIPAL_CREDENTIAL_FAILED'
  | 'SESSION_ACCESS_DENIED'
  | 'SESSION_OWNERSHIP_CONFLICT'
  | 'MCP_SETUP_FAILED'
  | 'MCP_DISCOVERY_FAILED'
  | 'PRODUCT_RUNTIME_FAILED'

export interface ProductDiagnostic {
  readonly code: ProductExperienceErrorCode
  readonly stage: ProductExperienceStage
  readonly message: string
}

/**
 * Product-facing failure with a deliberately safe message.
 *
 * The original cause is retained for server-side logs/debugging but is never
 * included by `toProductDiagnostic()`. Product adapters must not copy arbitrary
 * cause messages into browser responses because credentials may be present in
 * vendor/auth errors.
 */
export class ProductExperienceError extends Error {
  override name = 'ProductExperienceError'

  constructor(
    readonly code: ProductExperienceErrorCode,
    readonly stage: ProductExperienceStage,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

export function productExperienceError(
  code: ProductExperienceErrorCode,
  stage: ProductExperienceStage,
  message: string,
  cause?: unknown,
): ProductExperienceError {
  if (cause instanceof ProductExperienceError) return cause
  return new ProductExperienceError(code, stage, message, cause === undefined ? undefined : { cause })
}

/** Return only the stable, secret-safe portion of one product failure. */
export function toProductDiagnostic(error: unknown): ProductDiagnostic {
  if (error instanceof ProductExperienceError) {
    return Object.freeze({
      code: error.code,
      stage: error.stage,
      message: error.message,
    })
  }
  return Object.freeze({
    code: 'PRODUCT_RUNTIME_FAILED',
    stage: 'mcp-setup',
    message: 'The product runtime could not complete the request.',
  })
}
