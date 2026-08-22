import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, relative, sep } from 'node:path'

export interface FilePlan {
  readonly file: string
  readonly before?: string
  readonly after: string
}

export function insideProject(root: string, target: string): boolean {
  const path = relative(root, target)
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep)
}

export async function readOptionalFile(file: string): Promise<string | undefined> {
  try { return await readFile(file, 'utf8') } catch { return undefined }
}

export function renderFileDiff(plan: readonly FilePlan[]): string {
  return plan.map(item => `--- ${item.file}\n+++ ${item.file}\n${item.after.split('\n').map(line => `+${line}`).join('\n')}\n`).join('\n')
}

export async function applyFilePlan(plan: readonly FilePlan[]): Promise<void> {
  const applied: FilePlan[] = []
  const temps: string[] = []
  try {
    for (let index = 0; index < plan.length; index += 1) {
      const item = plan[index]!
      await mkdir(dirname(item.file), { recursive: true })
      const temp = `${item.file}.dshx-tmp-${process.pid}-${index}`
      temps.push(temp)
      await writeFile(temp, item.after, 'utf8')
      await rename(temp, item.file)
      applied.push(item)
    }
  } catch (cause) {
    await rollbackFilePlan(applied)
    for (const temp of temps) await unlink(temp).catch(() => undefined)
    throw cause
  }
}

export async function rollbackFilePlan(plan: readonly FilePlan[]): Promise<void> {
  for (const item of [...plan].reverse()) {
    if (item.before === undefined) await unlink(item.file).catch(() => undefined)
    else await writeFile(item.file, item.before, 'utf8').catch(() => undefined)
  }
}
