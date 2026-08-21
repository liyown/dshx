import { execa } from 'execa'
import type { CommandRunner, PackageManager } from './types.js'

export const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  const result = await execa(command, args, { cwd: options.cwd, reject: false })
  return { exitCode: result.exitCode ?? (result.failed ? 1 : 0), stdout: result.stdout, stderr: result.stderr }
}

export async function commandAvailable(command: string, runner = defaultCommandRunner): Promise<boolean> {
  const result = await runner('which', [command], { cwd: process.cwd() })
  return result.exitCode === 0
}

export function installCommand(manager: PackageManager): { readonly command: string; readonly args: readonly string[] } {
  return { command: manager, args: ['install'] }
}
