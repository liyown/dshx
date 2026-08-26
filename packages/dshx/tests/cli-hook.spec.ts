import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { parseCliArgs } from '../src/cli/args.js'
import { runCli } from '../src/cli/run.js'
import type { CliIO } from '../src/cli/run.js'
import type { ResolvedDshxConfig } from '../src/config/types.js'

function project(): ResolvedDshxConfig {
  return {
    root: '/project/plugin',
    packageFile: '/project/plugin/package.json',
    configDependencies: [],
    packageId: 'demo-plugin',
    name: 'demo-plugin',
    hostEntry: '/project/plugin/src/host.ts',
    outDir: '/project/plugin/dist',
    profile: 'web',
    dev: { hostRestart: 'manual' },
    build: { sourcemap: true },
    compatibility: { allowUnsupported: false },
    manifest: { name: 'demo-plugin' },
  }
}

function io(): CliIO & { out: PassThrough; err: PassThrough } {
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean }
  stdin.isTTY = false
  const out = new PassThrough()
  const err = new PassThrough()
  return { stdin, stdout: out, stderr: err, out, err }
}

async function text(stream: PassThrough): Promise<string> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

describe('add hook CLI', () => {
  it('parses hook options and invokes the injected generator', async () => {
    expect(parseCliArgs(['add', 'hook', '--event', 'agent.ready', '--file', 'src/hooks/ready.ts', '--dry-run', '--json'])).toMatchObject({
      command: 'add',
      addTarget: 'hook',
      event: 'agent.ready',
      file: 'src/hooks/ready.ts',
      dryRun: true,
      json: true,
    })
    const streams = io()
    const addHook = vi.fn(async (value: { event: string; dryRun?: boolean }) => ({
      root: '/project/plugin',
      event: value.event,
      changedFiles: ['/project/plugin/src/hooks/ready.ts'],
      generatedFiles: ['/project/plugin/src/hooks/ready.ts'],
      diagnostics: [],
      dryRun: value.dryRun ?? false,
    }))
    const code = await runCli(['add', 'hook', '--event', 'agent.ready', '--dry-run', '--json'], {
      io: streams,
      runtime: { resolveConfig: async () => project(), addHook },
    })
    expect(code).toBe(0)
    expect(addHook).toHaveBeenCalledWith(expect.objectContaining({ event: 'agent.ready', dryRun: true }))
    streams.out.end()
    streams.err.end()
    expect(JSON.parse(await text(streams.out))).toMatchObject({ event: 'agent.ready', dryRun: true, diagnostics: [] })
  })

  it('rejects a missing event in non-interactive and JSON modes', async () => {
    const streams = io()
    const code = await runCli(['add', 'hook'], { io: streams, runtime: { resolveConfig: async () => project() } })
    expect(code).toBe(2)
    streams.out.end()
    streams.err.end()
    await expect(text(streams.err)).resolves.toContain('DSHX6301')
  })
})
