import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { defineClient, defineSlot, useApi, useQuery } from '@becomeopc/dshx/client'
import { statusApi } from './api/status.js'
import styles from './Status.module.css'

/** A compact runtime deck that makes the live Host/Client composition visible. */
export function StatusButton(_props: PropsRuntime<'sidebar.footer.action'>) {
  const api = useApi(statusApi)
  const status = useQuery(statusApi, 'get')
  const refresh = () => { void api.refresh({ force: true }).then(() => status.retry()).catch(() => status.retry()) }
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

        <ol className={styles.activity} aria-label="Runtime activity">
          <li><span className={styles.activityMark} /><span>{status.loading ? 'Connecting to Host' : status.error ? 'Host unavailable' : 'Host API connected'}</span><time>{status.error ? 'retry' : 'live'}</time></li>
          <li><span className={styles.activityMark} /><span>Slot registered</span><time>now</time></li>
          <li><span className={styles.activityMark} /><span>{status.data?.project ?? 'Client syncing'}</span><time>{status.data?.startedAt.slice(11, 19) ?? '...'}</time></li>
        </ol>

        <div className={styles.footer}>
          <span className={styles.footerPulse} aria-hidden="true" />
          {status.error ? <button type="button" onClick={status.retry}>Retry connection</button> : <button type="button" onClick={refresh}>Refresh Host state</button>}
        </div>
      </div>
    </details>
  )
}

/** Register the Phase A component in an additive web-profile slot. */
const status = defineSlot('sidebar.footer.action', {
  id: 'dshx.phase-a.status',
  order: 0,
  component: StatusButton,
})

export default defineClient({
  api: statusApi,
  slots: [status],
})
