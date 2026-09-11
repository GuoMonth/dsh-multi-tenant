import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

/** Linux O_PATH is not exported by Node's fs.constants. Capture the socket inode,
 * refusing symlinks; later connects via procfs cannot follow a replaced pathname.
 * The containing directory must be a platform-owned mount point, not replaceable
 * by the workload. The runtime owns this descriptor until disposal.
 */
export async function openPrivateSocket(path: string) {
  const file = await open(path, 0x200000 /* O_PATH */ | constants.O_NOFOLLOW)
  try {
    if (!(await file.stat()).isSocket()) throw new Error('Runtime transport must be a Unix socket, not a link')
    return { file, path: `/proc/self/fd/${file.fd}` }
  } catch (error) { await file.close(); throw error }
}

/** Workload-written readiness is untrusted. Never follow links or block on FIFOs. */
export async function readRuntimeReady(path: string): Promise<unknown> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    if (!(await file.stat()).isFile()) throw new Error('Runtime readiness must be a regular file')
    const bytes = Buffer.alloc(16_385)
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
    if (bytesRead === bytes.length) throw new Error('Runtime readiness exceeds 16 KiB')
    return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')) as unknown
  } finally { await file.close() }
}
