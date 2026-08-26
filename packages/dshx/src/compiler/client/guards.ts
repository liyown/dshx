import { isBuiltin } from 'node:module'
import type { Plugin, Rollup } from 'vite'
import { DshxError } from '../../diagnostics.js'
import { containsPrivateDshxImport } from '../private-imports.js'

const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|file-reference|session|llm|tools|brand)(\/|$)/
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

/** Reject imports that cannot execute in a DSH browser bundle. */
export function clientGuardPlugin(externals: ReadonlySet<string>, packageId: string): Plugin {
  return {
    name: 'dshx-client-guards',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer !== undefined && (source.startsWith('node:') || isBuiltin(source))) {
        throw new DshxError('DSHX1201', `Node module ${JSON.stringify(source)} cannot be imported from a DSH Client entry.`, {
          file: importer,
          hint: 'Move this import to the Host entry.',
        })
      }
      if (!source.startsWith('@deepseek-ai/') || externals.has(source)) return null
      if (INLINE_SAFE.test(source) || VENDORED_LIBRARY.test(source) || GENERATED_REMOTE.test(source)) return null
      throw new DshxError('DSHX1202', `Client import ${JSON.stringify(source)} is neither a DSH baseline module nor a declared module request.`, {
        ...(importer === undefined ? {} : { file: importer }),
        hint: `Declare the exact specifier in ${packageId}'s dsh.client.external or use a Cordis service.`,
      })
    },
  }
}

/** Fail when a build violates the selected DSH client bundle protocol. */
export function singleClientChunkPlugin(): Plugin {
  const validate = (bundle: Rollup.OutputBundle): void => {
    const chunks = Object.values(bundle).filter(output => output.type === 'chunk')
    const assets = Object.values(bundle).filter(output => output.type === 'asset')
    if (chunks.length !== 1 || chunks[0]?.isEntry !== true) {
      throw new DshxError('DSHX1101', 'A DSH Client build must emit exactly one JavaScript entry chunk.')
    }
    const chunk = chunks[0]
    const requiredExports = ['Config', 'apply', 'inject', 'name']
    const missingExports = requiredExports.filter(name => !chunk.exports.includes(name))
    const hasLoader = /window\.__ModuleLoader__\.load\(\{\s*id\s*:/.test(chunk.code)
    const hasFactory = /factory\s*:\s*\(require\)\s*=>\s*\{/.test(chunk.code)
    const hasReturn = /return\s+module\.exports\s*;\s*\}\s*\}\s*\)\s*;?/.test(chunk.code)
    const missingAssignments = requiredExports.filter(name => !new RegExp(`\\bexports\\.${name}\\s*=`).test(chunk.code))
    if (missingExports.length > 0 || missingAssignments.length > 0 || !hasLoader || !hasFactory || !hasReturn) {
      throw new DshxError('DSHX1101', 'A Vite plugin corrupted the DSH lazy Client factory protocol.', {
        hint: `Preserve the ModuleLoader wrapper and the ${requiredExports.join(', ')} exports; avoid replacing the final chunk in renderChunk/generateBundle.`,
      })
    }
    if (containsPrivateDshxImport(chunk.code)) {
      throw new DshxError('DSHX1101', 'The DSH Client artifact retained a private DSHX runtime import.')
    }
    const unexpectedAssets = assets.filter(asset => !asset.fileName.endsWith('.js.map'))
    if (unexpectedAssets.length > 0) {
      throw new DshxError('DSHX1102', `A DSH Client build emitted unsupported assets: ${unexpectedAssets.map(asset => asset.fileName).join(', ')}.`)
    }
  }
  return {
    name: 'dshx-single-client-chunk',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        validate(bundle)
      },
    },
  }
}
