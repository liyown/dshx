import { createRequire } from 'node:module'
import { DshxError } from '../diagnostics.js'
import { RC8_COMPATIBILITY } from './rc8.js'
import { intersects, satisfies, valid } from 'semver'
import type { DshCompatibilityResolution } from './types.js'

export { RC8_COMPATIBILITY } from './rc8.js'
export type { DshCompatibility, DshCompatibilityResolution, DshInspectCompatibility, DshProfileCompatibility, DshSupportStatus, DshxRuntimePluginSpec } from './types.js'

const ADAPTERS = [RC8_COMPATIBILITY] as const
for (let index = 0; index < ADAPTERS.length; index += 1) {
  for (let next = index + 1; next < ADAPTERS.length; next += 1) {
    if (intersects(ADAPTERS[index]!.dshRange, ADAPTERS[next]!.dshRange, { includePrerelease: true })) {
      throw new Error(`Overlapping DSH compatibility ranges: ${ADAPTERS[index]!.id} and ${ADAPTERS[next]!.id}.`)
    }
  }
}

export const COMPATIBILITY_ADAPTERS = ADAPTERS
export const DEFAULT_COMPATIBILITY = RC8_COMPATIBILITY

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
  for (const compatibility of COMPATIBILITY_ADAPTERS) {
    try {
      if (intersects(range, compatibility.dshRange, { includePrerelease: true })) {
        return {
          compatibility,
          support: compatibility.verifiedVersions.includes(compatibility.version) ? 'verified' : 'compatible-range',
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
    if (satisfies(parsed, compatibility.dshRange, { includePrerelease: true })) return { compatibility, support: 'compatible-range' }
  }
  return undefined
}

/** Resolve the adapter for a verified or in-range DSH version. */
export function resolveCompatibility(version: string) {
  const resolution = classifyCompatibility(version)
  if (resolution !== undefined) return resolution.compatibility
  throw new DshxError(
    'DSHX5101',
    `Unsupported DSH version ${JSON.stringify(version)}.`,
    {
      hint: `This DSHX build supports ${RC8_COMPATIBILITY.dshRange}; use a compatible DSH version or set compatibility.allowUnsupported to true for a temporary override.`,
    },
  )
}
