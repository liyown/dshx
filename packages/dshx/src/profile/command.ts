import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DshCommandResult, DshCommandRunner } from './types.js'

const MAX_COMMAND_OUTPUT_BYTES = 10 * 1024 * 1024

const NOT_FOUND = /(?:command ["']?dsh["']? not found|dsh: (?:command )?not found|not recognized as an internal or external command)/i

async function execute(command: string, args: readonly string[], options: Parameters<DshCommandRunner>[1]): Promise<DshCommandResult> {
  const result = await execa(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    reject: false,
    timeout: options.timeoutMs,
  })
  return {
    ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.code === undefined ? {} : { failureCode: result.code }),
    ...(result.failed ? { cause: result } : {}),
    executable: command === 'pnpm' ? 'local' : 'global',
  }
}

/** Execute DSH with the project-local pnpm shim first, then the user's PATH. */
export const runProjectDsh: DshCommandRunner = async (args, options) => {
  let localStderr = ''
  const localBin =
    process.platform === 'win32'
      ? [resolve(options.cwd, 'node_modules/.bin/dsh.cmd'), resolve(options.cwd, 'node_modules/.bin/dsh.CMD')]
      : [resolve(options.cwd, 'node_modules/.bin/dsh')]
  if (options.executable !== 'global' && localBin.some(existsSync)) {
    const local = await execute('pnpm', ['exec', 'dsh', ...args], options)
    localStderr = local.stderr
    if (local.failureCode === 'ENOENT') {
      const localPath = localBin.find(existsSync)
      if (localPath !== undefined) {
        const direct = await execute(localPath, args, options)
        if (direct.exitCode === 0 || direct.exitCode !== undefined || direct.failureCode !== 'ENOENT') {
          return { ...direct, executable: 'local' }
        }
      }
    }
    if (local.exitCode === 0 || (!NOT_FOUND.test(local.stderr) && !NOT_FOUND.test(local.stdout) && local.failureCode !== 'ENOENT')) return local
  }
  const global = await execute('dsh', args, options)
  if (global.exitCode === 0 || global.exitCode !== undefined || global.failureCode !== 'ENOENT') return global
  return { ...global, stderr: [localStderr, global.stderr].filter(Boolean).join('\n') }
}
