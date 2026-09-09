/**
 * Exact DeepSeek Harness compatibility baseline for this repository.
 *
 * The baseline is intentionally explicit and manually advanced. At each
 * convergence point we select the current upstream release, pin both its npm
 * version and release commit, then let CI prove our contracts against that
 * immutable identity. CI never follows a floating `latest` or `master`.
 */
export const DSH_TARGET = Object.freeze({
  repository: 'deepseek-ai/deepseek-harness',
  version: '0.1.5-alpha.1',
  commit: '5dda764ed3aa172535a7967b06ff95d9cbfe536a',
})
