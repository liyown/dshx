import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { transform } from 'lightningcss'
import type { Plugin } from 'vite'

const MODULE_PREFIX = '\0dshx-css-module:'
const GLOBAL_PREFIX = '\0dshx-css-global:'
const VIRTUAL_SUFFIX = '.mjs'

function stylesheetPath(source: string, importer: string | undefined): string {
  return importer === undefined ? source : resolve(dirname(importer), source)
}

function stableStyleId(projectRoot: string, file: string): string {
  const projectPath = relative(projectRoot, file).split(sep).join('/')
  return projectPath.startsWith('../') ? basename(file) : projectPath
}

function injectionModule(
  packageId: string,
  styleId: string,
  css: string,
  classMap?: Readonly<Record<string, string>>,
): string {
  const tagId = `${packageId}/${styleId}`
  const lines = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(packageId)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`,
  ]
  return lines.join('\n')
}

/** Compile CSS into lazy-factory-owned JavaScript modules. */
export function clientCssPlugin(packageId: string, projectRoot: string): Plugin {
  return {
    name: 'dshx-client-css',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.endsWith('.module.css')) {
        return MODULE_PREFIX + stylesheetPath(source, importer) + VIRTUAL_SUFFIX
      }
      if (source.endsWith('.css')) {
        return GLOBAL_PREFIX + stylesheetPath(source, importer) + VIRTUAL_SUFFIX
      }
      return null
    },
    async load(id) {
      const isModule = id.startsWith(MODULE_PREFIX)
      const prefix = isModule ? MODULE_PREFIX : GLOBAL_PREFIX
      if (!id.startsWith(prefix)) return null

      const file = id.slice(prefix.length, -VIRTUAL_SUFFIX.length)
      this.addWatchFile(file)
      const source = await readFile(file)
      const result = transform({
        filename: file,
        code: source,
        minify: true,
        ...(isModule ? { cssModules: { pattern: '[hash]_[local]' } } : {}),
      })

      const classMap: Record<string, string> = {}
      for (const [local, value] of Object.entries(result.exports ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
        classMap[local] = value.name
      }
      return injectionModule(
        packageId,
        stableStyleId(projectRoot, file),
        result.code.toString(),
        isModule ? classMap : undefined,
      )
    },
  }
}
