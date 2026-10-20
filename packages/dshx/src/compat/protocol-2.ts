import type { DshCompatibility } from './types.js'

const VERIFIED_PROTOCOL_2_VERSIONS = ['0.2.1-rc.2'] as const

/**
 * Adapter for the DSH 0.2 generation. This generation removes the monolithic
 * Client Runtime, projects plugin Config schemas as Settings, registers
 * Conversation through uiConversation, and uses peer-admitted Connection RPC.
 *
 * The npm 0.2.1-rc.2 artifact is currently built from stale profile-boot code;
 * the verified runtime evidence comes from the dsh-v0.2.1-rc.2 source tag.
 */
export const PROTOCOL_2_COMPATIBILITY: DshCompatibility = {
  id: 'protocol-2',
  protocolGeneration: 'protocol-2',
  lifecycle: 'active',
  version: '0.2.1-rc.2',
  dshRange: '>=0.2.1-rc.2 <0.3.0-0',
  verified: {
    minimum: VERIFIED_PROTOCOL_2_VERSIONS[0],
    latest: VERIFIED_PROTOCOL_2_VERSIONS[0],
    sourceTag: 'dsh-v0.2.1-rc.2',
  },
  verifiedVersions: VERIFIED_PROTOCOL_2_VERSIONS,
  verificationSource: 'source',
  nodeRange: '^22.19.0 || >=24.0.0',
  profile: {
    listCommand: 'plugin-list-json',
    addCommand: 'plugin-add',
    orderedPatchPaths: true,
    launcherReady: true,
  },
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
      provides: ['Service', 'Event', 'Config', 'Tool'],
      optional: true,
    },
  ],
  inspect: {
    targets: ['tools', 'services', 'events', 'configs'],
    provider: 'runtime',
    providerByTarget: {
      tools: 'runtime',
      services: 'runtime',
      events: 'runtime',
      configs: 'runtime',
    },
    bridge: {
      protocolVersion: 2,
      serviceProvider: 'Service',
      eventProvider: 'Event',
      toolProvider: 'Tool',
      configProvider: 'Config',
      compositionScope: true,
    },
  },
  connection: {
    packageName: '@deepseek-ai/dsh-client-connection',
    clientModule: '@deepseek-ai/dsh-client-connection/client',
    protocolVersion: 2,
    hostRpc: true,
    clientRpc: true,
    hookDrivenCapabilityInference: true,
    peerAdmission: true,
    remoteNamespace: 'remote',
  },
  hostContributions: {
    commands: true,
    promptSections: true,
    promptContexts: true,
    settings: true,
    settingsMode: 'config',
  },
  session: {
    customDurableEventVocabulary: false,
    formatVersion: 4,
  },
  client: {
    platformModules: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      'zod',
      '@tanstack/react-virtual',
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
      '@deepseek-ai/dsh-client-ui-dockkit',
    ],
    preloadedExternals: [],
    settings: {
      packageName: '@deepseek-ai/dsh-client-ui-settings',
      service: 'configForms',
      hookDrivenCapabilityInference: true,
      formIdentity: 'entry-id',
    },
    conversation: {
      rendererPackageName: '@deepseek-ai/dsh-client-ui-conversation',
      eventService: 'uiConversation',
      slotService: 'slots',
      registrationMethod: 'uiConversation.events.register',
      componentContributions: true,
      verification: 'experimental',
    },
    manifest: {
      platform: 'web',
      moduleRequestsField: 'external',
      packageEdgesField: 'inject',
      manifestVersion: 1,
      bundlePatch: 'array',
    },
  },
}
