import assert from 'node:assert/strict'
import { readJson, record, string } from './json.ts'

export function readPlatformCandidate(path: string) {
  const candidate = record(readJson(path), 'platform candidate')
  const archive = record(candidate.package, 'platform package')
  return {
    ...candidate,
    repository: string(candidate.repository, 'candidate repository'),
    dsh: record(candidate.dsh, 'DSH identity'),
    runId: candidate.runId,
    commit: string(candidate.commit, 'platform commit'),
    version: string(candidate.version, 'platform version'),
    platformImage: string(candidate.platformImage, 'platform image'),
    package: {
      ...archive,
      name: string(archive.name, 'package name'),
      filename: string(archive.filename, 'package filename'),
      integrity: string(archive.integrity, 'package integrity'),
    },
    connector: record(candidate.connector, 'Connector provenance'),
  }
}

export function readRuntimeCandidate(path: string) {
  const candidate = record(readJson(path), 'runtime candidate')
  return {
    ...candidate,
    repository: string(candidate.repository, 'candidate repository'),
    dsh: record(candidate.dsh, 'DSH identity'),
    runId: candidate.runId,
    commit: string(candidate.commit, 'runtime commit'),
    version: string(candidate.version, 'runtime version'),
    workloadImage: string(candidate.workloadImage, 'workload image'),
  }
}

export function assertPrepareRun(value: unknown) {
  const run = record(value, 'preparation run')
  assert.equal(run.conclusion, 'success')
  assert.equal(run.head_branch, 'main')
  assert.equal(run.event, 'workflow_dispatch')
  assert.equal(run.path, '.github/workflows/prepare-release.yml')
  return string(run.head_sha, 'preparation run commit')
}
