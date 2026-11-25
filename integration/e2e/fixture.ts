import { z } from 'zod'
import { resolve } from 'node:path'
import { parseJson, readJson } from '../../scripts/json.ts'

const user = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  userID: z.string().min(1),
  password: z.string().min(1),
  hash: z.string().min(1),
})

export function readUsers(root: string) {
  return z.array(user).parse(readJson(resolve(root, 'users.json')))
}

const container = z.object({ NetworkSettings: z.object({ Networks: z.object({ kind: z.object({ IPAddress: z.string().min(1) }) }) }) })

export function dockerNodeAddress(output: string): string {
  const [node] = z.tuple([container]).parse(parseJson(output))
  return node.NetworkSettings.Networks.kind.IPAddress
}
