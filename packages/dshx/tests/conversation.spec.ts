import { describe, expect, expectTypeOf, it } from 'vitest'
import type { SessionEvent, SessionEventMap } from '@deepseek-ai/dsh-session/types'
import { defineConversation, type ConversationRenderProps } from '../src/conversation/index.js'
import { getConversationContributionParts, isConversationContribution } from '../src/conversation/define.js'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'dshx-test/review-start': { readonly reviewId: string; readonly title: string }
    'dshx-test/review-progress': { readonly reviewId: string; readonly completed: number }
    'dshx-test/notice': { readonly noticeId: string; readonly text: string }
  }
}

interface ReviewState {
  readonly title: string
  readonly completed: number
}

const review = defineConversation({
  kind: 'review-job',
  events: {
    'dshx-test/review-start': { role: 'start', id: event => event.data.reviewId },
    'dshx-test/review-progress': { role: 'update', id: event => event.data.reviewId },
  },
  initial(_context, event): ReviewState {
    expectTypeOf(event).toEqualTypeOf<SessionEvent<'dshx-test/review-start'>>()
    return { title: event.data.title, completed: 0 }
  },
  reduce(state, _context, event): ReviewState {
    expectTypeOf(event).toEqualTypeOf<SessionEvent<'dshx-test/review-progress'>>()
    return { ...state, completed: event.data.completed }
  },
  project(state) {
    return { label: `${state.title}:${state.completed}` }
  },
})

describe('experimental Conversation lifecycle', () => {
  it('creates an opaque integrated contribution through render(Component)', () => {
    const contribution = review.render(function ReviewNode(props) {
      expectTypeOf(props.data).toEqualTypeOf<{ label: string }>()
      return null
    })
    expect(isConversationContribution(contribution)).toBe(true)
    expect(Object.keys(contribution)).toEqual([])
    const parts = getConversationContributionParts(contribution)
    expect(parts.definition).toMatchObject({ kind: 'review-job', target: 'chat' })
    expect(parts.renderer).toMatchObject({ name: 'conversation.chat.node', options: { key: 'review-job', locale: 'conversation' } })
  })

  it('runs pure initial, reduce, and project stages through the official Definition', () => {
    const contribution = review.render(() => null)
    const definition = getConversationContributionParts(contribution).definition
    const startEvent = { type: 'dshx-test/review-start', seq: 1, time: 1, data: { reviewId: 'r1', title: 'Audit' } } as SessionEvent<'dshx-test/review-start'>
    const progressEvent = {
      type: 'dshx-test/review-progress',
      seq: 2,
      time: 2,
      data: { reviewId: 'r1', completed: 4 },
    } as SessionEvent<'dshx-test/review-progress'>
    const startMatch = { event: startEvent, id: 'r1', role: 'start', location: { kind: 'unresolved' } }
    const progressMatch = { event: progressEvent, id: 'r1', role: 'update', location: { kind: 'unresolved' } }
    const emptyContext = { key: 'review-job:r1', id: 'r1', matches: [], start: startMatch, state: undefined }
    const state = definition.start(emptyContext as never, startMatch as never, {} as never)
    expect(state).toEqual({ title: 'Audit', completed: 0 })
    const context = { ...emptyContext, state, matches: [startMatch, progressMatch] }
    const next = definition.update(context as never, progressMatch as never)
    expect(next).toEqual({ title: 'Audit', completed: 4 })
    expect(definition.buildViewNode?.({ ...context, state: next } as never)).toMatchObject({
      kind: 'review-job',
      data: { label: 'Audit:4' },
    })
  })

  it('defaults renderer data to state and exports standalone render props', () => {
    const notice = defineConversation({
      kind: 'notice',
      events: { 'dshx-test/notice': { role: 'start', id: event => event.data.noticeId } },
      initial: (_context, event) => ({ text: event.data.text }),
    })
    type Props = ConversationRenderProps<typeof notice>
    expectTypeOf<Props['data']>().toEqualTypeOf<{ text: string }>()
  })

  it('rejects invalid lifecycle declarations and copied contributions', () => {
    expect(() => defineConversation({ kind: ' ', events: { 'dshx-test/notice': { role: 'start', id: () => 'x' } }, initial: () => ({}) })).toThrow('non-empty')
    expect(() =>
      defineConversation({
        kind: 'missing-reducer',
        events: {
          'dshx-test/review-start': { role: 'start', id: () => 'x' },
          'dshx-test/review-progress': { role: 'update', id: () => 'x' },
        },
        initial: () => ({}),
      }),
    ).toThrow('reduce must be a function')
    expect(isConversationContribution({ ...review.render(() => null) })).toBe(false)
  })
})
