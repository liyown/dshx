import { isAbsolute } from 'node:path'
import type { Plugin } from 'vite'
import { DshxError } from '../../diagnostics.js'

/** Keep package imports and Node protocols available for the Host runtime. */
export function isHostExternal(source: string): boolean {
  if (source.startsWith('\0') || source.startsWith('.') || isAbsolute(source)) return false
  if (/^[A-Za-z]:[/\\]/.test(source)) return false
  return true
}

/** Enforce the stable single-file Host artifact surface. */
export function singleHostChunkPlugin(): Plugin {
  return {
    name: 'dshx-single-host-chunk',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(output => output.type === 'chunk')
      const assets = Object.values(bundle).filter(output => output.type === 'asset')
      if (chunks.length !== 1 || chunks[0]?.isEntry !== true || chunks[0].fileName !== 'index.js') {
        throw new DshxError('DSHX1302', 'A DSH Host build must emit exactly one index.js entry chunk.')
      }
      const unexpectedAssets = assets.filter(asset => !asset.fileName.endsWith('.js.map'))
      if (unexpectedAssets.length > 0) {
        throw new DshxError(
          'DSHX1303',
          `A DSH Host build emitted unsupported assets: ${unexpectedAssets.map(asset => asset.fileName).join(', ')}.`,
        )
      }
    },
  }
}
