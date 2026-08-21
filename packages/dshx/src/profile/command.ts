import { execa } from 'execa'
import type { DshCommandRunner } from './types.js'

const MAX_COMMAND_OUTPUT_BYTES = 10 * 1024 * 1024

/** Execute the project-local DSH binary without consulting a global fallback. */
export const runProjectDsh: DshCommandRunner = async (args, options) => {
  const result = await execa('pnpm', ['exec', 'dsh', ...args], {
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
  }
}
