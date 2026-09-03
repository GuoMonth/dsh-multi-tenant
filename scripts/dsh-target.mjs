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
  version: '0.1.2-rc.1',
  commit: 'a66e4702047846cdaa10c66c9d3df3951f5ea70d',
})
