import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { defineClient, defineSlot } from 'dshx/client'
import styles from './Status.module.css'

/** Additive UI used to prove TSX and CSS Modules compilation. */
export function StatusButton(_props: PropsRuntime<'sidebar.footer.action'>) {
  return <button className={styles.status}>DSHX Phase A</button>
}

/** Register the Phase A component in an additive web-profile slot. */
const status = defineSlot('sidebar.footer.action', {
  id: 'dshx.phase-a.status',
  order: 0,
  component: StatusButton,
})

export default defineClient({
  slots: [status],
})
