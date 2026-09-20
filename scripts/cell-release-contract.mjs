/** Reject mixing a historical runtime release with the current platform combination. */
export function verifyCellRelease(expected, accepted, tag, images) {
  if (accepted?.sourceSHA !== expected.runtime.commit || accepted.version !== tag ||
      accepted.baseline?.source?.commit !== expected.dsh.commit ||
      accepted.baseline?.source?.version !== expected.dsh.version ||
      !images.cell || !images.operator || accepted.images?.cell !== images.cell || accepted.images?.operator !== images.operator) {
    throw new Error('Runtime release source, DSH or image combination mismatch; do not substitute standalone images')
  }
}
