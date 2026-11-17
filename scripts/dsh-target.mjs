/**
 * Exact DeepSeek Harness compatibility baseline for this repository.
 *
 * This module is the only statement of the pin. Package `dshRuntime`,
 * `DSH_RUNTIME_VERSION`, `charts/dsh-platform/files/sources.json`, Chart
 * `appVersion` and the consumer smoke assertion are copies checked against it.
 * Advance the pin here, then update those copies in the same change.
 * CI never follows a floating `latest` or `master`.
 */
export const DSH_TARGET = Object.freeze({
  repository: 'deepseek-ai/deepseek-harness',
  version: '0.2.2-rc.3',
  commit: '38a6a5c965aa99ab525161efb7cc5cf1fe62fced',
})
