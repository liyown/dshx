import { createRequire } from 'node:module'
import { DshxError } from '../diagnostics.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import { PROTOCOL_1_COMPATIBILITY } from './protocol-1.js'
import { gt, intersects, prerelease, satisfies, subset, valid, validRange } from 'semver'
import type {
  DshCompatibility,
  DshCompatibilityMatrixEntry,
  DshCompatibilityResolution,
  DshDeclaredRangeAnalysis,
  DshProjectCompatibilityAssessment,
} from './types.js'

export { DSH_0_1_COMPATIBILITY, PROTOCOL_1_COMPATIBILITY, RC8_COMPATIBILITY } from './protocol-1.js'
export type {
  DshCompatibility,
  DshCompatibilityLifecycle,
  DshCompatibilityMatrixEntry,
  DshCompatibilityResolution,
  DshConnectionCompatibility,
  DshHostContributionCompatibility,
  DshInspectCompatibility,
  DshProfileCompatibility,
  DshDeclaredRangeAnalysis,
  DshDeclaredRangeStatus,
  DshProjectCompatibilityAssessment,
  DshSupportStatus,
  DshVerifiedVersions,
  DshxRuntimePluginSpec,
} from './types.js'

const ADAPTERS = [PROTOCOL_1_COMPATIBILITY] as const
for (const compatibility of ADAPTERS) {
  const { minimum, latest } = compatibility.verified
  if (valid(minimum) === null || valid(latest) === null || gt(minimum, latest)) {
    throw new Error(`Invalid DSH verification boundaries for ${compatibility.id}: ${minimum} to ${latest}.`)
  }
  if (!compatibility.verifiedVersions.includes(minimum) || !compatibility.verifiedVersions.includes(latest)) {
    throw new Error(`DSH verification boundaries for ${compatibility.id} must be present in verifiedVersions.`)
  }
  if (new Set(compatibility.verifiedVersions).size !== compatibility.verifiedVersions.length) {
    throw new Error(`Verified DSH versions for ${compatibility.id} must be unique.`)
  }
  for (const version of compatibility.verifiedVersions) {
    if (valid(version) === null || !satisfies(version, compatibility.dshRange, { includePrerelease: true })) {
      throw new Error(`Verified DSH ${version} is outside the ${compatibility.id} range ${compatibility.dshRange}.`)
    }
  }
}
for (let index = 0; index < ADAPTERS.length; index += 1) {
  for (let next = index + 1; next < ADAPTERS.length; next += 1) {
    if (intersects(ADAPTERS[index]!.dshRange, ADAPTERS[next]!.dshRange, { includePrerelease: true })) {
      throw new Error(`Overlapping DSH compatibility ranges: ${ADAPTERS[index]!.id} and ${ADAPTERS[next]!.id}.`)
    }
  }
}

export const COMPATIBILITY_ADAPTERS = ADAPTERS
export const DEFAULT_COMPATIBILITY = PROTOCOL_1_COMPATIBILITY

/** Representative boundaries used by the generic real-runtime CI scenario. */
export function getCompatibilitySmokeMatrix(): readonly DshCompatibilityMatrixEntry[] {
  return COMPATIBILITY_ADAPTERS.flatMap(compatibility => {
    const minimum: DshCompatibilityMatrixEntry = {
      generation: compatibility.protocolGeneration,
      adapterId: compatibility.id,
      role: 'minimum',
      version: compatibility.verified.minimum,
    }
    if (compatibility.verified.latest === compatibility.verified.minimum) return [minimum]
    return [
      minimum,
      {
        generation: compatibility.protocolGeneration,
        adapterId: compatibility.id,
        role: 'latest',
        version: compatibility.verified.latest,
      },
    ]
  })
}

/** Read the project-local official DSH package without invoking a command. */
export function detectInstalledDshVersion(projectPackageFile: string): string | undefined {
  try {
    const require = createRequire(projectPackageFile)
    const packageFile = require.resolve('@deepseek-ai/dsh/package.json')
    const manifest = require(packageFile) as { version?: unknown }
    return typeof manifest.version === 'string' && manifest.version !== '' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

function dependencySpecifier(manifest: Readonly<Record<string, unknown>>, field: 'devDependencies' | 'peerDependencies'): string | undefined {
  const section = manifest[field]
  if (typeof section !== 'object' || section === null || Array.isArray(section)) return undefined
  const value = (section as Record<string, unknown>)['@deepseek-ai/dsh']
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Public DSH support declared by the plugin package. */
export function declaredDshRange(manifest: Readonly<Record<string, unknown>>): string | undefined {
  return dependencySpecifier(manifest, 'peerDependencies')
}

/** Concrete DSH specifier used only to build and test the plugin locally. */
export function developmentDshSpecifier(manifest: Readonly<Record<string, unknown>>): string | undefined {
  return dependencySpecifier(manifest, 'devDependencies')
}

/** Determine whether one public peer range maps cleanly to exactly one artifact generation. */
export function analyzeDeclaredDshRange(range: string, adapters: readonly DshCompatibility[] = COMPATIBILITY_ADAPTERS): DshDeclaredRangeAnalysis {
  if (validRange(range, { includePrerelease: true }) === null) return { range, status: 'invalid', compatibilities: [] }
  const compatibilities = adapters.filter(compatibility => intersects(range, compatibility.dshRange, { includePrerelease: true }))
  if (compatibilities.length === 0) return { range, status: 'unsupported', compatibilities }
  if (compatibilities.length > 1) return { range, status: 'spans-generations', compatibilities }
  const compatibility = compatibilities[0]!
  if (!subset(range, compatibility.dshRange, { includePrerelease: true })) {
    return { range, status: 'partially-supported', compatibilities, compatibility }
  }
  return { range, status: 'single-generation', compatibilities, compatibility }
}

/** Select a build adapter from the plugin's public DSH peer range without starting DSH. */
export function resolveDeclaredCompatibility(manifest: Readonly<Record<string, unknown>>): DshCompatibilityResolution | undefined {
  const range = declaredDshRange(manifest)
  if (range === undefined) return undefined
  const analysis = analyzeDeclaredDshRange(range)
  if (analysis.status !== 'single-generation' || analysis.compatibility === undefined) return undefined
  const exactVersion = valid(range)
  if (exactVersion !== null) return classifyCompatibility(exactVersion)
  return { compatibility: analysis.compatibility, support: 'compatible' }
}

/** Human- and machine-readable adapter capabilities derived from the adapter record. */
export function getCompatibilityCapabilities(compatibility: DshCompatibility): readonly string[] {
  const capabilities = ['host-loader', 'client-loader', 'profile']
  if (compatibility.hostContributions?.commands === true) capabilities.push('host:commands')
  if (compatibility.hostContributions?.promptSections === true) capabilities.push('host:prompt-sections')
  if (compatibility.hostContributions?.promptContexts === true) capabilities.push('host:prompt-contexts')
  if (compatibility.hostContributions?.settings === true) capabilities.push('host:settings')
  if (compatibility.client.settings?.service === 'settingsScope') capabilities.push('client:settings-scope')
  if (compatibility.client.settings?.hookDrivenCapabilityInference === true) capabilities.push('client:settings-hook-inference')
  for (const target of compatibility.inspect?.targets ?? []) {
    const provider = compatibility.inspect?.providerByTarget?.[target] ?? compatibility.inspect?.provider ?? 'unavailable'
    capabilities.push(`inspect:${target}:${provider}`)
  }
  if (compatibility.connection?.hostRpc) capabilities.push('connection:host-rpc')
  if (compatibility.connection?.clientRpc) capabilities.push('connection:client-rpc')
  for (const plugin of compatibility.runtimePlugins ?? []) {
    for (const provided of plugin.provides) capabilities.push(`runtime:${provided}`)
  }
  return [...new Set(capabilities)]
}

/** Collect the version facts used consistently by build, dev, and check. */
export function assessProjectCompatibility(manifest: Readonly<Record<string, unknown>>, installedVersion?: string): DshProjectCompatibilityAssessment {
  const declaredRange = declaredDshRange(manifest)
  const developmentSpecifier = developmentDshSpecifier(manifest)
  const rangeAnalysis = declaredRange === undefined ? undefined : analyzeDeclaredDshRange(declaredRange)
  const resolution = installedVersion === undefined ? undefined : classifyCompatibility(installedVersion)
  const compatibility = resolution?.compatibility ?? rangeAnalysis?.compatibility ?? DEFAULT_COMPATIBILITY
  let installedWithinDeclaredRange: boolean | undefined
  if (installedVersion !== undefined && declaredRange !== undefined && validRange(declaredRange, { includePrerelease: true }) !== null) {
    installedWithinDeclaredRange = satisfies(installedVersion, declaredRange, { includePrerelease: true })
  }
  return {
    ...(declaredRange === undefined ? {} : { declaredRange }),
    ...(developmentSpecifier === undefined ? {} : { developmentSpecifier }),
    ...(rangeAnalysis === undefined ? {} : { rangeAnalysis }),
    ...(installedVersion === undefined ? {} : { installedVersion }),
    ...(installedWithinDeclaredRange === undefined ? {} : { installedWithinDeclaredRange }),
    ...(resolution === undefined ? {} : { resolution }),
    compatibility,
    capabilities: getCompatibilityCapabilities(compatibility),
  }
}

/** Actionable package declaration diagnostics shared by build, dev, and check. */
export function projectCompatibilityDiagnostics(
  assessment: DshProjectCompatibilityAssessment,
  packageFile: string,
  options: { readonly allowUnsupported?: boolean } = {},
): readonly DshxDiagnostic[] {
  const diagnostics: DshxDiagnostic[] = []
  const analysis = assessment.rangeAnalysis
  if (assessment.declaredRange === undefined) {
    diagnostics.push({
      code: 'DSHX5104',
      severity: 'warning',
      message: 'The plugin does not declare its public DSH support range in peerDependencies.',
      file: packageFile,
      hint: `Add "@deepseek-ai/dsh": ${JSON.stringify(DEFAULT_COMPATIBILITY.dshRange)} to peerDependencies; keep the concrete local test version in devDependencies.`,
    })
  } else if (analysis?.status === 'invalid') {
    diagnostics.push({
      code: 'DSHX5105',
      severity: 'error',
      message: `The plugin DSH peer range ${JSON.stringify(assessment.declaredRange)} is not valid semver.`,
      file: packageFile,
      hint: 'Replace peerDependencies["@deepseek-ai/dsh"] with one valid semver range.',
    })
  } else if (analysis?.status === 'unsupported') {
    diagnostics.push({
      code: 'DSHX5106',
      severity: 'error',
      message: `The plugin DSH peer range ${JSON.stringify(assessment.declaredRange)} is outside every adapter in this DSHX release.`,
      file: packageFile,
      hint: `Use one range fully contained by ${COMPATIBILITY_ADAPTERS.map(item => `${item.protocolGeneration}: ${item.dshRange}`).join(', ')}, or pin the last DSHX release that supports the required generation.`,
    })
  } else if (analysis?.status === 'partially-supported') {
    diagnostics.push({
      code: 'DSHX5106',
      severity: 'error',
      message: `The plugin DSH peer range ${JSON.stringify(assessment.declaredRange)} extends beyond the ${analysis.compatibility?.protocolGeneration ?? 'selected'} adapter.`,
      file: packageFile,
      hint: `Narrow the public peer range to ${analysis.compatibility?.dshRange ?? 'one fully supported generation'} before publishing this artifact.`,
    })
  } else if (analysis?.status === 'spans-generations') {
    diagnostics.push({
      code: 'DSHX5107',
      severity: 'error',
      message: `The plugin DSH peer range ${JSON.stringify(assessment.declaredRange)} spans incompatible protocol generations: ${analysis.compatibilities.map(item => item.protocolGeneration).join(', ')}.`,
      file: packageFile,
      hint: 'Publish one artifact for one protocol generation, or use an explicit official multi-target artifact strategy when DSH provides one.',
    })
  }
  if (assessment.installedWithinDeclaredRange === false && assessment.installedVersion !== undefined) {
    diagnostics.push({
      code: 'DSHX5108',
      severity: options.allowUnsupported === true ? 'warning' : 'error',
      message: `Installed DSH ${assessment.installedVersion} is outside the plugin peer range ${JSON.stringify(assessment.declaredRange)}.`,
      file: packageFile,
      hint:
        options.allowUnsupported === true
          ? 'The compatibility.allowUnsupported escape hatch is active; do not publish this artifact as compatible without real contract verification.'
          : 'Install a DSH version inside the declared peer range, or correct the public range if the plugin contract really supports this version.',
    })
  }
  if (assessment.developmentSpecifier === undefined) {
    diagnostics.push({
      code: 'DSHX5109',
      severity: 'warning',
      message: 'The project has no concrete @deepseek-ai/dsh devDependency for local development.',
      file: packageFile,
      hint: `Add the tested DSH version, for example ${JSON.stringify(DEFAULT_COMPATIBILITY.verified.latest)}, to devDependencies.`,
    })
  } else {
    const developmentVersion = valid(assessment.developmentSpecifier)
    if (developmentVersion === null) {
      diagnostics.push({
        code: 'DSHX5109',
        severity: 'warning',
        message: `The local DSH devDependency ${JSON.stringify(assessment.developmentSpecifier)} is not one concrete version.`,
        file: packageFile,
        hint: `Pin the DSH version used by this repository, for example ${JSON.stringify(DEFAULT_COMPATIBILITY.verified.latest)}; keep the public range in peerDependencies.`,
      })
    } else if (assessment.installedVersion !== undefined && developmentVersion !== assessment.installedVersion) {
      diagnostics.push({
        code: 'DSHX5109',
        severity: 'warning',
        message: `The DSH CLI reports ${assessment.installedVersion}, but devDependencies requests ${developmentVersion}.`,
        file: packageFile,
        hint: 'Run a frozen install and ensure the project-local DSH executable resolves before PATH.',
      })
    }
  }
  return diagnostics
}

export function classifyCompatibility(version: string): import('./types.js').DshCompatibilityResolution | undefined {
  const parsed = valid(version)
  if (parsed === null) return undefined
  for (const compatibility of COMPATIBILITY_ADAPTERS) {
    if (compatibility.verifiedVersions.includes(parsed)) return { compatibility, support: 'verified' }
    if (satisfies(parsed, compatibility.dshRange, { includePrerelease: true })) {
      return { compatibility, support: prerelease(parsed) === null ? 'compatible' : 'experimental' }
    }
  }
  return undefined
}

/** Resolve the adapter for a verified or in-range DSH version. */
export function resolveCompatibility(version: string) {
  const resolution = classifyCompatibility(version)
  if (resolution !== undefined) return resolution.compatibility
  throw new DshxError('DSHX5101', `Unsupported DSH version ${JSON.stringify(version)}.`, {
    hint: `This DSHX build supports ${COMPATIBILITY_ADAPTERS.map(compatibility => compatibility.dshRange).join(', ')}; use a compatible DSH version or set compatibility.allowUnsupported to true for a temporary override.`,
  })
}
