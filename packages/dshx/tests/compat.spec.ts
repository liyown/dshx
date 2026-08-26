import { describe, expect, it } from 'vitest'
import { satisfies } from 'semver'
import {
  analyzeDeclaredDshRange,
  assessProjectCompatibility,
  classifyCompatibility,
  getCompatibilityCapabilities,
  getCompatibilitySmokeMatrix,
  projectCompatibilityDiagnostics,
  PROTOCOL_1_COMPATIBILITY,
  resolveCompatibility,
  resolveDeclaredCompatibility,
} from '../src/compat/index.js'
import type { DshCompatibility } from '../src/compat/index.js'

const PROTOCOL_2_COMPATIBILITY: DshCompatibility = {
  ...PROTOCOL_1_COMPATIBILITY,
  id: 'protocol-2',
  protocolGeneration: 'protocol-2',
  version: '0.2.0',
  dshRange: '>=0.2.0 <0.3.0-0',
  verified: { minimum: '0.2.0', latest: '0.2.0' },
  verifiedVersions: ['0.2.0'],
}

describe('DSH protocol compatibility generations', () => {
  it('pins the official implicit module table baseline', () => {
    expect(PROTOCOL_1_COMPATIBILITY.client.platformModules).toEqual([
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
    ])
    expect(PROTOCOL_1_COMPATIBILITY.client.preloadedExternals).toEqual(['@deepseek-ai/dsh-client-runtime/client', '@deepseek-ai/dsh-client-connection/client'])
    expect(PROTOCOL_1_COMPATIBILITY.hostContributions).toEqual({ commands: true, promptSections: true, promptContexts: true, settings: true })
    expect(PROTOCOL_1_COMPATIBILITY.client.conversation).toEqual({
      runtimePackageName: '@deepseek-ai/dsh-client-runtime',
      rendererPackageName: '@deepseek-ai/dsh-client-ui-conversation',
      eventService: 'conversationEvents',
      slotService: 'slots',
      componentContributions: true,
      verification: 'experimental',
    })
    expect(PROTOCOL_1_COMPATIBILITY.session).toEqual({ customDurableEventVocabulary: false })
    expect(getCompatibilityCapabilities(PROTOCOL_1_COMPATIBILITY)).toEqual(
      expect.arrayContaining([
        'host:commands',
        'host:prompt-sections',
        'host:prompt-contexts',
        'host:settings',
        'client:settings-scope',
        'client:settings-hook-inference',
        'client:conversation-event-registry',
        'client:conversation-chat-slots',
        'client:conversation-components:experimental',
        'client:api-hook-inference',
        'session:custom-durable-event-vocabulary:unavailable',
      ]),
    )
  })

  it('distinguishes verified, compatible, and experimental versions in one generation', () => {
    expect(classifyCompatibility('0.1.1-rc.2')).toMatchObject({ compatibility: PROTOCOL_1_COMPATIBILITY, support: 'verified' })
    expect(resolveCompatibility('0.1.0-rc.9')).toBe(PROTOCOL_1_COMPATIBILITY)
    expect(classifyCompatibility('0.1.2')).toMatchObject({ compatibility: PROTOCOL_1_COMPATIBILITY, support: 'compatible' })
    expect(classifyCompatibility('0.1.0-rc.9')).toMatchObject({ compatibility: PROTOCOL_1_COMPATIBILITY, support: 'experimental' })
  })

  it('publishes a peer range accepted by package managers for every verified prerelease', () => {
    for (const version of PROTOCOL_1_COMPATIBILITY.verifiedVersions) {
      expect(satisfies(version, PROTOCOL_1_COMPATIBILITY.dshRange)).toBe(true)
    }
  })

  it('rejects a DSH version outside every supported protocol generation', () => {
    expect(() => resolveCompatibility('0.2.0')).toThrow('DSHX5101')
    expect(classifyCompatibility('0.2.0')).toBeUndefined()
    expect(classifyCompatibility('0.2.0-rc.1')).toBeUndefined()
  })

  it('uses peerDependencies for public support and keeps devDependencies independent', () => {
    const manifest = {
      devDependencies: { '@deepseek-ai/dsh': '0.1.1-rc.2', '@becomeopc/dshx': '9.4.0' },
      peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-rc.8 <0.2.0-0 || 0.1.1-rc.2' },
    }
    expect(resolveDeclaredCompatibility(manifest)).toMatchObject({ compatibility: PROTOCOL_1_COMPATIBILITY, support: 'compatible' })
    expect(resolveDeclaredCompatibility({ devDependencies: manifest.devDependencies })).toBeUndefined()
    expect(assessProjectCompatibility(manifest, '0.1.0-rc.8')).toMatchObject({
      declaredRange: '>=0.1.0-rc.8 <0.2.0-0 || 0.1.1-rc.2',
      developmentSpecifier: '0.1.1-rc.2',
      installedVersion: '0.1.0-rc.8',
      installedWithinDeclaredRange: true,
      compatibility: PROTOCOL_1_COMPATIBILITY,
      resolution: { support: 'verified' },
    })
  })

  it('models a single artifact as exactly one protocol generation', () => {
    const adapters = [PROTOCOL_1_COMPATIBILITY, PROTOCOL_2_COMPATIBILITY]
    expect(analyzeDeclaredDshRange('>=0.1.0-rc.8 <0.2.0-0', adapters)).toMatchObject({
      status: 'single-generation',
      compatibility: PROTOCOL_1_COMPATIBILITY,
    })
    expect(analyzeDeclaredDshRange('>=0.1.0-rc.8 <0.3.0-0', adapters)).toMatchObject({
      status: 'spans-generations',
      compatibilities: [PROTOCOL_1_COMPATIBILITY, PROTOCOL_2_COMPATIBILITY],
    })
    expect(analyzeDeclaredDshRange('>=0.1.0-rc.8 <0.3.0-0', [PROTOCOL_1_COMPATIBILITY])).toMatchObject({
      status: 'partially-supported',
      compatibility: PROTOCOL_1_COMPATIBILITY,
    })
    expect(analyzeDeclaredDshRange('^9.0.0', adapters)).toMatchObject({ status: 'unsupported' })
    expect(analyzeDeclaredDshRange('not semver', adapters)).toMatchObject({ status: 'invalid' })
  })

  it('diagnoses a local DSH version outside the plugin public range', () => {
    const assessment = assessProjectCompatibility(
      {
        devDependencies: { '@deepseek-ai/dsh': '0.1.1-rc.2' },
        peerDependencies: { '@deepseek-ai/dsh': '0.1.0-rc.8' },
      },
      '0.1.1-rc.2',
    )
    expect(projectCompatibilityDiagnostics(assessment, '/plugin/package.json')).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DSHX5108', severity: 'error' })]),
    )
  })

  it('derives representative real-smoke boundaries from the adapter registry', () => {
    expect(getCompatibilitySmokeMatrix()).toEqual([
      { generation: 'protocol-1', adapterId: 'protocol-1', role: 'minimum', version: '0.1.0-rc.8' },
      { generation: 'protocol-1', adapterId: 'protocol-1', role: 'latest', version: '0.1.1-rc.2' },
    ])
  })
})
