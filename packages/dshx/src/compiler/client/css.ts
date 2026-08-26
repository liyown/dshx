import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { DshxError } from '../../diagnostics.js'

interface CssAsset {
  readonly type: 'asset'
  readonly fileName: string
  readonly source: string | Uint8Array
}

function cssSource(asset: CssAsset): string {
  return typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString('utf8')
}

function materializer(packageId: string, css: string): string {
  if (css === '') return ''
  const styleId = `${packageId}/client.css`
  return `if(typeof document!=="undefined"){const styleId=${JSON.stringify(styleId)};if(document.querySelector("style[data-plugin-css="+JSON.stringify(styleId)+"]")===null){const style=document.createElement("style");style.dataset.plugin=${JSON.stringify(packageId)};style.dataset.pluginCss=styleId;style.textContent=${JSON.stringify(css)};document.head.appendChild(style)}}`
}

/** Fold Vite's one native CSS asset into the lazy Client factory. */
export function clientCssPlugin(packageId: string, outDir: string): Plugin {
  let pendingMaterializer = ''
  return {
    name: 'dshx-client-css-fold',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk' && item.isEntry)
      if (chunks.length !== 1) return
      const css = Object.entries(bundle).filter(([, item]) => item.type === 'asset' && item.fileName.endsWith('.css')) as unknown as Array<[string, CssAsset]>
      if (css.length > 1) {
        throw new DshxError('DSHX1102', `A DSH Client build emitted multiple CSS assets: ${css.map(([, asset]) => asset.fileName).join(', ')}.`, {
          hint: 'Keep cssCodeSplit disabled and combine styles through the standard Vite CSS graph.',
        })
      }
      const chunk = chunks[0]
      if (chunk === undefined || chunk.type !== 'chunk') return
      pendingMaterializer = css[0] === undefined ? '' : materializer(packageId, cssSource(css[0][1]))
      if (css[0] !== undefined) delete bundle[css[0][0]]
    },
    async writeBundle() {
      if (pendingMaterializer === '') return
      const file = resolve(outDir, 'client.js')
      const code = await readFile(file, 'utf8')
      const marker = 'return module.exports;'
      const offset = code.lastIndexOf(marker)
      if (offset < 0) throw new DshxError('DSHX1102', 'The lazy Client factory return marker is missing from client.js.')
      const lineStart = code.lastIndexOf('\n', offset) + 1
      const indentation = code.slice(lineStart, offset)
      // Insertion occurs after all mapped module code and immediately before the
      // generated factory return, so existing source mappings remain aligned.
      await writeFile(file, `${code.slice(0, lineStart)}${indentation}${pendingMaterializer}\n${code.slice(lineStart)}`, 'utf8')
    },
  }
}
