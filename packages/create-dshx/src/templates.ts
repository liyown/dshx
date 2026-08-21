export interface TemplateContext { readonly packageId: string; readonly dshxVersion: string; readonly dshVersion: string }

export const TEMPLATE_FILES = [
  'src/host.ts', 'src/client.tsx', 'src/css-modules.d.ts', 'src/Status.module.css',
  'dshx.config.ts', 'package.json', 'tsconfig.json', 'cordis.patch.yml', 'README.md',
] as const

export function renderTemplate(path: (typeof TEMPLATE_FILES)[number], context: TemplateContext): string {
  if (path === 'src/host.ts') return `import { defineHost, defineTool } from 'dshx/host'

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

export default defineHost({
  tools: [statusTool],
  setup() {
    console.info('${context.packageId} Host adapter loaded')
  },
})
`
  if (path === 'src/client.tsx') return `import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { defineClient, defineSlot } from 'dshx/client'
import styles from './Status.module.css'

function StatusButton(_props: PropsRuntime<'sidebar.footer.action'>) {
  return <button className={styles.status}>${context.packageId}</button>
}

const status = defineSlot('sidebar.footer.action', {
  id: '${context.packageId}.status',
  order: 0,
  component: StatusButton,
})

export default defineClient({ slots: [status] })
`
  if (path === 'src/css-modules.d.ts') return `declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
`
  if (path === 'src/Status.module.css') return `.status {
  border: 1px solid currentColor;
  border-radius: 4px;
  padding: 6px 10px;
}
`
  if (path === 'dshx.config.ts') return `import { defineConfig } from 'dshx/config'

export default defineConfig({
  profile: 'web',
  dev: { hostRestart: 'manual' },
})
`
  if (path === 'package.json') return `${JSON.stringify({
    name: context.packageId, version: '0.0.0', private: true, type: 'module',
    main: './dist/index.js',
    exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './client': { types: './dist/client.d.ts', default: './dist/client.js' },
      './cordis.patch.yml': './cordis.patch.yml', './package.json': './package.json',
    },
    files: ['dist', 'cordis.patch.yml'],
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-sidebar'], external: [], immediately: false } },
    scripts: { dev: 'dshx dev', build: 'dshx build', check: 'dshx check' },
    devDependencies: {
      dshx: context.dshxVersion, '@deepseek-ai/dsh': context.dshVersion,
      '@deepseek-ai/cordis': '^4.0.1', '@deepseek-ai/dsh-tools': '>=0.1.0-rc.8 <0.2.0',
      '@deepseek-ai/dsh-client-ui-slots': '>=0.1.0-rc.8 <0.2.0', '@deepseek-ai/dsh-client-ui-sidebar': '>=0.1.0-rc.8 <0.2.0',
      '@types/node': '^22.19.0', '@types/react': '~18.3.31', react: '^18.3.1', typescript: '^5.9.3',
    },
    peerDependencies: { '@deepseek-ai/dsh-tools': '>=0.1.0-rc.8 <0.2.0' },
  }, null, 2)}
`
  if (path === 'tsconfig.json') return `${JSON.stringify({ compilerOptions: { target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true }, include: ['src/**/*.ts', 'src/**/*.tsx'] }, null, 2)}
`
  if (path === 'cordis.patch.yml') return `- insert:
    - id: ${context.packageId.replace(/[^a-zA-Z0-9_-]/g, '-')}
      name: "${context.packageId}"
`
  return `# ${context.packageId}

This plugin was created with create-dshx.

Run \`pnpm install\` (or your package manager's install command), then \`pnpm dev\`.
`
}
