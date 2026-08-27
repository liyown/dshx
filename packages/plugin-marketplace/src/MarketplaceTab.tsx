import { IconDownloadOutline16, IconLoadingOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useApi, useApiQuery, type PropsLocaleOf } from '@becomeopc/dshx/client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { InstallFailureCode, MarketplaceCard, MarketplaceLocale } from './api.js'
import { pluginMarketplaceApi } from './api.js'
import { marketplaceLocale, type MarketplaceLocaleKey } from './locales.js'
import styles from './MarketplaceTab.module.css'

export type MarketplaceTabProps = PropsRuntime<'settings.plugins.tab'> & PropsLocaleOf<typeof marketplaceLocale>

type Translate = MarketplaceTabProps['t']
type ModalState =
  | { readonly kind: 'confirm'; readonly plugin: MarketplaceCard }
  | { readonly kind: 'risk'; readonly plugin: MarketplaceCard }
  | { readonly kind: 'success'; readonly plugin: MarketplaceCard }
  | {
      readonly kind: 'failure'
      readonly plugin: MarketplaceCard
      readonly code: InstallFailureCode
    }

const FAILURE_COPY = {
  busy: 'busy',
  'catalog-unavailable': 'catalogUnavailable',
  'target-unavailable': 'targetUnavailable',
  'profile-unavailable': 'profileUnavailable',
  'compatibility-unknown': 'installCompatibilityUnknown',
  incompatible: 'installIncompatible',
  'install-failed': 'installFailed',
  'activation-missing': 'activationMissing',
  cancelled: 'cancelled',
  timeout: 'timeout',
} as const satisfies Record<InstallFailureCode, MarketplaceLocaleKey>

function currentLocale(): MarketplaceLocale {
  if (typeof document === 'undefined') return 'en'
  return document.documentElement.lang.toLocaleLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([^}]+)\}/g, (_match, key: string) => values[key] ?? '')
}

function PluginIcon({ plugin }: { readonly plugin: MarketplaceCard }): ReactNode {
  const [failed, setFailed] = useState(false)
  if (plugin.iconUrl === null || failed) {
    return (
      <span className={styles.glyph} aria-hidden="true">
        {plugin.glyph}
      </span>
    )
  }
  return (
    <span className={styles.icon} aria-hidden="true">
      <img
        src={plugin.iconUrl}
        alt=""
        onError={() => {
          setFailed(true)
        }}
      />
    </span>
  )
}

function sourceLabel(plugin: MarketplaceCard, t: Translate): string {
  return t(plugin.badge)
}

function InstallDialog({
  state,
  installing,
  t,
  onClose,
  onContinue,
  onRetry,
  onInstall,
}: {
  readonly state: ModalState
  readonly installing: boolean
  readonly t: Translate
  readonly onClose: () => void
  readonly onContinue: (plugin: MarketplaceCard) => void
  readonly onRetry: (plugin: MarketplaceCard) => void
  readonly onInstall: (plugin: MarketplaceCard) => void
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog !== null && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  const confirm = state.kind === 'confirm'
  const risk = state.kind === 'risk'
  const success = state.kind === 'success'
  const title = confirm ? t('installTitle') : risk ? t('riskTitle') : success ? t('installSuccessTitle') : t('installFailedTitle')

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="plugin-marketplace-dialog-title"
      onCancel={event => {
        event.preventDefault()
        if (!installing) onClose()
      }}
      onClick={event => {
        if (event.target === event.currentTarget && !installing) onClose()
      }}
    >
      <div className={styles.dialogSurface}>
        <header className={styles.dialogHeader}>
          <PluginIcon plugin={state.plugin} />
          <div>
            <h3 id="plugin-marketplace-dialog-title">{title}</h3>
            <p>{state.plugin.name}</p>
          </div>
        </header>

        {confirm ? (
          <>
            <p className={styles.dialogMessage}>{t('installToProfile')}</p>
            <dl className={styles.installFacts}>
              <div>
                <dt>{t('packageLabel')}</dt>
                <dd>
                  <code>{state.plugin.packageName}</code>
                </dd>
              </div>
              <div>
                <dt>{t('versionLabel')}</dt>
                <dd>{state.plugin.version}</dd>
              </div>
              <div>
                <dt>{t('sourceLabel')}</dt>
                <dd>{sourceLabel(state.plugin, t)}</dd>
              </div>
            </dl>
            <p className={styles.warning} role="note">
              {t('riskWarning')}
            </p>
          </>
        ) : null}
        {risk ? (
          <p className={styles.warning} role="alert">
            {t('riskWarning')}
          </p>
        ) : null}
        {success ? (
          <p className={styles.successMessage} role="status">
            {t('installSuccess')}
          </p>
        ) : null}
        {state.kind === 'failure' ? (
          <p className={styles.failureMessage} role="alert">
            {t(FAILURE_COPY[state.code])}
          </p>
        ) : null}

        <footer className={styles.dialogActions}>
          {confirm || risk ? (
            <>
              <button type="button" className={styles.secondaryButton} disabled={installing} onClick={onClose}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={installing}
                onClick={() => {
                  if (confirm) onContinue(state.plugin)
                  else onInstall(state.plugin)
                }}
              >
                <span aria-hidden="true">{installing ? <IconLoadingOutline16 className={styles.spinner} /> : risk ? <IconDownloadOutline16 /> : null}</span>
                {installing ? t('downloading') : risk ? t('finalConfirmInstall') : t('continueInstall')}
              </button>
            </>
          ) : state.kind === 'failure' ? (
            <>
              <button type="button" className={styles.secondaryButton} onClick={onClose}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  onRetry(state.plugin)
                }}
              >
                {t('retryInstall')}
              </button>
            </>
          ) : (
            <button type="button" className={styles.primaryButton} onClick={onClose}>
              {t('close')}
            </button>
          )}
        </footer>
      </div>
    </dialog>
  )
}

/** Settings tab for browsing and installing Framework Hub plugins. */
export function MarketplaceTab({ t }: MarketplaceTabProps): ReactNode {
  const api = useApi(pluginMarketplaceApi)
  const locale = currentLocale()
  const [category, setCategory] = useState<string | undefined>()
  const [items, setItems] = useState<readonly MarketplaceCard[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)
  const [failedSlugs, setFailedSlugs] = useState<ReadonlySet<string>>(() => new Set())
  const [modal, setModal] = useState<ModalState | null>(null)
  const queryInput = useMemo(() => ({ locale, ...(category === undefined ? {} : { category }) }), [category, locale])
  const catalog = useApiQuery(pluginMarketplaceApi, 'list', {
    input: queryInput,
  })

  useEffect(() => {
    if (catalog.status !== 'success' || catalog.fetchStatus !== 'idle') return
    setItems(catalog.data.items)
    setNextCursor(catalog.data.nextCursor)
    setLoadMoreError(false)
  }, [catalog.data, catalog.fetchStatus, catalog.status])

  const categories = catalog.data?.categories ?? []
  const initialLoading = catalog.status === 'pending' || (catalog.fetchStatus === 'fetching' && items.length === 0)

  const selectCategory = (nextCategory: string | undefined): void => {
    if (category === nextCategory) return
    setCategory(nextCategory)
    setItems([])
    setNextCursor(null)
    setLoadMoreError(false)
  }

  const loadMore = async (): Promise<void> => {
    if (nextCursor === null || loadingMore) return
    setLoadingMore(true)
    setLoadMoreError(false)
    try {
      const page = await api.list({ ...queryInput, cursor: nextCursor })
      setItems(current => {
        const known = new Set(current.map(item => item.slug))
        return [...current, ...page.items.filter(item => !known.has(item.slug))]
      })
      setNextCursor(page.nextCursor)
    } catch {
      setLoadMoreError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  const install = async (plugin: MarketplaceCard): Promise<void> => {
    if (installingSlug !== null) return
    setInstallingSlug(plugin.slug)
    try {
      const result = await api.install({ slug: plugin.slug })
      if (result.status === 'failed') {
        setFailedSlugs(current => new Set([...current, plugin.slug]))
        setModal({ kind: 'failure', plugin, code: result.code })
        return
      }
      setFailedSlugs(current => {
        const next = new Set(current)
        next.delete(plugin.slug)
        return next
      })
      setItems(current => current.map(item => (item.slug === plugin.slug ? { ...item, installed: true } : item)))
      setModal({ kind: 'success', plugin: { ...plugin, installed: true } })
      catalog.refetch()
    } catch {
      setFailedSlugs(current => new Set([...current, plugin.slug]))
      setModal({ kind: 'failure', plugin, code: 'install-failed' })
    } finally {
      setInstallingSlug(null)
    }
  }

  return (
    <section className={styles.section} aria-busy={initialLoading || loadingMore}>
      <nav className={styles.categories} aria-label={t('categoriesLabel')}>
        <button
          type="button"
          aria-pressed={category === undefined}
          onClick={() => {
            selectCategory(undefined)
          }}
        >
          {t('all')}
        </button>
        {categories.map(item => (
          <button
            key={item.slug}
            type="button"
            aria-pressed={category === item.slug}
            onClick={() => {
              selectCategory(item.slug)
            }}
          >
            {item.name}
          </button>
        ))}
      </nav>

      {initialLoading ? (
        <p className={styles.status} role="status">
          {t('loading')}
        </p>
      ) : null}
      {catalog.status === 'error' && items.length === 0 ? (
        <div className={styles.failure}>
          <p role="alert">{t('unavailable')}</p>
          <button type="button" onClick={catalog.refetch}>
            {t('retry')}
          </button>
        </div>
      ) : null}
      {!initialLoading && catalog.status === 'success' && items.length === 0 ? <p className={styles.status}>{t('empty')}</p> : null}

      {items.length > 0 ? (
        <ul className={styles.cards} aria-label={t('pluginsLabel')}>
          {items.map(plugin => {
            const installing = installingSlug === plugin.slug
            const compatibilityUnknown = plugin.compatibility === 'unknown'
            const incompatible = plugin.compatibility === 'incompatible'
            const failed = failedSlugs.has(plugin.slug)
            const label = plugin.installed
              ? t('installed')
              : compatibilityUnknown
                ? `${t('download')} · ${t('compatibilityUnknown')}`
                : incompatible
                  ? `${t('download')} · ${t('incompatible')}`
                  : installing
                    ? t('downloading')
                    : failed
                      ? t('retry')
                      : t('download')
            const accessibleLabel = interpolate(t(failed ? 'retryPlugin' : 'downloadPlugin'), { name: plugin.name })
            return (
              <li className={styles.card} key={plugin.slug} data-badge={plugin.badge}>
                <div className={styles.cardHeader}>
                  <PluginIcon plugin={plugin} />
                  <div className={styles.identity}>
                    <div className={styles.titleLine}>
                      <h3>{plugin.name}</h3>
                      <span className={styles.badge} data-kind={plugin.badge}>
                        {sourceLabel(plugin, t)}
                      </span>
                    </div>
                    <p className={styles.description}>{plugin.description}</p>
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <div className={styles.metadata}>
                    <code title={plugin.packageName}>{plugin.packageName}</code>
                    <span aria-label={`${t('versionLabel')} ${plugin.version}`}>v{plugin.version}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.downloadButton}
                    data-state={
                      plugin.installed
                        ? 'installed'
                        : compatibilityUnknown
                          ? 'unknown'
                          : incompatible
                            ? 'incompatible'
                            : installing
                              ? 'installing'
                              : failed
                                ? 'retry'
                                : 'download'
                    }
                    disabled={plugin.installed || installingSlug !== null}
                    aria-label={plugin.installed ? `${plugin.name}: ${label}` : accessibleLabel}
                    onClick={() => {
                      setModal({ kind: 'confirm', plugin })
                    }}
                  >
                    {installing ? (
                      <span aria-hidden="true">
                        <IconLoadingOutline16 className={styles.spinner} />
                      </span>
                    ) : !plugin.installed ? (
                      <span aria-hidden="true">
                        <IconDownloadOutline16 />
                      </span>
                    ) : null}
                    {label}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {nextCursor !== null ? (
        <div className={styles.loadMoreRow}>
          {loadMoreError ? <span role="alert">{t('unavailable')}</span> : null}
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => {
              void loadMore()
            }}
          >
            {loadingMore ? t('loadingMore') : loadMoreError ? t('retry') : t('loadMore')}
          </button>
        </div>
      ) : null}

      {modal !== null ? (
        <InstallDialog
          state={modal}
          installing={installingSlug === modal.plugin.slug}
          t={t}
          onClose={() => {
            if (installingSlug === null) setModal(null)
          }}
          onContinue={plugin => {
            setModal({ kind: 'risk', plugin })
          }}
          onRetry={plugin => {
            setModal({ kind: 'confirm', plugin })
          }}
          onInstall={plugin => {
            void install(plugin)
          }}
        />
      ) : null}
    </section>
  )
}
