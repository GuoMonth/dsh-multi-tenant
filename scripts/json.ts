import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export function parseJson(text: string): unknown {
  return JSON.parse(text)
}

export function readJson(path: string | URL): unknown {
  return parseJson(readFileSync(path, 'utf8'))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function record(value: unknown, name: string): Record<string, unknown> {
  assert.ok(isRecord(value), `Expected an object for ${name}`)
  return value
}

export function list(value: unknown, name: string): unknown[] {
  assert.ok(Array.isArray(value), `Expected an array for ${name}`)
  return value
}

export function string(value: unknown, name: string): string {
  assert.ok(typeof value === 'string', `Expected a string for ${name}`)
  return value
}

export function requiredEnv(name: string): string {
  const value = process.env[name]
  assert.ok(value, `${name} is required`)
  return value
}
