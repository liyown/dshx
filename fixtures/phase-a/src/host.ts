import { defineHost, defineTool } from '@becomeopc/dshx/host'
import { statusApi } from './api/status.js'

const startedAt = new Date().toISOString()
let requestCount = 0

const phaseATool = defineTool({
  name: 'dshx_phase_a_status',
  description: 'Return the Phase A fixture status.',
  parameters: {},
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() {
    return 'DSHX Phase A tool ready'
  },
})

const statusHostApi = statusApi.host({
  async get() {
    return { project: '@dshx/phase-a-fixture', startedAt, requestCount: ++requestCount }
  },
  async refresh({ input }) {
    return { project: input.force ? '@dshx/phase-a-fixture (refreshed)' : '@dshx/phase-a-fixture', startedAt, requestCount: ++requestCount }
  },
})

export default defineHost({
  tools: [phaseATool],
  api: statusHostApi,
  setup() {
    console.info('DSHX Phase A Host adapter loaded')
  },
})
