/**
 * Single source of truth for the DeepSeek Harness prerelease used by executable
 * compatibility evidence in this repository.
 *
 * v0.2 changes the multi-tenant architecture, not the dependency-resolution
 * baseline. Keep the already-proven RC7 closure here; upgrading the complete
 * DSH package graph is an independent follow-up. Historical documents keep the
 * versions they actually proved.
 */
export const DSH_TARGET_VERSION = '0.1.0-rc.7'
export const DSH_TARGET_RELEASE_COMMIT = '99f6f02fecdb7dff40c3fbc9470f5907c29f74ca'
