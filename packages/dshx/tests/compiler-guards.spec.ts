import { describe, expect, it } from 'vitest'
import { containsPrivateDshxImport } from '../src/compiler/private-imports.js'
import { resolveVitePlugins } from '../src/config/vite-plugins.js'

describe('private runtime import guard', () => {
  it.each([
    `import { defineHost } from '@becomeopc/dshx/host'`,
    `import '@becomeopc/dshx/client'`,
    `await import('@becomeopc/dshx/tooling')`,
    `require('@becomeopc/dshx/settings')`,
    `export { method } from '@becomeopc/dshx/api'`,
  ])('detects an executable DSHX request in %s', code => {
    expect(containsPrivateDshxImport(code)).toBe(true)
  })

  it('does not mistake an installed source path for an import', () => {
    expect(containsPrivateDshxImport('/tmp/node_modules/.pnpm/@becomeopc+dshx/node_modules/@becomeopc/dshx/dist/client/runtime.js')).toBe(false)
    expect(containsPrivateDshxImport('The public API is @becomeopc/dshx/client.')).toBe(false)
  })
})

describe('build-watch plugin selection', () => {
  it('drops serve branches while retaining sibling build branches', async () => {
    const scan = { name: 'scan' }
    const serve = { name: 'generate:serve', apply: 'serve' as const }
    const build = { name: 'generate:build', apply: 'build' as const }
    await expect(resolveVitePlugins([[scan, serve, build]], true)).resolves.toEqual([scan, build])
  })

  it('rejects a plugin option that has no build-watch branch', async () => {
    await expect(resolveVitePlugins([{ name: 'serve-only', apply: 'serve' }], true)).rejects.toMatchObject({ code: 'DSHX1402' })
  })
})
