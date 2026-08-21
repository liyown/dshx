import styles from './Status.module.css'

interface SlotsService {
  inject(name: string, register: () => unknown): unknown
  register(options: {
    readonly name: string
    readonly id: string
    readonly order: number
  }, component: () => unknown): unknown
}

interface ClientContext {
  readonly slots: SlotsService
}

/** Cordis services required by this fixture. */
export const inject = ['slots']

/** Additive UI used to prove TSX and CSS Modules compilation. */
export function StatusButton() {
  return <button className={styles.status}>DSHX Phase A</button>
}

/** Register the Phase A component in an additive web-profile slot. */
export function apply(ctx: ClientContext): unknown {
  return ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'dshx.phase-a.status', order: 0 },
    StatusButton,
  ))
}
