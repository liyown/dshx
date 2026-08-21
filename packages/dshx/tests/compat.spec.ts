import { describe, expect, it } from 'vitest'
import { RC8_COMPATIBILITY, resolveCompatibility } from '../src/compat/index.js'

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

  it('rejects an unverified DSH version', () => {
    expect(() => resolveCompatibility('0.1.0-rc.9')).toThrow('DSHX5101')
  })
})
