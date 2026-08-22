import { DshxError } from '../diagnostics.js'
import { runProjectDsh } from '../profile/command.js'
import type { DshCommandRunner, ProfileOrchestratorOptions, ResolvedDshInstallation } from '../profile/types.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { InspectProvider, ServiceSummary, EventSummary, SlotSummary, ToolSummary } from './types.js'

const BRIDGE_TIMEOUT_MS = 30_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function commandDetail(stdout: string, stderr: string): string {
  return (stderr.trim() || stdout.trim()).slice(0, 2_000) || 'unknown bridge failure'
}

/** DSHX Inspect provider backed by the official DSH local bridge command. */
export class DshInspectBridgeProvider implements InspectProvider {
  readonly listSlots = async (): Promise<readonly SlotSummary[]> => {
    throw new DshxError('DSHX3204', 'The rc.8 Inspect bridge does not expose Slot data.', { hint: 'Use the official Client Slot Inspect Provider when it is available.' })
  }

  readonly listTools = async (): Promise<readonly ToolSummary[]> => {
    throw new DshxError('DSHX3204', 'The rc.8 Inspect bridge does not expose Tool data.', { hint: 'Use the official Agent-scoped Tool Inspect Provider when it is available.' })
  }

  constructor(
    private readonly project: ResolvedDshxConfig,
    private readonly dsh: ResolvedDshInstallation,
    private readonly options: ProfileOrchestratorOptions = {},
  ) {}

  async listServices(): Promise<readonly ServiceSummary[]> {
    return await this.list('services') as unknown as readonly ServiceSummary[]
  }

  async listEvents(): Promise<readonly EventSummary[]> {
    return await this.list('events') as unknown as readonly EventSummary[]
  }

  private async list(target: 'services' | 'events'): Promise<readonly Record<string, unknown>[]> {
    const runner: DshCommandRunner = this.options.runner ?? runProjectDsh
    let result
    try {
      result = await runner(['inspect', '--profile', this.project.profile, '--target', target, '--json'], {
        cwd: this.project.root,
        env: { ...process.env, ...this.options.env },
        timeoutMs: BRIDGE_TIMEOUT_MS,
        ...(this.dsh.executable === undefined ? {} : { executable: this.dsh.executable }),
      })
    } catch (cause) {
      throw new DshxError('DSHX3202', `Failed to connect to the DSH Inspect bridge: ${cause instanceof Error ? cause.message : String(cause)}`, {
        cause,
        file: this.project.packageFile,
        hint: 'Keep the Composition running and retry the Inspect command.',
      })
    }
    if (result.exitCode !== 0) {
      const detail = commandDetail(result.stdout, result.stderr)
      const stale = /stale|not running|composition.*not running/i.test(detail)
      const unavailable = /no inspect bridge|not available|metadata|--profile <name> is required|unknown (?:command|option)/i.test(detail)
      throw new DshxError(stale ? 'DSHX3205' : unavailable ? 'DSHX3201' : 'DSHX3202', `DSH Inspect bridge failed: ${detail}`, {
        cause: result.cause,
        file: this.project.packageFile,
        hint: stale
          ? 'Start the project with dshx dev or dsh --inspect-bridge, then retry.'
          : 'Start a DSH Composition with --inspect-bridge and retry.',
      })
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(result.stdout)
    } catch (cause) {
      throw new DshxError('DSHX3203', 'DSH Inspect bridge returned invalid JSON.', {
        cause,
        file: this.project.packageFile,
        hint: 'Use a DSH build that implements Inspect bridge protocol version 1.',
      })
    }
    if (!isRecord(parsed) || parsed.version !== 1 || parsed.ok !== true || parsed.target !== target || !Array.isArray(parsed.items)) {
      throw new DshxError('DSHX3203', 'DSH Inspect bridge returned an invalid response DTO.', {
        file: this.project.packageFile,
        hint: 'Use a DSH build that implements the documented Inspect bridge response.',
      })
    }
    if (!parsed.items.every(item => isRecord(item))) {
      throw new DshxError('DSHX3203', 'DSH Inspect bridge returned an item with an invalid DTO shape.', {
        file: this.project.packageFile,
        hint: 'Use a DSH build that returns object summaries with a non-empty name.',
      })
    }
    return parsed.items as readonly Record<string, unknown>[]
  }
}
