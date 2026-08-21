import { DshxError } from '../diagnostics.js'
import { RC8_COMPATIBILITY } from './rc8.js'

export { RC8_COMPATIBILITY } from './rc8.js'
export type { DshCompatibility } from './types.js'

/** Resolve an exact, verified DSH compatibility adapter. */
export function resolveCompatibility(version: string) {
  if (version === RC8_COMPATIBILITY.version) return RC8_COMPATIBILITY
  throw new DshxError(
    'DSHX5101',
    `Unsupported DSH version ${JSON.stringify(version)}.`,
    {
      hint: `This DSHX build is verified only against ${RC8_COMPATIBILITY.version}.`,
    },
  )
}
