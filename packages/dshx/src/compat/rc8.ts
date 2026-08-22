import type { DshCompatibility } from './types.js'

/** Client build protocol verified against DeepSeek Harness 0.1.0-rc.8. */
export const RC8_COMPATIBILITY: DshCompatibility = {
  id: 'dsh-0.1',
  protocolGeneration: '0.1',
  version: '0.1.0-rc.8',
  dshRange: '>=0.1.0-rc.8 <0.2.0',
  verifiedVersions: ['0.1.0-rc.8'],
  nodeRange: '^22.19.0 || >=24.0.0',
  profile: { listCommand: 'plugin-list-json', addCommand: 'plugin-add' },
  inspect: {
    targets: ['slots', 'tools', 'services', 'events'],
    provider: 'unavailable',
    providerByTarget: {
      slots: 'unavailable',
      tools: 'unavailable',
      services: 'runtime',
      events: 'runtime',
    },
  },
  client: {
    platformModules: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
    ],
    preloadedExternals: [
      '@deepseek-ai/dsh-client-runtime/client',
    ],
    manifest: {
      platform: 'web',
      moduleRequestsField: 'external',
      packageEdgesField: 'inject',
    },
  },
}
