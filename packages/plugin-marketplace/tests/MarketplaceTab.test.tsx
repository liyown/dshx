// @vitest-environment jsdom

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketplaceCard, MarketplaceListOutput } from '../src/api.js'
import { zh } from '../src/locales.js'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  install: vi.fn(),
  refetch: vi.fn(),
  query: vi.fn(),
}))

vi.mock('@becomeopc/dshx/client', () => ({
  defineLocale: (namespace: string, dictionaries: unknown) => ({ namespace, dictionaries }),
  useApi: () => ({ list: mocks.list, install: mocks.install }),
  useApiQuery: (...args: unknown[]) => mocks.query(...args),
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconDownloadOutline16: () => null,
  IconLoadingOutline16: () => null,
}))

import { MarketplaceTab, type MarketplaceTabProps } from '../src/MarketplaceTab.js'

function plugin(overrides: Partial<MarketplaceCard> = {}): MarketplaceCard {
  return {
    slug: 'fixture-plugin',
    name: '测试插件',
    packageName: '@fixture/plugin',
    description: '一个用于验证插件市场交互和设置页布局的测试插件。',
    version: '1.0.0',
    compatibilityRange: '>=0.1.0-rc.8',
    compatibility: 'compatible',
    category: 'tools',
    badge: 'verified',
    glyph: '测',
    iconUrl: null,
    installed: false,
    ...overrides,
  }
}

function page(overrides: Partial<MarketplaceListOutput> = {}): MarketplaceListOutput {
  return {
    categories: [
      { slug: 'tools', name: '工具' },
      { slug: 'workflow', name: '工作流' },
    ],
    items: [
      plugin(),
      plugin({
        slug: 'community-plugin',
        name: '社区插件',
        packageName: '@fixture/community',
        badge: 'community',
      }),
    ],
    nextCursor: null,
    ...overrides,
  }
}

function t(key: string, params?: Record<string, unknown>): string {
  return (zh[key as keyof typeof zh] ?? key).replace(/\{([^}]+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`))
}

function successfulQuery(data = page()) {
  return {
    status: 'success' as const,
    fetchStatus: 'idle' as const,
    data,
    error: null,
    refetch: mocks.refetch,
  }
}

const componentProps = { t } as MarketplaceTabProps

beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true
      },
    })
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false
      },
    })
  }
})

beforeEach(() => {
  document.documentElement.lang = 'zh-CN'
  mocks.query.mockReturnValue(successfulQuery())
  mocks.install.mockResolvedValue({
    status: 'installed',
    packageName: '@fixture/plugin',
    version: '1.0.0',
    restartRequired: true,
  })
  mocks.list.mockResolvedValue(page({ items: [plugin({ slug: 'third', name: '第三个插件' })] }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MarketplaceTab', () => {
  it('switches categories through a fresh first-page query and exposes semantic category state', async () => {
    render(<MarketplaceTab {...componentProps} />)
    const tools = screen.getByRole('button', { name: '工具' })
    expect(screen.getByRole('button', { name: '全部' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(tools)
    expect(tools.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => {
      expect(mocks.query).toHaveBeenLastCalledWith(expect.anything(), 'list', {
        input: { locale: 'zh', category: 'tools' },
      })
    })
  })

  it('renders non-clickable cards and all fixed button states with accessible names', () => {
    mocks.query.mockReturnValue(
      successfulQuery(
        page({
          items: [
            plugin({ installed: true }),
            plugin({
              slug: 'unknown',
              name: '待验证插件',
              packageName: '@fixture/unknown',
              compatibility: 'unknown',
            }),
            plugin({
              slug: 'future',
              name: '未来插件',
              packageName: '@fixture/future',
              compatibility: 'incompatible',
            }),
            plugin({
              slug: 'ready',
              name: '可下载插件',
              packageName: '@fixture/ready',
            }),
          ],
        }),
      ),
    )
    render(<MarketplaceTab {...componentProps} />)
    const list = screen.getByRole('list', { name: '插件列表' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(
      (
        screen.getByRole('button', {
          name: '测试插件: 已安装',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (
        screen.getByRole('button', {
          name: '待验证插件: 兼容性未知',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (
        screen.getByRole('button', {
          name: '未来插件: 不兼容',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (
        screen.getByRole('button', {
          name: '下载 可下载插件',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('confirms every download, adds the community warning and shows restart guidance after success', async () => {
    render(<MarketplaceTab {...componentProps} />)
    fireEvent.click(screen.getByRole('button', { name: '下载 社区插件' }))
    const dialog = screen.getByRole('dialog', { name: '安装插件' })
    expect(within(dialog).getByText('@fixture/community')).toBeTruthy()
    expect(within(dialog).getByText(zh.communityWarning)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '确认下载' }))
    await waitFor(() => {
      expect(mocks.install).toHaveBeenCalledWith({ slug: 'community-plugin' })
    })
    expect((await screen.findByRole('dialog', { name: '插件已安装' })).textContent).toContain('重启当前 Profile')
  })

  it('surfaces stable install errors and retries through the same confirmation path', async () => {
    mocks.install.mockResolvedValueOnce({
      status: 'failed',
      code: 'install-failed',
      retryable: true,
    })
    render(<MarketplaceTab {...componentProps} />)
    fireEvent.click(screen.getByRole('button', { name: '下载 测试插件' }))
    fireEvent.click(screen.getByRole('button', { name: '确认下载' }))
    const failure = await screen.findByRole('dialog', { name: '安装失败' })
    expect(failure.textContent).toContain(zh.installFailed)
    fireEvent.click(within(failure).getByRole('button', { name: '重试' }))
    await waitFor(() => {
      expect(mocks.install).toHaveBeenCalledTimes(2)
    })
  })

  it('handles list failure, retry, empty categories and cursor pagination', async () => {
    mocks.query.mockReturnValueOnce({
      status: 'error',
      fetchStatus: 'idle',
      data: undefined,
      error: new Error('transport'),
      refetch: mocks.refetch,
    })
    const { unmount } = render(<MarketplaceTab {...componentProps} />)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
    unmount()

    mocks.query.mockReturnValue(successfulQuery(page({ items: [], nextCursor: null })))
    const empty = render(<MarketplaceTab {...componentProps} />)
    expect(screen.getByText(zh.empty)).toBeTruthy()
    empty.unmount()

    mocks.query.mockReturnValue(successfulQuery(page({ nextCursor: 'cursor-two' })))
    render(<MarketplaceTab {...componentProps} />)
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    await waitFor(() => {
      expect(mocks.list).toHaveBeenCalledWith({
        locale: 'zh',
        cursor: 'cursor-two',
      })
      expect(screen.getByText('第三个插件')).toBeTruthy()
    })
  })

  it('keeps the 760px two-column layout and collapses to one column on small screens', async () => {
    const css = await readFile(resolve(process.cwd(), 'src/MarketplaceTab.module.css'), 'utf8')
    expect(css).toContain('max-width: 760px')
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/)
  })
})
