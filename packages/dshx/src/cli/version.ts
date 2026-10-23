import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function packageVersion(): string {
  try {
    const manifest = require('../../package.json') as { version?: unknown }
    if (typeof manifest.version === 'string' && manifest.version !== '') return manifest.version
  } catch {
    /* source-only environments may not have package metadata */
  }
  return '0.0.0'
}

/** The version this CLI reports, unless the caller injects one. */
export const VERSION = packageVersion()
