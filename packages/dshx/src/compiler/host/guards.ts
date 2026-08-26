import { isAbsolute } from 'node:path'
import type { Plugin } from 'vite'
import { DshxError } from '../../diagnostics.js'
import { containsPrivateDshxImport } from '../private-imports.js'

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
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const chunks = Object.values(bundle).filter(output => output.type === 'chunk')
        const assets = Object.values(bundle).filter(output => output.type === 'asset')
        if (chunks.length !== 1 || chunks[0]?.isEntry !== true || chunks[0].fileName !== 'index.js') {
          throw new DshxError('DSHX1302', 'A DSH Host build must emit exactly one index.js entry chunk.')
        }
        const chunk = chunks[0]
        const requiredExports = ['Config', 'apply', 'inject', 'name']
        const missingExports = requiredExports.filter(name => !chunk.exports.includes(name))
        if (missingExports.length > 0 || !/\bexport\s*\{/.test(chunk.code)) {
          throw new DshxError('DSHX1302', 'A Vite plugin corrupted the DSH Host module protocol.', {
            hint: `Preserve the ${requiredExports.join(', ')} named exports; avoid replacing the final chunk in renderChunk/generateBundle.`,
          })
        }
        if (containsPrivateDshxImport(chunk.code)) {
          throw new DshxError('DSHX1302', 'The DSH Host artifact retained a private DSHX runtime import.')
        }
        const unexpectedAssets = assets.filter(asset => !asset.fileName.endsWith('.js.map'))
        if (unexpectedAssets.length > 0) {
          throw new DshxError('DSHX1303', `A DSH Host build emitted unsupported assets: ${unexpectedAssets.map(asset => asset.fileName).join(', ')}.`)
        }
      },
    },
  }
}
