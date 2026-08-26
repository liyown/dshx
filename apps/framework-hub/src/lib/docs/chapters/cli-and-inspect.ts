import { defineDocsChapter } from '../types'

const configExample = `// dshx.config.ts
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from '@becomeopc/dshx'

export default defineConfig({
  host: { entry: 'src/host.ts' },
  client: {
    entry: 'src/client.tsx',
    vite: { plugins: [tailwindcss()] },
  },
  build: { sourcemap: true, declarations: true },
})`

const tailwindCss = `@layer theme, utilities;

@import "tailwindcss/theme.css"
  layer(theme)
  prefix(dshx);

@import "tailwindcss/utilities.css"
  layer(utilities)
  source("./")
  prefix(dshx);`

const toolingBuild = `import {
  buildClient,
  buildHost,
  watchClient,
  watchHost,
  type BuildReport,
  type BuildWatcher,
} from '@becomeopc/dshx/tooling'

const report: BuildReport = await buildClient(options)
const watcher: BuildWatcher = await watchClient(options)
watcher.on('event', (event) => console.info(event.code))
await watcher.close()`

export const cliAndInspect = defineDocsChapter({
  slug: 'cli-and-inspect',
  group: 'runtime',
  copy: {
    en: {
      navigation: 'Build API',
      eyebrow: '09 · API Candidate + Experimental extensions',
      title: 'Build and Vite extension kernel',
      intro: 'Use the bounded DSHX config to select Host and Client entries, attach ordinary Vite plugins, and emit loader-ready single-file artifacts.',
      description: 'Config face rules, Vite compatibility, CSS and assets, Tailwind, declarations, commands, and programmatic builds.',
      sections: [
        {
          id: 'configuration',
          label: '@becomeopc/dshx and @becomeopc/dshx/config',
          title: 'defineConfig(config)',
          blocks: [
            { kind: 'code', title: 'dshx.config.ts', code: configExample },
            {
              kind: 'api',
              rows: [
                {
                  name: 'host / client omitted',
                  type: 'convention detection',
                  body: 'Enable src/host.ts or src/client.tsx only when that file exists.',
                },
                {
                  name: 'host / client: false',
                  type: 'disabled',
                  body: 'Explicitly disables that face.',
                },
                {
                  name: 'host / client: {}',
                  type: 'explicit convention',
                  body: 'Enables the conventional entry and fails when the file does not exist.',
                },
                {
                  name: 'entry',
                  type: 'string',
                  body: 'Relocates that face inside the project root. String shorthand has been removed.',
                },
                {
                  name: 'vite.plugins',
                  type: 'readonly PluginOption[]',
                  body: 'Bounded Vite plugin list for that face. Call a stateful plugin factory separately for Host and Client.',
                },
                { name: 'build.sourcemap', type: 'boolean', body: 'Emits the face sourcemap.' },
                {
                  name: 'build.declarations',
                  type: 'boolean',
                  body: 'Defaults to true and emits dist/index.d.ts plus dist/client.d.ts for the loader module exports.',
                },
              ],
            },
            {
              kind: 'note',
              text: 'The root entry exports only browser-safe defineConfig and DshxConfig. Config resolution and compiler functions live under @becomeopc/dshx/tooling.',
            },
          ],
        },
        {
          id: 'vite',
          title: 'Vite plugin compatibility',
          blocks: [
            {
              kind: 'list',
              items: [
                'DSHX does not read vite.config.* and does not accept an arbitrary UserConfig.',
                "User plugins keep Vite's enforce/apply order. DSHX entry and browser guards run first; protocol and capability guards run last.",
                'Plugins must not replace root, configFile, publicDir, entry, output format, chunking, external, target, banner/intro/footer, or assetsInlineLimit.',
                "dshx dev uses Vite build-watch with command: build and development mode. apply: 'serve' plugins are rejected; configureServer hooks do not run, so plugins must also support build hooks.",
                'Conversation, programmatic Tooling, and the Vite compatibility layer remain Experimental even while the authoring config is an API Candidate.',
              ],
            },
          ],
        },
        {
          id: 'css',
          title: 'CSS and local assets',
          blocks: [
            {
              kind: 'paragraph',
              text: 'CSS Modules, PostCSS, Tailwind, and user transforms run through the standard Vite CSS pipeline. DSHX fixes cssCodeSplit to false, disables publicDir, and inlines local images, fonts, and SVG as data URIs.',
            },
            {
              kind: 'list',
              items: [
                'The final Client factory contains the single CSS result; registering the script alone does not inject it.',
                'Materialization creates one style element with data-plugin and data-plugin-css ownership attributes.',
                'Official DSH HMR removes the previous plugin-owned style before materializing the replacement.',
                'A final build may contain one JavaScript file, one sourcemap, and no standalone CSS, assets, chunks, workers, or WASM.',
              ],
            },
          ],
        },
        {
          id: 'tailwind',
          title: 'Optional Tailwind v4',
          blocks: [
            { kind: 'code', title: 'src/styles.css', code: tailwindCss },
            {
              kind: 'list',
              items: [
                'Install tailwindcss@^4.3.3 and @tailwindcss/vite@^4.3.3 in the plugin project, then add tailwindcss() to client.vite.plugins.',
                'Omit Preflight so a plugin cannot reset the shared DSH page DOM.',
                'Use the dshx: prefix for utilities and generated theme variables.',
                'Write complete static class names so Tailwind content detection can find them.',
                'Tailwind is optional and is not a DSHX peer dependency or Core wrapper.',
              ],
            },
          ],
        },
        {
          id: 'commands',
          title: 'check, build, and dev',
          blocks: [
            {
              kind: 'api',
              rows: [
                {
                  name: 'dshx check',
                  type: 'offline',
                  body: 'Checks config, manifest, dependency/provider edges, protocol compatibility, migration diagnostics, and TypeScript noEmit without requiring a Profile or running DSH.',
                },
                {
                  name: 'dshx check --runtime',
                  type: 'runtime readiness',
                  body: 'Additionally checks the Profile, Composition, bridge, and current DSH runtime.',
                },
                {
                  name: 'dshx build',
                  type: 'production',
                  body: 'Runs type checking before both enabled face builds, then verifies every package exports/types/bin path exists.',
                },
                {
                  name: 'dshx dev',
                  type: 'build-watch',
                  body: 'Watches both faces and reloads config/dependencies. A bad new config leaves the last-good session active until the fix is valid.',
                },
              ],
            },
            {
              kind: 'note',
              text: 'JSON check output separates static, typecheck, and runtime status. Report --runtime or a real DSH load separately from the offline result.',
            },
          ],
        },
        {
          id: 'inspect',
          title: 'dshx inspect <slots|services|events>',
          blocks: [
            {
              kind: 'paragraph',
              text: 'Reads the active DSH Composition through the selected protocol adapter. It is a live runtime inspection command, not an offline catalog; run it only after runtime readiness succeeds.',
            },
          ],
        },
        {
          id: 'programmatic',
          title: 'Programmatic build and watch',
          blocks: [
            { kind: 'code', title: 'Experimental Tooling', code: toolingBuild },
            {
              kind: 'api',
              rows: [
                {
                  name: 'buildHost / buildClient',
                  type: 'Promise<BuildReport>',
                  body: 'Build one face and return DSHX-owned artifact metadata instead of raw Vite output.',
                },
                {
                  name: 'watchHost / watchClient',
                  type: 'Promise<BuildWatcher>',
                  body: 'Watch one face and expose normalized events plus async close().',
                },
                {
                  name: 'vite.plugins',
                  type: 'readonly PluginOption[]',
                  body: 'The same bounded extension surface as project config.',
                },
              ],
            },
          ],
        },
      ],
    },
    zh: {
      navigation: 'Build API',
      eyebrow: '09 · API Candidate + Experimental 扩展',
      title: 'Build 与 Vite 扩展内核',
      intro: '使用受限 DSHX config 选择 Host/Client 入口、接入标准 Vite 插件，并输出 loader-ready 单文件产物。',
      description: 'Config face 规则、Vite 兼容性、CSS/资源、Tailwind、declaration、命令与程序化构建。',
      sections: [
        {
          id: 'configuration',
          label: '@becomeopc/dshx 与 @becomeopc/dshx/config',
          title: 'defineConfig(config)',
          blocks: [
            { kind: 'code', title: 'dshx.config.ts', code: configExample },
            {
              kind: 'api',
              rows: [
                {
                  name: '省略 host / client',
                  type: '约定检测',
                  body: '只在 src/host.ts 或 src/client.tsx 存在时启用对应 face。',
                },
                { name: 'host / client: false', type: '禁用', body: '显式禁用该 face。' },
                {
                  name: 'host / client: {}',
                  type: '显式约定',
                  body: '启用约定入口，文件不存在时报错。',
                },
                {
                  name: 'entry',
                  type: 'string',
                  body: '在项目 root 内重定位该 face；string shorthand 已删除。',
                },
                {
                  name: 'vite.plugins',
                  type: 'readonly PluginOption[]',
                  body: '该 face 的受限 Vite 插件列表；Host/Client 需分别调用有状态 plugin factory。',
                },
                { name: 'build.sourcemap', type: 'boolean', body: '输出该 face sourcemap。' },
                {
                  name: 'build.declarations',
                  type: 'boolean',
                  body: '默认 true，为 loader module export 输出 dist/index.d.ts 和 dist/client.d.ts。',
                },
              ],
            },
            {
              kind: 'note',
              text: '根入口只转出 browser-safe defineConfig 和 DshxConfig；Config resolver 与 Compiler 函数位于 @becomeopc/dshx/tooling。',
            },
          ],
        },
        {
          id: 'vite',
          title: 'Vite 插件兼容性',
          blocks: [
            {
              kind: 'list',
              items: [
                'DSHX 不读取 vite.config.*，不接受任意 UserConfig。',
                '用户插件保留 Vite enforce/apply 顺序；DSHX entry/browser guard 最先，protocol/capability guard 最后。',
                '插件不得改写 root、configFile、publicDir、entry、output format、chunking、external、target、banner/intro/footer 或 assetsInlineLimit。',
                "dshx dev 使用 command: build 与 development mode 的 Vite build-watch；会拒绝 apply: 'serve' 插件，configureServer hook 不会运行，因此插件还必须支持 build hook。",
                'Conversation、程序化 Tooling 和 Vite 兼容层仍是 Experimental，authoring config 本身是 API Candidate。',
              ],
            },
          ],
        },
        {
          id: 'css',
          title: 'CSS 与本地资源',
          blocks: [
            {
              kind: 'paragraph',
              text: 'CSS Modules、PostCSS、Tailwind 与用户 transform 经过标准 Vite CSS 管线。DSHX 固定 cssCodeSplit: false、禁用 publicDir，并把本地图片、字体和 SVG inline 为 data URI。',
            },
            {
              kind: 'list',
              items: [
                '最终 Client factory 包含唯一 CSS 结果；仅注册脚本不提前注入样式。',
                'Materialization 创建带 data-plugin 和 data-plugin-css 所有权属性的唯一 style。',
                '官方 DSH HMR 在 materialize 新版本前删除上一个插件所有的 style。',
                '最终只允许一个 JavaScript、一个 sourcemap，且不得存在独立 CSS、asset、chunk、worker 或 WASM。',
              ],
            },
          ],
        },
        {
          id: 'tailwind',
          title: '可选 Tailwind v4',
          blocks: [
            { kind: 'code', title: 'src/styles.css', code: tailwindCss },
            {
              kind: 'list',
              items: [
                '在插件项目安装 tailwindcss@^4.3.3 和 @tailwindcss/vite@^4.3.3，并把 tailwindcss() 加到 client.vite.plugins。',
                '省略 Preflight，避免插件重置 DSH 共享页面 DOM。',
                'utility 和生成 theme variable 使用 dshx: 前缀。',
                '只写可静态扫描的完整 class name。',
                'Tailwind 是可选项，不是 DSHX peer dependency 或 Core wrapper。',
              ],
            },
          ],
        },
        {
          id: 'commands',
          title: 'check、build 与 dev',
          blocks: [
            {
              kind: 'api',
              rows: [
                {
                  name: 'dshx check',
                  type: '离线',
                  body: '检查 config、manifest、dependency/provider edge、protocol 兼容、迁移诊断和 TypeScript noEmit，不需要 Profile 或运行中 DSH。',
                },
                {
                  name: 'dshx check --runtime',
                  type: 'Runtime readiness',
                  body: '额外检查 Profile、Composition、bridge 和当前 DSH Runtime。',
                },
                {
                  name: 'dshx build',
                  type: '生产',
                  body: '在两个已启用 face 构建前运行类型检查，然后验证 package 的每个 exports/types/bin 路径真实存在。',
                },
                {
                  name: 'dshx dev',
                  type: 'build-watch',
                  body: '监听两个 face 以及 config/依赖变化；新 config 失败时保留 last-good session，修复后再切换。',
                },
              ],
            },
            {
              kind: 'note',
              text: 'JSON check 输出分别提供 static、typecheck 和 runtime 状态。--runtime 或真实 DSH 加载必须与离线结果分开报告。',
            },
          ],
        },
        {
          id: 'inspect',
          title: 'dshx inspect <slots|services|events>',
          blocks: [
            {
              kind: 'paragraph',
              text: '通过选中的 protocol adapter 读取当前 DSH Composition。它是真实 Runtime 检查而不是离线 catalog；只在 Runtime readiness 成功后运行。',
            },
          ],
        },
        {
          id: 'programmatic',
          title: '程序化 build 与 watch',
          blocks: [
            { kind: 'code', title: 'Experimental Tooling', code: toolingBuild },
            {
              kind: 'api',
              rows: [
                {
                  name: 'buildHost / buildClient',
                  type: 'Promise<BuildReport>',
                  body: '构建单个 face，返回 DSHX 所有的 artifact metadata，而不是原始 Vite 输出。',
                },
                {
                  name: 'watchHost / watchClient',
                  type: 'Promise<BuildWatcher>',
                  body: '监听单个 face，暴露标准化 event 与异步 close()。',
                },
                {
                  name: 'vite.plugins',
                  type: 'readonly PluginOption[]',
                  body: '与项目 config 相同的受限扩展面。',
                },
              ],
            },
          ],
        },
      ],
    },
  },
})
