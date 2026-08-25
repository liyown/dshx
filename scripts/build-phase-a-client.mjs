import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildClient, buildHost } from '../packages/dshx/dist/index.js'

const root = fileURLToPath(new URL('../fixtures/phase-a', import.meta.url))
const manifest = JSON.parse(await readFile(new URL('../fixtures/phase-a/package.json', import.meta.url), 'utf8'))

await buildClient({
  packageId: '@dshx/phase-a-fixture',
  root,
  entry: 'src/client.tsx',
  outDir: 'dist',
  inject: manifest.dsh.client.inject,
})

await buildHost({
  packageId: '@dshx/phase-a-fixture',
  logicalName: '@dshx/phase-a-fixture',
  root,
  entry: 'src/host.ts',
  outDir: 'dist',
})
