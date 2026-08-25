export interface TemplateContext {
  readonly packageId: string
  readonly dshxVersion: string
  readonly dshVersion: string
  readonly dshRange: string
}

export const TEMPLATE_FILES = [
  'src/api/status.ts',
  'src/settings.ts',
  'src/host.ts',
  'src/client.tsx',
  'src/css-modules.d.ts',
  'src/Status.module.css',
  'dshx.config.ts',
  'package.json',
  'tsconfig.json',
  'cordis.patch.yml',
  'README.md',
] as const

export function renderTemplate(path: (typeof TEMPLATE_FILES)[number], context: TemplateContext): string {
  if (path === 'src/api/status.ts')
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
  if (path === 'src/settings.ts') {
    const candidate = (context.packageId.split('/').at(-1) ?? 'plugin')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
    const namespace = /^[a-z]/.test(candidate) ? candidate : `plugin-${candidate || 'settings'}`
    return `import Schema from '@deepseek-ai/schemastery'
import { defineSettings } from '@becomeopc/dshx/settings'

export const runtimeSettings = defineSettings({
  namespace: '${namespace}',
  schema: Schema.object({
    showActivity: Schema.boolean().default(true),
  }),
  applies: 'live',
})
`
  }
  if (path === 'src/host.ts')
    return `import { defineHost, definePromptContext, definePromptSection, defineTool } from '@becomeopc/dshx/host'
import { statusApi } from './api/status.js'
import { runtimeSettings } from './settings.js'

const startedAt = new Date().toISOString()
let requestCount = 0

const statusTool = defineTool({
  name: '${context.packageId.replace(/[^a-zA-Z0-9_-]/g, '_')}_status',
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
  text: 'Use the ${context.packageId.replace(/[^a-zA-Z0-9_-]/g, '_')}_status tool when the user asks whether this plugin is running.',
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
    return { project: input.force ? '${context.packageId} (refreshed)' : '${context.packageId}', startedAt, requestCount: ++requestCount }
  },
})

export default defineHost({
  tools: [statusTool],
  prompts: [statusGuidance, runtimeContext],
  settings: [runtimeSettings],
  api: statusHostApi,
  setup() {
    console.info('${context.packageId} Host adapter loaded')
  },
})
`
  if (path === 'src/client.tsx')
    return `import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { defineClient, defineSlot, useApi, useQuery, useSettings } from '@becomeopc/dshx/client'
import { statusApi } from './api/status.js'
import { runtimeSettings } from './settings.js'
import styles from './Status.module.css'

function StatusButton(_props: PropsRuntime<'sidebar.footer.action'>) {
  const api = useApi(statusApi)
  const status = useQuery(statusApi, 'get')
  const settings = useSettings(runtimeSettings)
  const showActivity = settings.value?.showActivity ?? true
  const refresh = () => { void api.refresh({ force: true }).then(() => status.retry()).catch(() => status.retry()) }
  const toggleActivity = () => { void settings.set('showActivity', !showActivity).catch(() => undefined) }
  return (
    <details className={styles.deck} open>
      <summary className={styles.summary} onClick={(event) => event.stopPropagation()}>
        <span className={styles.brandMark} aria-hidden="true"><span /></span>
        <span className={styles.summaryCopy}>
          <strong>DSHX Runtime</strong>
          <small>Live composition</small>
        </span>
        <span className={styles.live}><span aria-hidden="true" />LIVE</span>
      </summary>

      <div className={styles.body}>
        <div className={styles.intro}>
          <h2>Build. Ship. Observe.</h2>
          <p>Your plugin is running in the active web profile.</p>
        </div>

        <div className={styles.metrics}>
          <div><span>Profile</span><strong>web</strong></div>
          <div><span>Requests</span><strong>{status.data?.requestCount ?? '...'}</strong></div>
        </div>

        {showActivity ? (
          <ol className={styles.activity} aria-label="Runtime activity">
            <li><span className={styles.activityMark} /><span>{status.loading ? 'Connecting to Host' : status.error ? 'Host unavailable' : 'Host API connected'}</span><time>{status.error ? 'retry' : 'live'}</time></li>
            <li><span className={styles.activityMark} /><span>Slot registered</span><time>now</time></li>
            <li><span className={styles.activityMark} /><span>{status.data?.project ?? 'Client syncing'}</span><time>{status.data?.startedAt.slice(11, 19) ?? '...'}</time></li>
          </ol>
        ) : null}

        <div className={styles.settingsControl}>
          <button type="button" disabled={!settings.writable || settings.mutation.pending} onClick={toggleActivity}>
            {settings.mutation.pending ? 'Saving…' : showActivity ? 'Hide activity' : 'Show activity'}
          </button>
          {settings.error ? <span role="status">{settings.error.message}</span> : settings.mutation.error ? <span role="status">Setting update failed</span> : null}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerPulse} aria-hidden="true" />
          {status.error ? <button type="button" onClick={status.retry}>Retry connection</button> : <button type="button" onClick={refresh}>Refresh Host state</button>}
        </div>
      </div>
    </details>
  )
}

const status = defineSlot('sidebar.footer.action', {
  id: '${context.packageId}.status',
  order: 0,
  component: StatusButton,
})

export default defineClient({ api: statusApi, slots: [status] })
`
  if (path === 'src/css-modules.d.ts')
    return `declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
`
  if (path === 'src/Status.module.css')
    return `.deck {
  width: min(252px, calc(100vw - 28px));
  overflow: hidden;
  color: #eff7f5;
  background: #101b2a;
  border: 1px solid #2a4050;
  border-radius: 14px;
  box-shadow: 0 16px 34px rgba(7, 17, 28, 0.2);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 10px 12px;
  cursor: pointer;
  list-style: none;
}

.summary::-webkit-details-marker {
  display: none;
}

.summary:focus-visible {
  outline: 2px solid #6de0c5;
  outline-offset: -3px;
}

.brandMark {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border: 1px solid #2b6870;
  border-radius: 9px;
  background: #12343a;
}

.brandMark span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #6de0c5;
  box-shadow: 0 0 0 4px rgba(109, 224, 197, 0.12);
}

.summaryCopy {
  display: grid;
  min-width: 0;
  gap: 2px;
  flex: 1;
}

.summaryCopy strong {
  overflow: hidden;
  color: #f4fbf9;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summaryCopy small {
  color: #93a9b8;
  font-size: 10px;
  letter-spacing: 0;
}

.live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #6de0c5;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.live span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #6de0c5;
}

.body {
  padding: 0 12px 12px;
}

.intro {
  padding: 13px 0 12px;
  border-top: 1px solid #223548;
}

.intro h2 {
  margin: 0;
  color: #f4fbf9;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.intro p {
  max-width: 29ch;
  margin: 6px 0 0;
  color: #9db0be;
  font-size: 11px;
  line-height: 1.45;
}

.metrics {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid #223548;
  border-bottom: 1px solid #223548;
}

.metrics div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.metrics span {
  color: #8095a5;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.metrics strong {
  overflow: hidden;
  color: #e4f0ed;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 13px 0 12px;
  list-style: none;
}

.activity li {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: #c5d4d6;
  font-size: 10px;
}

.activityMark {
  width: 6px;
  height: 6px;
  border: 1px solid #6de0c5;
  border-radius: 50%;
  background: #163e40;
}

.activity time {
  color: #718895;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.footer {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #87a0aa;
  font-size: 10px;
}

.settingsControl {
  display: grid;
  gap: 6px;
  padding: 0 0 12px;
}

.settingsControl button,
.footer button {
  width: fit-content;
  padding: 0;
  color: #9fd8cb;
  background: transparent;
  border: 0;
  font: inherit;
  cursor: pointer;
}

.settingsControl button:disabled {
  color: #718895;
  cursor: wait;
}

.settingsControl span {
  color: #efb4aa;
  font-size: 9px;
  line-height: 1.35;
}

.footerPulse {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: #efc46d;
  transform: rotate(45deg);
}

@media (max-width: 420px) {
  .deck {
    width: min(252px, calc(100vw - 20px));
  }
}
`
  if (path === 'dshx.config.ts')
    return `import { defineConfig } from '@becomeopc/dshx/config'

export default defineConfig({
  profile: 'web',
  dev: { hostRestart: 'manual' },
})
`
  if (path === 'package.json')
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
            inject: ['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-sidebar', '@deepseek-ai/dsh-client-ui-settings'],
            external: [],
            immediately: false,
          },
        },
        scripts: { dev: 'dshx dev --open', build: 'dshx build', check: 'dshx check' },
        devDependencies: {
          '@becomeopc/dshx': context.dshxVersion,
          '@deepseek-ai/dsh': context.dshVersion,
          '@deepseek-ai/cordis': '^4.0.1',
          '@deepseek-ai/dsh-cordis-host-runner': context.dshVersion,
          '@deepseek-ai/dsh-tool-cordis': context.dshVersion,
          '@deepseek-ai/dsh-tools': context.dshVersion,
          '@deepseek-ai/dsh-system-prompt': context.dshVersion,
          '@deepseek-ai/dsh-settings': context.dshVersion,
          '@deepseek-ai/schemastery': '3.18.1',
          '@deepseek-ai/dsh-client-ui-settings': context.dshVersion,
          '@deepseek-ai/dsh-client-ui-slots': context.dshVersion,
          '@deepseek-ai/dsh-client-ui-sidebar': context.dshVersion,
          '@types/node': '^22.19.0',
          '@types/react': '~18.3.31',
          react: '^18.3.1',
          typescript: '^5.9.3',
        },
        peerDependencies: {
          '@deepseek-ai/dsh': context.dshRange,
          '@deepseek-ai/dsh-system-prompt': context.dshRange,
          '@deepseek-ai/dsh-tools': context.dshRange,
          '@deepseek-ai/dsh-settings': context.dshRange,
          '@deepseek-ai/schemastery': '^3.18.1',
          '@deepseek-ai/dsh-client-ui-settings': context.dshRange,
        },
      },
      null,
      2,
    )}
`
  if (path === 'tsconfig.json')
    return `${JSON.stringify({ compilerOptions: { target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext', preserveSymlinks: true, jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true }, include: ['src/**/*.ts', 'src/**/*.tsx'] }, null, 2)}
`
  if (path === 'cordis.patch.yml')
    return `- insert:
    - id: ${context.packageId.replace(/[^a-zA-Z0-9_-]/g, '-')}
      name: "${context.packageId}"
`
  return `# ${context.packageId}

This plugin was created with create-dshx.

Run \`pnpm install\` (or your package manager's install command), then \`pnpm dev\`. The dev script starts DSH, opens the web profile in your browser, and serves the Runtime Deck from the generated Client.
`
}
