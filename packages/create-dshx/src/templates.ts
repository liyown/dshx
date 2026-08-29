import type { ProjectStyle, RenderedTemplateFile, TemplateContext, TemplateName } from './types.js'

type DependencyMap = Readonly<Record<string, string>>

interface TemplateDefinition {
  readonly label: string
  readonly description: string
  readonly clientProviders: readonly string[]
  readonly devDependencies: (context: TemplateContext) => DependencyMap
  readonly peerDependencies: (context: TemplateContext) => DependencyMap
  readonly files: (context: TemplateContext, style: ProjectStyle) => readonly RenderedTemplateFile[]
}

interface StyleDefinition {
  readonly label: string
  readonly description: string
  readonly devDependencies: DependencyMap
  readonly files: () => readonly RenderedTemplateFile[]
}

const sidebarProvider = '@deepseek-ai/dsh-client-ui-sidebar'
const connectionProvider = '@deepseek-ai/dsh-client-connection'
const localeProvider = '@deepseek-ai/dsh-client-locale'
const settingsProvider = '@deepseek-ai/dsh-client-ui-settings'

function packageSlug(packageId: string): string {
  const candidate = (packageId.split('/').at(-1) ?? 'plugin')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
  return /^[a-z]/.test(candidate) ? candidate : `plugin-${candidate || 'settings'}`
}

function toolName(packageId: string): string {
  return `${packageId.replace(/[^a-zA-Z0-9_-]/g, '_')}_status`
}

function styleImport(style: ProjectStyle): string {
  if (style === 'css-modules') return "import styles from './Plugin.module.css'\n"
  if (style === 'tailwind') return "import './styles.css'\n"
  return ''
}

function classAttribute(style: ProjectStyle, cssModule: string, tailwind: string): string {
  if (style === 'css-modules') return ` className={styles.${cssModule}}`
  if (style === 'tailwind') return ` className="${tailwind}"`
  return ''
}

function renderStarterHost(context: TemplateContext): string {
  return `import { defineHost, defineTool } from '@becomeopc/dshx/host'

const statusTool = defineTool({
  name: '${toolName(context.packageId)}',
  description: 'Return the plugin status.',
  parameters: {},
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() {
    return '${context.packageId} is ready'
  },
})

export default defineHost({
  name: '${context.packageId}',
  tools: [statusTool],
})
`
}

function renderStarterClient(context: TemplateContext, style: ProjectStyle): string {
  return `import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { defineClient, defineLocale, defineSlot, type PropsLocaleOf } from '@becomeopc/dshx/client'
${styleImport(style)}
const copy = defineLocale('${packageSlug(context.packageId)}.status', {
  zh: {
    eyebrow: 'DSHX 插件',
    connected: 'Host 与 Client 已连接。',
  },
  en: {
    eyebrow: 'DSHX plugin',
    connected: 'Host and Client are connected.',
  },
})

function PluginStatus({ t }: PropsLocaleOf<typeof copy>) {
  return (
    <section${classAttribute(style, 'card', 'dshx:w-[252px] dshx:rounded-xl dshx:border dshx:border-slate-700 dshx:bg-slate-950 dshx:p-4 dshx:text-slate-100 dshx:shadow-xl')}>
      <p${classAttribute(style, 'eyebrow', 'dshx:m-0 dshx:text-xs dshx:font-semibold dshx:uppercase dshx:tracking-widest dshx:text-emerald-300')}>{t('eyebrow')}</p>
      <h2${classAttribute(style, 'title', 'dshx:mt-2 dshx:mb-0 dshx:text-lg dshx:font-semibold')}>${context.packageId}</h2>
      <p${classAttribute(style, 'body', 'dshx:mt-2 dshx:mb-0 dshx:text-sm dshx:leading-6 dshx:text-slate-300')}>{t('connected')}</p>
    </section>
  )
}

const statusSlot = defineSlot('sidebar.footer.action', {
  id: '${context.packageId}.status',
  order: 0,
  locale: copy,
  component: PluginStatus,
})

export default defineClient({
  name: '${context.packageId}',
  locales: [copy],
  slots: [statusSlot],
})
`
}

function renderStatusApi(): string {
  return `import { defineApi, method } from '@becomeopc/dshx/api'

export interface Status {
  readonly project: string
  readonly startedAt: string
  readonly requestCount: number
}

export const statusApi = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<void, Status>(),
    refresh: method<{ readonly force?: boolean }, Status>(),
  },
})
`
}

function renderSettings(context: TemplateContext): string {
  return `import Schema from '@deepseek-ai/schemastery'
import { defineSettings } from '@becomeopc/dshx/settings'

export const runtimeSettings = defineSettings({
  namespace: '${packageSlug(context.packageId)}',
  schema: Schema.object({
    showActivity: Schema.boolean().default(true),
  }),
  applies: 'live',
})
`
}

function renderShowcaseHost(context: TemplateContext): string {
  return `import { defineHost, definePromptContext, definePromptSection, defineTool } from '@becomeopc/dshx/host'
import { statusApi } from './api/status.js'
import { runtimeSettings } from './settings.js'

const startedAt = new Date().toISOString()
let requestCount = 0

const statusTool = defineTool({
  name: '${toolName(context.packageId)}',
  description: 'Return the plugin status.',
  parameters: {},
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() {
    return '${context.packageId} is ready'
  },
})

const statusGuidance = definePromptSection({
  name: '${context.packageId}:guidance',
  order: 150,
  text: 'Use the ${toolName(context.packageId)} tool when the user asks whether this plugin is running.',
})

const runtimeContext = definePromptContext({
  name: '${context.packageId}:runtime',
  order: 0,
  text: () => '${context.packageId} status requests: ' + requestCount,
})

const statusHostApi = statusApi.host({
  async get() {
    return { project: '${context.packageId}', startedAt, requestCount: ++requestCount }
  },
  async refresh({ input }) {
    return {
      project: input.force ? '${context.packageId} (refreshed)' : '${context.packageId}',
      startedAt,
      requestCount: ++requestCount,
    }
  },
})

export default defineHost({
  name: '${context.packageId}',
  tools: [statusTool],
  prompts: [statusGuidance, runtimeContext],
  settings: [runtimeSettings],
  apis: [statusHostApi],
})
`
}

function renderShowcaseClient(context: TemplateContext, style: ProjectStyle): string {
  return `import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { defineClient, defineSlot, useApi, useApiQuery, useSettings } from '@becomeopc/dshx/client'
import { statusApi } from './api/status.js'
import { runtimeSettings } from './settings.js'
${styleImport(style)}
function RuntimeDeck() {
  const api = useApi(statusApi)
  const status = useApiQuery(statusApi, 'get', { enabled: true })
  const settings = useSettings(runtimeSettings)
  const showActivity = settings.value?.showActivity ?? true

  const refresh = () => {
    void api.refresh({ force: true }).then(() => status.refetch()).catch(() => status.refetch())
  }
  const toggleActivity = () => {
    void settings.set('showActivity', !showActivity).catch(() => undefined)
  }

  return (
    <section${classAttribute(style, 'deck', 'dshx:w-[252px] dshx:overflow-hidden dshx:rounded-xl dshx:border dshx:border-slate-700 dshx:bg-slate-950 dshx:text-slate-100 dshx:shadow-xl')}>
      <header${classAttribute(style, 'header', 'dshx:flex dshx:items-center dshx:justify-between dshx:border-b dshx:border-slate-800 dshx:px-4 dshx:py-3')}>
        <div>
          <p${classAttribute(style, 'eyebrow', 'dshx:m-0 dshx:text-xs dshx:font-semibold dshx:uppercase dshx:tracking-widest dshx:text-emerald-300')}>DSHX Runtime</p>
          <h2${classAttribute(style, 'title', 'dshx:mt-1 dshx:mb-0 dshx:text-base dshx:font-semibold')}>${context.packageId}</h2>
        </div>
        <span${classAttribute(style, 'badge', 'dshx:rounded-full dshx:bg-emerald-400/10 dshx:px-2 dshx:py-1 dshx:text-[10px] dshx:font-bold dshx:text-emerald-300')}>{status.fetchStatus}</span>
      </header>

      <div${classAttribute(style, 'body', 'dshx:grid dshx:gap-3 dshx:p-4')}>
        <p${classAttribute(style, 'message', 'dshx:m-0 dshx:text-sm dshx:text-slate-300')} aria-live="polite">
          {status.status === 'pending' ? 'Connecting to Host…' : status.status === 'error' ? status.error.message : <>{status.data.project} · {status.data.requestCount} requests</>}
        </p>

        {showActivity ? <p${classAttribute(style, 'activity', 'dshx:m-0 dshx:rounded-lg dshx:bg-slate-900 dshx:px-3 dshx:py-2 dshx:text-xs dshx:text-slate-400')}>Slot registered. Prompt and Settings are live.</p> : null}

        <div${classAttribute(style, 'actions', 'dshx:flex dshx:flex-wrap dshx:gap-2')}>
          <button${classAttribute(style, 'button', 'dshx:rounded-md dshx:bg-emerald-300 dshx:px-3 dshx:py-2 dshx:text-xs dshx:font-semibold dshx:text-slate-950')} type="button" onClick={refresh}>Refresh</button>
          <button${classAttribute(style, 'secondaryButton', 'dshx:rounded-md dshx:border dshx:border-slate-700 dshx:bg-transparent dshx:px-3 dshx:py-2 dshx:text-xs dshx:font-semibold dshx:text-slate-200')} type="button" disabled={!settings.writable || settings.mutation.pending} onClick={toggleActivity}>
            {settings.mutation.pending ? 'Saving…' : showActivity ? 'Hide activity' : 'Show activity'}
          </button>
        </div>
        {settings.error ? <p${classAttribute(style, 'error', 'dshx:m-0 dshx:text-xs dshx:text-red-300')} role="status">{settings.error.message}</p> : null}
      </div>
    </section>
  )
}

const runtimeDeck = defineSlot('sidebar.footer.action', {
  id: '${context.packageId}.runtime-deck',
  order: 0,
  component: RuntimeDeck,
})

export default defineClient({
  name: '${context.packageId}',
  slots: [runtimeDeck],
})
`
}

const cssModuleDeclaration = `declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
`

const cssModuleStyles = `.card,
.deck {
  width: min(252px, calc(100vw - 28px));
  color: #f1f5f9;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 12px;
  box-shadow: 0 16px 34px rgba(2, 6, 23, 0.24);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.card { padding: 16px; }
.deck { overflow: hidden; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #1e293b; }
.body { display: grid; gap: 12px; padding: 16px; }
.eyebrow { margin: 0; color: #6ee7b7; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.title { margin: 6px 0 0; color: #f8fafc; font-size: 17px; line-height: 1.25; }
.card .body, .message, .activity, .error { margin: 8px 0 0; font-size: 12px; line-height: 1.5; }
.message { margin: 0; color: #cbd5e1; }
.activity { margin: 0; padding: 8px 10px; color: #94a3b8; background: #0f172a; border-radius: 8px; }
.error { margin: 0; color: #fca5a5; }
.badge { padding: 4px 8px; color: #6ee7b7; background: rgba(52, 211, 153, 0.1); border-radius: 999px; font-size: 10px; font-weight: 700; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.button, .secondaryButton { padding: 7px 10px; border-radius: 6px; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.button { color: #020617; background: #6ee7b7; border: 1px solid #6ee7b7; }
.secondaryButton { color: #e2e8f0; background: transparent; border: 1px solid #475569; }
.secondaryButton:disabled { opacity: 0.55; cursor: wait; }
`

const tailwindStyles = `@layer theme, utilities;

@import "tailwindcss/theme.css"
  layer(theme)
  prefix(dshx);

@import "tailwindcss/utilities.css"
  layer(utilities)
  source("./")
  prefix(dshx);
`

export const STYLE_REGISTRY = {
  'css-modules': {
    label: 'CSS Modules',
    description: 'Scoped CSS through the standard Vite CSS Modules pipeline.',
    devDependencies: {},
    files: () => [
      { path: 'src/css-modules.d.ts', contents: cssModuleDeclaration },
      { path: 'src/Plugin.module.css', contents: cssModuleStyles },
    ],
  },
  tailwind: {
    label: 'Tailwind CSS',
    description: 'Tailwind v4 utilities with a dshx prefix and no Preflight.',
    devDependencies: {
      tailwindcss: '^4.3.3',
      '@tailwindcss/vite': '^4.3.3',
    },
    files: () => [{ path: 'src/styles.css', contents: tailwindStyles }],
  },
  none: {
    label: 'No styles',
    description: 'No stylesheet or styling build dependency.',
    devDependencies: {},
    files: () => [],
  },
} as const satisfies Record<ProjectStyle, StyleDefinition>

export const TEMPLATE_REGISTRY = {
  starter: {
    label: 'Starter',
    description: 'A minimal Host Tool and visible Client Slot.',
    clientProviders: [localeProvider, sidebarProvider],
    devDependencies: context => ({
      '@becomeopc/dshx': context.dshxVersion,
      '@deepseek-ai/dsh': context.dshVersion,
      '@deepseek-ai/dsh-cordis-host-runner': context.dshVersion,
      '@deepseek-ai/dsh-settings': context.dshVersion,
      '@deepseek-ai/dsh-tool-cordis': context.dshVersion,
      '@deepseek-ai/dsh-tools': context.dshVersion,
      [localeProvider]: context.dshVersion,
      [sidebarProvider]: context.dshVersion,
      '@types/node': '^22.19.0',
      '@types/react': '~18.3.31',
      react: '^18.3.1',
      typescript: '^5.9.3',
    }),
    peerDependencies: context => ({
      '@deepseek-ai/dsh': context.dshRange,
      '@deepseek-ai/dsh-settings': context.dshRange,
      '@deepseek-ai/dsh-tools': context.dshRange,
      [localeProvider]: context.dshRange,
      [sidebarProvider]: context.dshRange,
    }),
    files: (context, style) => [
      { path: 'src/host.ts', contents: renderStarterHost(context) },
      { path: 'src/client.tsx', contents: renderStarterClient(context, style) },
    ],
  },
  showcase: {
    label: 'Showcase',
    description: 'Tool, Prompt, Settings, typed API, and Runtime Deck Slot.',
    clientProviders: [connectionProvider, sidebarProvider, settingsProvider],
    devDependencies: context => ({
      '@becomeopc/dshx': context.dshxVersion,
      '@deepseek-ai/dsh': context.dshVersion,
      '@deepseek-ai/dsh-cordis-host-runner': context.dshVersion,
      '@deepseek-ai/dsh-tool-cordis': context.dshVersion,
      '@deepseek-ai/dsh-tools': context.dshVersion,
      '@deepseek-ai/dsh-system-prompt': context.dshVersion,
      '@deepseek-ai/dsh-settings': context.dshVersion,
      '@deepseek-ai/schemastery': '3.18.1',
      [connectionProvider]: context.dshVersion,
      [sidebarProvider]: context.dshVersion,
      [settingsProvider]: context.dshVersion,
      '@types/node': '^22.19.0',
      '@types/react': '~18.3.31',
      react: '^18.3.1',
      typescript: '^5.9.3',
    }),
    peerDependencies: context => ({
      '@deepseek-ai/dsh': context.dshRange,
      '@deepseek-ai/dsh-tools': context.dshRange,
      '@deepseek-ai/dsh-system-prompt': context.dshRange,
      '@deepseek-ai/dsh-settings': context.dshRange,
      '@deepseek-ai/schemastery': '^3.18.1',
      [connectionProvider]: context.dshRange,
      [sidebarProvider]: context.dshRange,
      [settingsProvider]: context.dshRange,
    }),
    files: (context, style) => [
      { path: 'src/api/status.ts', contents: renderStatusApi() },
      { path: 'src/settings.ts', contents: renderSettings(context) },
      { path: 'src/host.ts', contents: renderShowcaseHost(context) },
      { path: 'src/client.tsx', contents: renderShowcaseClient(context, style) },
    ],
  },
} as const satisfies Record<TemplateName, TemplateDefinition>

function renderConfig(style: ProjectStyle): string {
  const tailwindImport = style === 'tailwind' ? "import tailwindcss from '@tailwindcss/vite'\n" : ''
  const client =
    style === 'tailwind' ? `client: {\n    entry: 'src/client.tsx',\n    vite: { plugins: [tailwindcss()] },\n  }` : `client: { entry: 'src/client.tsx' }`
  return `${tailwindImport}import { defineConfig } from '@becomeopc/dshx'

export default defineConfig({
  host: { entry: 'src/host.ts' },
  ${client},
  build: {
    sourcemap: true,
    declarations: true,
  },
})
`
}

function renderManifest(context: TemplateContext, templateName: TemplateName, style: ProjectStyle): string {
  const template = TEMPLATE_REGISTRY[templateName]
  const styleDefinition = STYLE_REGISTRY[style]
  return `${JSON.stringify(
    {
      name: context.packageId,
      version: '0.0.0',
      private: true,
      type: 'module',
      main: './dist/index.js',
      exports: {
        '.': { types: './dist/index.d.ts', default: './dist/index.js' },
        './client': { types: './dist/client.d.ts', default: './dist/client.js' },
        './cordis.patch.yml': './cordis.patch.yml',
        './package.json': './package.json',
      },
      files: ['dist', 'cordis.patch.yml'],
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: {
          platform: 'web',
          inject: [...template.clientProviders],
          external: [],
          immediately: false,
        },
      },
      scripts: {
        check: 'dshx check',
        build: 'dshx build',
        dev: 'dshx dev --open',
        prepack: 'npm run check && npm run build',
      },
      devDependencies: {
        ...template.devDependencies(context),
        ...styleDefinition.devDependencies,
      },
      peerDependencies: template.peerDependencies(context),
    },
    null,
    2,
  )}
`
}

function renderTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2024',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        preserveSymlinks: true,
        jsx: 'react-jsx',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['dshx.config.ts', 'src/**/*.ts', 'src/**/*.tsx'],
    },
    null,
    2,
  )}
`
}

function renderReadme(context: TemplateContext, template: TemplateName, style: ProjectStyle): string {
  return `# ${context.packageId}

This ${template} plugin was created with create-dshx using ${STYLE_REGISTRY[style].label}.

\`\`\`bash
pnpm install
pnpm check
pnpm build
pnpm dev
\`\`\`

The \`prepack\` script runs the offline project check and production build before packaging.

Client dependencies have two distinct layers: \`package.json#dsh.client.inject\` loads provider packages, while \`defineClient({ inject: [...] })\` declares Cordis services read directly by \`setup(ctx)\`. Declarative \`defineLocale()\` contributions add the \`locale\` service automatically, but still require \`@deepseek-ai/dsh-client-locale\` in the package edge list.
`
}

/** Compose exactly the feature and style files required by one generated project. */
export function renderProjectTemplate(context: TemplateContext, templateName: TemplateName, style: ProjectStyle): readonly RenderedTemplateFile[] {
  const template = TEMPLATE_REGISTRY[templateName]
  return [
    ...template.files(context, style),
    ...STYLE_REGISTRY[style].files(),
    { path: 'dshx.config.ts', contents: renderConfig(style) },
    { path: 'package.json', contents: renderManifest(context, templateName, style) },
    { path: 'tsconfig.json', contents: renderTsconfig() },
    {
      path: 'cordis.patch.yml',
      contents: `- insert:\n    - id: ${context.packageId.replace(/[^a-zA-Z0-9_-]/g, '-')}\n      name: "${context.packageId}"\n`,
    },
    { path: 'README.md', contents: renderReadme(context, templateName, style) },
  ]
}
