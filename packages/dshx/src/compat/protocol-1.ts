import type { DshCompatibility } from './types.js'

const VERIFIED_PROTOCOL_1_VERSIONS = ['0.1.0-rc.8', '0.1.1-rc.2'] as const

/** Adapter for the first observable DSH contract generation. */
export const PROTOCOL_1_COMPATIBILITY: DshCompatibility = {
  id: 'protocol-1',
  protocolGeneration: 'protocol-1',
  lifecycle: 'active',
  version: '0.1.0-rc.8',
  dshRange: '>=0.1.0-rc.8 <0.2.0-0',
  verified: {
    minimum: VERIFIED_PROTOCOL_1_VERSIONS[0],
    latest: VERIFIED_PROTOCOL_1_VERSIONS[1],
  },
  verifiedVersions: VERIFIED_PROTOCOL_1_VERSIONS,
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
  connection: {
    packageName: '@deepseek-ai/dsh-client-connection',
    clientModule: '@deepseek-ai/dsh-client-connection/client',
    protocolVersion: 1,
    hostRpc: true,
    clientRpc: true,
    hookDrivenCapabilityInference: true,
    defaultAuthority: 'loopback',
  },
  hostContributions: {
    commands: true,
    promptSections: true,
    promptContexts: true,
    settings: true,
  },
  session: {
    customDurableEventVocabulary: false,
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
    preloadedExternals: ['@deepseek-ai/dsh-client-runtime/client', '@deepseek-ai/dsh-client-connection/client'],
    settings: {
      packageName: '@deepseek-ai/dsh-client-ui-settings',
      service: 'settingsScope',
      hookDrivenCapabilityInference: true,
    },
    conversation: {
      runtimePackageName: '@deepseek-ai/dsh-client-runtime',
      rendererPackageName: '@deepseek-ai/dsh-client-ui-conversation',
      eventService: 'conversationEvents',
      slotService: 'slots',
      componentContributions: true,
      verification: 'experimental',
    },
    manifest: {
      platform: 'web',
      moduleRequestsField: 'external',
      packageEdgesField: 'inject',
    },
  },
}

/** @deprecated Use PROTOCOL_1_COMPATIBILITY. */
export const DSH_0_1_COMPATIBILITY = PROTOCOL_1_COMPATIBILITY

/** @deprecated Use PROTOCOL_1_COMPATIBILITY. */
export const RC8_COMPATIBILITY = PROTOCOL_1_COMPATIBILITY
