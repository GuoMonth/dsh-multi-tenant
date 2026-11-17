import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.go'], {
  cwd: root,
  encoding: 'utf8',
})
if (files.error) throw files.error
if (files.status !== 0) throw new Error('Cannot enumerate Go sources')
const go = files.stdout.split('\0').filter(Boolean)
if (go.length) {
  const formatted = spawnSync('gofmt', ['-w', ...go], { cwd: root, stdio: 'inherit' })
  if (formatted.error) throw formatted.error
  if (formatted.status !== 0) throw new Error('gofmt failed')
}
const args = [resolve(root, 'node_modules/oxlint/bin/oxlint'), '--config', '.oxlintrc.format.json', '--fix']
// Overlapping stylistic fixes may expose another fix in the same statement.
for (let pass = 0; pass < 3; pass++) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 1 || pass === 2) {
    process.stdout.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    if (result.signal) process.kill(process.pid, result.signal)
    else process.exitCode = result.status ?? 1
    break
  }
}
