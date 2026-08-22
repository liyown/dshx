import { defineHost, defineTool } from '@becomeopc/dshx/host'

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

export default defineHost({
  tools: [phaseATool],
  setup() {
    console.info('DSHX Phase A Host adapter loaded')
  },
})
