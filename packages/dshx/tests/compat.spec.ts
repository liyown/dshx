import { describe, expect, it } from 'vitest'
import { classifyCompatibility, RC8_COMPATIBILITY, resolveCompatibility, resolveDeclaredCompatibility } from '../src/compat/index.js'

describe('rc.8 compatibility', () => {
  it('pins the official implicit module table baseline', () => {
    expect(RC8_COMPATIBILITY.client.platformModules).toEqual([
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
    ])
    expect(RC8_COMPATIBILITY.client.preloadedExternals).toEqual([
      '@deepseek-ai/dsh-client-runtime/client',
    ])
  })

  it('accepts an unverified version inside the same protocol range', () => {
    expect(resolveCompatibility('0.1.0-rc.9')).toBe(RC8_COMPATIBILITY)
    expect(classifyCompatibility('0.1.0-rc.9')).toMatchObject({ compatibility: RC8_COMPATIBILITY, support: 'compatible-range' })
    expect(classifyCompatibility('0.1.1-rc.2')).toMatchObject({ compatibility: RC8_COMPATIBILITY, support: 'compatible-range' })
  })

  it('rejects a new protocol generation', () => {
    expect(() => resolveCompatibility('0.2.0')).toThrow('DSHX5101')
    expect(classifyCompatibility('0.2.0')).toBeUndefined()
  })

  it('selects an adapter from a project DSH range', () => {
    expect(resolveDeclaredCompatibility({ devDependencies: { '@deepseek-ai/dsh': '>=0.1.0-rc.8 <0.2.0' } })).toMatchObject({ compatibility: RC8_COMPATIBILITY })
    expect(resolveDeclaredCompatibility({ devDependencies: { '@deepseek-ai/dsh': '^0.2.0' } })).toBeUndefined()
  })
})
