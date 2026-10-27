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
  version: '0.2.1-rc.3',
  commit: '1f81c047fc48fa190a683e469daa699857e9afe8',
})
