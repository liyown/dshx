import { createRequire } from 'node:module'
import { DshxError } from '../diagnostics.js'
import { DSH_0_1_COMPATIBILITY } from './dsh-0.1.js'
import { gt, intersects, prerelease, satisfies, valid } from 'semver'
import type { DshCompatibilityMatrixEntry, DshCompatibilityResolution } from './types.js'

export { DSH_0_1_COMPATIBILITY, RC8_COMPATIBILITY } from './dsh-0.1.js'
export type {
  DshCompatibility,
  DshCompatibilityMatrixEntry,
  DshCompatibilityResolution,
  DshConnectionCompatibility,
  DshInspectCompatibility,
  DshProfileCompatibility,
  DshSupportStatus,
  DshVerifiedVersions,
  DshxRuntimePluginSpec,
} from './types.js'

const ADAPTERS = [DSH_0_1_COMPATIBILITY] as const
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
export const DEFAULT_COMPATIBILITY = DSH_0_1_COMPATIBILITY

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

function dependencyRange(manifest: Readonly<Record<string, unknown>>): string | undefined {
  for (const field of ['devDependencies', 'dependencies', 'peerDependencies'] as const) {
    const section = manifest[field]
    if (typeof section !== 'object' || section === null || Array.isArray(section)) continue
    const value = (section as Record<string, unknown>)['@deepseek-ai/dsh']
    if (typeof value === 'string') return value
  }
  return undefined
}

/** Select a build adapter from a project's declared DSH dependency without starting DSH. */
export function resolveDeclaredCompatibility(manifest: Readonly<Record<string, unknown>>): DshCompatibilityResolution | undefined {
  const range = dependencyRange(manifest)
  if (range === undefined) return undefined
  const exactVersion = valid(range)
  if (exactVersion !== null) return classifyCompatibility(exactVersion)
  for (const compatibility of COMPATIBILITY_ADAPTERS) {
    try {
      if (intersects(range, compatibility.dshRange, { includePrerelease: true })) {
        return {
          compatibility,
          support: 'compatible',
        }
      }
    } catch {
      return undefined
    }
  }
  return undefined
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
