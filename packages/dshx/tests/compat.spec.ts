import { describe, expect, it } from 'vitest'
import { classifyCompatibility, DSH_0_1_COMPATIBILITY, getCompatibilitySmokeMatrix, resolveCompatibility, resolveDeclaredCompatibility } from '../src/compat/index.js'

describe('DSH 0.1 compatibility generation', () => {
  it('pins the official implicit module table baseline', () => {
    expect(DSH_0_1_COMPATIBILITY.client.platformModules).toEqual([
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
    ])
    expect(DSH_0_1_COMPATIBILITY.client.preloadedExternals).toEqual([
      '@deepseek-ai/dsh-client-runtime/client',
      '@deepseek-ai/dsh-client-connection/client',
    ])
  })

  it('distinguishes verified, compatible, and experimental versions in one generation', () => {
    expect(classifyCompatibility('0.1.1-rc.2')).toMatchObject({ compatibility: DSH_0_1_COMPATIBILITY, support: 'verified' })
    expect(resolveCompatibility('0.1.0-rc.9')).toBe(DSH_0_1_COMPATIBILITY)
    expect(classifyCompatibility('0.1.2')).toMatchObject({ compatibility: DSH_0_1_COMPATIBILITY, support: 'compatible' })
    expect(classifyCompatibility('0.1.0-rc.9')).toMatchObject({ compatibility: DSH_0_1_COMPATIBILITY, support: 'experimental' })
  })

  it('rejects a new protocol generation', () => {
    expect(() => resolveCompatibility('0.2.0')).toThrow('DSHX5101')
    expect(classifyCompatibility('0.2.0')).toBeUndefined()
    expect(classifyCompatibility('0.2.0-rc.1')).toBeUndefined()
  })

  it('selects an adapter from a project DSH range', () => {
    expect(resolveDeclaredCompatibility({ devDependencies: { '@deepseek-ai/dsh': '>=0.1.0-rc.8 <0.2.0-0' } })).toMatchObject({ compatibility: DSH_0_1_COMPATIBILITY, support: 'compatible' })
    expect(resolveDeclaredCompatibility({ devDependencies: { '@deepseek-ai/dsh': '0.1.1-rc.2' } })).toMatchObject({ compatibility: DSH_0_1_COMPATIBILITY, support: 'verified' })
    expect(resolveDeclaredCompatibility({ devDependencies: { '@deepseek-ai/dsh': '0.1.1-rc.3' } })).toMatchObject({ compatibility: DSH_0_1_COMPATIBILITY, support: 'experimental' })
    expect(resolveDeclaredCompatibility({ devDependencies: { '@deepseek-ai/dsh': '^0.2.0' } })).toBeUndefined()
  })

  it('derives representative real-smoke boundaries from the adapter registry', () => {
    expect(getCompatibilitySmokeMatrix()).toEqual([
      { generation: '0.1', adapterId: 'dsh-0.1', role: 'minimum', version: '0.1.0-rc.8' },
      { generation: '0.1', adapterId: 'dsh-0.1', role: 'latest', version: '0.1.1-rc.2' },
    ])
  })
})
