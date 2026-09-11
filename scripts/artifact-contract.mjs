/** Verify every declared export resolves inside the actual installed/packed artifact. */
export function assertExportFiles(exports, has) {
  const visit = value => {
    if (typeof value === 'string') {
      if (!value.startsWith('./') || !has(value.slice(2))) throw new Error(`export target missing: ${value}`)
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) visit(child)
    } else throw new Error('invalid export declaration')
  }
  if (!exports || !Object.keys(exports).length) throw new Error('exports missing')
  visit(exports)
}
