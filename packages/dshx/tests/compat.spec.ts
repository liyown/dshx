import { describe, expect, it } from 'vitest'
import { satisfies } from 'semver'
import {
  analyzeDeclaredDshRange,
  assessProjectCompatibility,
  classifyCompatibility,
  getCompatibilityCapabilities,
  getCompatibilitySmokeMatrix,
  projectCompatibilityDiagnostics,
  PROTOCOL_2_COMPATIBILITY,
  resolveCompatibility,
  resolveDeclaredCompatibility,
} from '../src/compat/index.js'
import type { DshCompatibility } from '../src/compat/index.js'

const LEGACY_PROTOCOL: DshCompatibility = {
  ...PROTOCOL_2_COMPATIBILITY,
  id: 'protocol-1-test',
  protocolGeneration: 'protocol-1-test',
  version: '0.1.1-rc.2',
  dshRange: '>=0.1.0-rc.8 <0.2.0-0',
  verified: { minimum: '0.1.0-rc.8', latest: '0.1.1-rc.2' },
  verifiedVersions: ['0.1.0-rc.8', '0.1.1-rc.2'],
}

describe('DSH protocol compatibility generations', () => {
  it('pins the official protocol-2 module and contribution baseline', () => {
    expect(PROTOCOL_2_COMPATIBILITY.client.platformModules).toEqual([
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
    ])
    expect(PROTOCOL_2_COMPATIBILITY.client.preloadedExternals).toEqual([])
    expect(PROTOCOL_2_COMPATIBILITY.hostContributions).toEqual({
      commands: true,
      promptSections: true,
      promptContexts: true,
      settings: true,
      settingsMode: 'config',
    })
    expect(PROTOCOL_2_COMPATIBILITY.client.settings).toEqual({
      packageName: '@deepseek-ai/dsh-client-ui-settings',
      service: 'configForms',
      hookDrivenCapabilityInference: true,
      formIdentity: 'entry-id',
    })
    expect(PROTOCOL_2_COMPATIBILITY.client.conversation).toEqual({
      rendererPackageName: '@deepseek-ai/dsh-client-ui-conversation',
      eventService: 'uiConversation',
      slotService: 'slots',
      registrationMethod: 'uiConversation.events.register',
      componentContributions: true,
      verification: 'experimental',
    })
    expect(PROTOCOL_2_COMPATIBILITY.session).toEqual({
      customDurableEventVocabulary: false,
      formatVersion: 4,
    })
    expect(PROTOCOL_2_COMPATIBILITY.connection).toMatchObject({
      protocolVersion: 2,
      peerAdmission: true,
      remoteNamespace: 'remote',
    })
    expect(getCompatibilityCapabilities(PROTOCOL_2_COMPATIBILITY)).toEqual(
      expect.arrayContaining([
        'host:commands',
        'host:prompt-sections',
        'host:prompt-contexts',
        'host:settings:config',
        'client:config-forms',
        'client:settings-hook-inference',
        'client:ui-conversation',
        'client:conversation-chat-slots',
        'client:conversation-components:experimental',
        'client:api-hook-inference',
        'connection:peer-admission',
        'session:custom-durable-event-vocabulary:unavailable',
        'session:format-4',
      ]),
    )
    expect(getCompatibilityCapabilities(PROTOCOL_2_COMPATIBILITY)).not.toContain('host:settings')
    expect(getCompatibilityCapabilities(PROTOCOL_2_COMPATIBILITY)).not.toContain('client:settings-scope')
  })

  it('distinguishes verified, compatible, and experimental versions in one generation', () => {
    expect(classifyCompatibility('0.2.1-rc.2')).toMatchObject({ compatibility: PROTOCOL_2_COMPATIBILITY, support: 'verified' })
    expect(resolveCompatibility('0.2.1-rc.2')).toBe(PROTOCOL_2_COMPATIBILITY)
    expect(classifyCompatibility('0.2.2')).toMatchObject({ compatibility: PROTOCOL_2_COMPATIBILITY, support: 'compatible' })
    expect(classifyCompatibility('0.2.2-rc.1')).toMatchObject({ compatibility: PROTOCOL_2_COMPATIBILITY, support: 'experimental' })
    expect(classifyCompatibility('0.3.0')).toBeUndefined()
  })

  it('publishes a peer range accepted by package managers for every verified prerelease', () => {
    for (const version of PROTOCOL_2_COMPATIBILITY.verifiedVersions) {
      expect(satisfies(version, PROTOCOL_2_COMPATIBILITY.dshRange)).toBe(true)
    }
  })

  it('rejects DSH versions outside every supported protocol generation', () => {
    expect(() => resolveCompatibility('0.1.1-rc.2')).toThrow('DSHX5101')
    expect(classifyCompatibility('0.1.1-rc.2')).toBeUndefined()
    expect(classifyCompatibility('0.2.0')).toBeUndefined()
    expect(classifyCompatibility('0.2.1-rc.1')).toBeUndefined()
    expect(classifyCompatibility('0.2.1')).toMatchObject({ compatibility: PROTOCOL_2_COMPATIBILITY, support: 'compatible' })
  })

  it('prefers engines.dsh for public support and keeps devDependencies independent', () => {
    const manifest = {
      engines: { dsh: '>=0.2.1-rc.2 <0.3.0-0' },
      peerDependencies: { '@deepseek-ai/dsh': '0.1.1-rc.2' },
      devDependencies: { '@deepseek-ai/dsh': '0.2.1-rc.2', '@becomeopc/dshx': '9.4.0' },
    }
    expect(resolveDeclaredCompatibility(manifest)).toMatchObject({ compatibility: PROTOCOL_2_COMPATIBILITY, support: 'compatible' })
    expect(resolveDeclaredCompatibility({ devDependencies: manifest.devDependencies })).toBeUndefined()
    expect(assessProjectCompatibility(manifest, '0.2.1-rc.2')).toMatchObject({
      declaredRange: '>=0.2.1-rc.2 <0.3.0-0',
      developmentSpecifier: '0.2.1-rc.2',
      installedVersion: '0.2.1-rc.2',
      installedWithinDeclaredRange: true,
      compatibility: PROTOCOL_2_COMPATIBILITY,
      resolution: { support: 'verified' },
    })
  })

  it('models a single artifact as exactly one protocol generation', () => {
    const adapters = [LEGACY_PROTOCOL, PROTOCOL_2_COMPATIBILITY]
    expect(analyzeDeclaredDshRange('>=0.1.0-rc.8 <0.2.0-0', adapters)).toMatchObject({
      status: 'single-generation',
      compatibility: LEGACY_PROTOCOL,
    })
    expect(analyzeDeclaredDshRange('>=0.1.0-rc.8 <0.3.0-0', adapters)).toMatchObject({
      status: 'spans-generations',
      compatibilities: [LEGACY_PROTOCOL, PROTOCOL_2_COMPATIBILITY],
    })
    expect(analyzeDeclaredDshRange('>=0.1.0-rc.8 <0.3.0-0', [PROTOCOL_2_COMPATIBILITY])).toMatchObject({
      status: 'partially-supported',
      compatibility: PROTOCOL_2_COMPATIBILITY,
    })
    expect(analyzeDeclaredDshRange('^9.0.0', adapters)).toMatchObject({ status: 'unsupported' })
    expect(analyzeDeclaredDshRange('not semver', adapters)).toMatchObject({ status: 'invalid' })
  })

  it('diagnoses a local DSH version outside the plugin public range', () => {
    const assessment = assessProjectCompatibility(
      {
        devDependencies: { '@deepseek-ai/dsh': '0.2.2' },
        engines: { dsh: '0.2.1-rc.2' },
      },
      '0.2.2',
    )
    expect(projectCompatibilityDiagnostics(assessment, '/plugin/package.json')).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DSHX5108', severity: 'error' })]),
    )
  })

  it('derives representative real-smoke boundaries from the adapter registry', () => {
    expect(getCompatibilitySmokeMatrix()).toEqual([
      { generation: 'protocol-2', adapterId: 'protocol-2', role: 'minimum', version: '0.2.1-rc.2' },
    ])
  })
})
