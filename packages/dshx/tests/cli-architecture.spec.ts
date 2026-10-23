import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const cli = (file: string): URL => new URL(`../src/cli/${file}`, import.meta.url)
const commands = async (): Promise<string[]> => readdir(new URL('../src/cli/commands/', import.meta.url))

describe('CLI architecture', () => {
  it('renders every --json document through the one report renderer', async () => {
    const files = ['run.ts', ...(await commands()).map(name => `commands/${name}`)]
    const offenders: string[] = []
    for (const file of files) {
      const source = await readFile(cli(file), 'utf8')
      if (/JSON\.stringify\([^)]*null,\s*2\)/.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('runs every command’s shared checks through preflight', async () => {
    for (const name of await commands()) {
      const source = await readFile(cli(`commands/${name}`), 'utf8')
      expect(source, name).not.toMatch(/\bdetectInstalledDshVersion\(|\bprojectCompatibilityDiagnostics\(|\bcheckMigrationDiagnostics\(|\btypecheckProject\(/)
    }
  })

  it('keeps run.ts to dispatch and usage', async () => {
    const source = await readFile(cli('run.ts'), 'utf8')
    for (const command of ['add', 'build', 'check', 'dev', 'inspect']) expect(source).toContain(`from './commands/${command}.js'`)
    expect(source).not.toMatch(/\bprintCompatibilitySummary|\bbuildHost\(|\bstartDevSession\(|\binspectProjectComposition\(/)
  })
})
