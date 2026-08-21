import { fileURLToPath } from 'node:url'
import { buildClient, buildHost } from '../packages/dshx/dist/index.js'

const root = fileURLToPath(new URL('../fixtures/phase-a', import.meta.url))

await buildClient({
  packageId: '@dshx/phase-a-fixture',
  root,
  entry: 'src/client.tsx',
  outDir: 'dist',
})

await buildHost({
  packageId: '@dshx/phase-a-fixture',
  logicalName: '@dshx/phase-a-fixture',
  root,
  entry: 'src/host.ts',
  outDir: 'dist',
})
