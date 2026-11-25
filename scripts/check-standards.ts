#!/usr/bin/env node
// Dependency-free source checks: no package installation, builds or clusters.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const root = path.resolve(import.meta.dirname, '..')
process.chdir(root)
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  encoding: 'utf8',
}).split('\0').filter(Boolean)
const errors = []
for (const file of files) {
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile())
    continue
  const bytes = fs.readFileSync(file)
  if (bytes.includes(0))
    continue
  let source
  try {
    source = new TextDecoder('utf-8', {
      fatal: true,
    }).decode(bytes)
  }
  catch {
    errors.push(`${file}: invalid UTF-8`)
    continue
  }
  if (source.includes('\r'))
    errors.push(`${file}: use LF, not CR/CRLF`)
  if (source && !source.endsWith('\n'))
    errors.push(`${file}: missing final newline`)
  if (/[^\S\n]+$/m.test(source))
    errors.push(`${file}: trailing whitespace`)
  try {
    if (file.endsWith('.json'))
      JSON.parse(source)
    if (/\.(?:mjs|cjs|js)$/.test(file))
      execFileSync(process.execPath, ['--check', file], {
        stdio: 'pipe',
      })
    if (file.endsWith('.py'))
      execFileSync('python3', ['-c', 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(), filename=sys.argv[1])', file], {
        stdio: 'pipe',
      })
    if (file.endsWith('.sh') || /^#!.*\bbash\b/.test(source))
      execFileSync('bash', ['-n', file], {
        stdio: 'pipe',
      })
  }
  catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? error.stderr : undefined
    const details = Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : typeof stderr === 'string' ? stderr.trim() : ''
    errors.push(`${file}: ${details || (error instanceof Error ? error.message : 'Source check failed')}`)
  }
}
const go = files.filter(file => file.endsWith('.go'))
if (go.length) {
  const unformatted = execFileSync('gofmt', ['-l', ...go], {
    encoding: 'utf8',
  }).trim()
  if (unformatted)
    errors.push(`Run gofmt on:\n${unformatted}`)
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
else
  console.log(`Source standards passed (${files.length} tracked files)`)
