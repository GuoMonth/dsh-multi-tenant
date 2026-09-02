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
  version: '0.1.2-alpha.5',
  commit: 'db6bdc3576c2d4e7c965e8e3ed0c2a731eed87f5',
})
