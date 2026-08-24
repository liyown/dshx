import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const CANCEL = Symbol('clack:cancel')

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(async () => true),
  text: vi.fn(async () => CANCEL),
  isCancel: (value: unknown) => value === CANCEL,
}))

describe('create-dshx interactive cancellation', () => {
  it('returns the shell cancellation exit code without creating a project', async () => {
    const { runCreate } = await import('../src/cli.js')
    const input = new PassThrough() as PassThrough & { isTTY?: boolean }
    input.isTTY = true
    const output = new PassThrough()
    const chunks: Buffer[] = []
    output.on('data', chunk => chunks.push(Buffer.from(chunk)))
    await expect(runCreate([], { stdin: input, stdout: output, stderr: output })).resolves.toBe(130)
    expect(Buffer.concat(chunks).toString()).toContain('Operation cancelled.')
  })
})
