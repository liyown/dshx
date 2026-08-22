import type { DshCompatibility } from './types.js'

/** DSH 0.1 protocol adapter, verified against the rc.8 baseline. */
export const RC8_COMPATIBILITY: DshCompatibility = {
  id: 'dsh-0.1',
  protocolGeneration: '0.1',
  version: '0.1.0-rc.8',
  dshRange: '>=0.1.0-rc.8 <0.2.0',
  verifiedVersions: ['0.1.0-rc.8', '0.1.1-rc.2'],
  nodeRange: '^22.19.0 || >=24.0.0',
  profile: { listCommand: 'plugin-list-json', addCommand: 'plugin-add' },
  runtimePlugins: [
    {
      id: 'cordis-host-runner',
      packageName: '@deepseek-ai/dsh-cordis-host-runner',
      load: 'default',
      provides: ['cordisInspect'],
      optional: true,
    },
    {
      id: 'tool-cordis',
      packageName: '@deepseek-ai/dsh-tool-cordis',
      load: 'module',
      provides: ['Service', 'Event'],
      optional: true,
    },
  ],
  inspect: {
    targets: ['slots', 'tools', 'services', 'events'],
    provider: 'unavailable',
    providerByTarget: {
      slots: 'runtime',
      tools: 'unavailable',
      services: 'runtime',
      events: 'runtime',
    },
    bridge: {
      protocolVersion: 1,
      serviceProvider: 'Service',
      eventProvider: 'Event',
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
