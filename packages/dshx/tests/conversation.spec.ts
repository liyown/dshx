import type { ConversationContextReader, ConversationMatch, ConversationNodeContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent, SessionEventMap, SessionEventType, SessionId } from '@deepseek-ai/dsh-session/types'
import { isValidElement, type ReactElement } from 'react'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  CONVERSATION_COMPONENT_MARKER,
  defineConversation,
  type ConversationRendererNode,
  type ConversationRendererSlotProps,
} from '../src/conversation/index.js'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'dshx-test/review-start': {
      readonly reviewId: string
      readonly title: string
    }
    'dshx-test/review-progress': {
      readonly reviewId: string
      readonly completed: number
    }
    'dshx-test/review-end': {
      readonly reviewId: string
      readonly summary: string
    }
    'dshx-test/notice': {
      readonly noticeId: string
      readonly text: string
    }
  }
}

interface ReviewState {
  readonly title: string
  readonly completed: number
  readonly summary?: string
}

interface ReviewData {
  readonly label: string
  readonly done: boolean
}

function sessionEvent<Type extends SessionEventType>(type: Type, seq: number, data: SessionEventMap[Type]): SessionEvent<Type> {
  return { type, seq, time: 1_700_000_000_000 + seq, data } as SessionEvent<Type>
}

function conversationMatch(event: SessionEvent, role: ConversationMatch['role']): ConversationMatch {
  return {
    event,
    view: undefined,
    role,
    location: { kind: 'session' },
  }
}

function conversationContext<State>(options: {
  readonly matches: readonly ConversationMatch[]
  readonly start: ConversationMatch | undefined
  readonly state: State | undefined
}): ConversationNodeContext<State> {
  return {
    key: 'review-job:review-1',
    kind: 'review-job',
    id: 'review-1',
    matches: options.matches,
    start: options.start,
    state: options.state,
    current: new Map(),
  }
}

const reader: ConversationContextReader = {
  previous: () => undefined,
}

describe('defineConversation', () => {
  it('preserves the object-first event family and produces one integrated contribution', () => {
    const startDescriptor = {
      role: 'start' as const,
      id: (event: SessionEvent<'dshx-test/review-start'>) => event.data.reviewId,
      publication: 'animation-frame' as const,
    }
    const progressDescriptor = {
      role: 'update' as const,
      id: (event: SessionEvent<'dshx-test/review-progress'>) => event.data.reviewId,
    }
    const endDescriptor = {
      role: 'update' as const,
      id: (event: SessionEvent<'dshx-test/review-end'>) => event.data.reviewId,
      publication: 'none' as const,
    }
    const events = {
      'dshx-test/review-start': startDescriptor,
      'dshx-test/review-progress': progressDescriptor,
      'dshx-test/review-end': endDescriptor,
    }
    const contract = defineConversation({ kind: 'review-job', events })
    expect(contract.kind).toBe('review-job')
    expect(contract.events).toBe(events)
    expect(contract.events['dshx-test/review-start']).toBe(startDescriptor)
    expect(contract.events['dshx-test/review-progress']).toBe(progressDescriptor)
    expect(contract).not.toHaveProperty('marker')
    expectTypeOf(contract.kind).toEqualTypeOf<'review-job'>()

    const component = ({
      data,
      node,
      sessionId,
    }: {
      data: ReviewData
      node: {
        readonly kind: 'review-job'
        readonly data: ReviewData
      }
      sessionId: SessionId
    }) => {
      void data.done
      void node.data.label
      void sessionId
      return null
    }
    const contribution = contract.component({
      initial({ event, match, reader: contextReader, previous }): ReviewState {
        expectTypeOf(event).toEqualTypeOf<SessionEvent<'dshx-test/review-start'>>()
        expectTypeOf(match.event.type).toEqualTypeOf<'dshx-test/review-start'>()
        expectTypeOf(contextReader).toEqualTypeOf<ConversationContextReader>()
        expectTypeOf(previous<ReviewState>('review-job')).toEqualTypeOf<
          import('@deepseek-ai/dsh-client-runtime/client').ConversationPreviousContext<ReviewState> | undefined
        >()
        return { title: event.data.title, completed: 0 }
      },
      reduce({ state, event }): ReviewState {
        expectTypeOf(event).toEqualTypeOf<SessionEvent<'dshx-test/review-progress'> | SessionEvent<'dshx-test/review-end'>>()
        if (event.type === 'dshx-test/review-progress') {
          return { ...state, completed: event.data.completed }
        }
        return { ...state, summary: event.data.summary }
      },
      view({ state }) {
        if (state === undefined) return null
        const data: ReviewData = {
          label: state.summary ?? `${state.title}: ${state.completed}`,
          done: state.summary !== undefined,
        }
        return { data }
      },
      component,
    })

    expect(contribution).toMatchObject({
      kind: 'conversation-component',
      marker: CONVERSATION_COMPONENT_MARKER,
      contract,
      definition: { kind: 'review-job', target: 'chat' },
      renderer: {
        name: 'conversation.chat.node',
        options: { key: 'review-job', locale: 'conversation' },
      },
    })
    expect(contribution.renderer.component).not.toBe(component)
    expectTypeOf(contribution.marker).toEqualTypeOf<'dshx.conversation-component.v1'>()
    expectTypeOf(contribution.renderer.options.key).toEqualTypeOf<'review-job'>()
    expectTypeOf(contribution.renderer.options.locale).toEqualTypeOf<'conversation'>()

    const node = {
      key: 'review-job:review-1',
      kind: 'review-job',
      id: 'review-1',
      target: 'chat',
      anchorSeq: 10,
      location: { kind: 'session' },
      visibility: 'visible',
      data: { label: 'Ready', done: false },
    } satisfies ConversationRendererNode<'review-job', ReviewData>
    const rendered = (contribution.renderer.component as (props: ConversationRendererSlotProps<'review-job', ReviewData>) => ReactElement)({
      node,
    } as ConversationRendererSlotProps<'review-job', ReviewData>)
    expect(isValidElement(rendered)).toBe(true)
    expect(rendered.type).toBe(component)
    expect((rendered.props as { data: ReviewData }).data).toBe(node.data)
  })

  it('delegates deterministic lifecycle state, publication, location data, and view assembly', () => {
    const contract = defineConversation({
      kind: 'review-job',
      events: {
        'dshx-test/review-start': {
          role: 'start',
          id: event => event.data.reviewId,
          publication: 'animation-frame',
        },
        'dshx-test/review-progress': {
          role: 'update',
          id: event => event.data.reviewId,
        },
        'dshx-test/review-end': {
          role: 'update',
          id: event => event.data.reviewId,
          publication: 'none',
        },
      },
    })
    const contribution = contract.component({
      initial({ event }): ReviewState {
        return { title: event.data.title, completed: 0 }
      },
      reduce({ state, event }): ReviewState {
        if (event.type === 'dshx-test/review-progress') {
          return { ...state, completed: event.data.completed }
        }
        return { ...state, summary: event.data.summary }
      },
      publication({ event, descriptor }) {
        expect(descriptor).toBe(contract.events[event.type])
        return event.type === 'dshx-test/review-end' ? 'immediate' : undefined
      },
      locationData({ state, scope }) {
        if (state === undefined || scope !== 'turn') return null
        return { turn: 3, value: state.completed }
      },
      view({ state }) {
        if (state === undefined) return null
        return {
          anchorSeq: 99,
          location: { kind: 'session' },
          visibility: state.summary === undefined ? 'visible' : 'hidden',
          data: {
            label: state.summary ?? state.title,
            done: state.summary !== undefined,
          } satisfies ReviewData,
        }
      },
      component: () => null,
    })

    const startEvent = sessionEvent('dshx-test/review-start', 10, {
      reviewId: 'review-1',
      title: 'Security review',
    })
    const progressEvent = sessionEvent('dshx-test/review-progress', 11, {
      reviewId: 'review-1',
      completed: 2,
    })
    const endEvent = sessionEvent('dshx-test/review-end', 12, {
      reviewId: 'review-1',
      summary: 'Approved',
    })
    const startMatch = conversationMatch(startEvent, 'start')
    const progressMatch = conversationMatch(progressEvent, 'update')
    const endMatch = conversationMatch(endEvent, 'update')
    const initialContext = conversationContext<ReviewState>({
      matches: [startMatch],
      start: startMatch,
      state: undefined,
    })

    expect(contribution.definition.match(startEvent)).toEqual({ id: 'review-1', role: 'start' })
    expect(contribution.definition.match(progressEvent)).toEqual({ id: 'review-1', role: 'update' })
    expect(
      contribution.definition.match(
        sessionEvent('dshx-test/notice', 13, {
          noticeId: 'notice-1',
          text: 'unrelated',
        }),
      ),
    ).toBeNull()

    const initial = contribution.definition.start(initialContext, startMatch, reader)
    expect(initial).toEqual({ title: 'Security review', completed: 0 })
    const progressed = contribution.definition.update({ ...initialContext, matches: [startMatch, progressMatch], state: initial }, progressMatch)
    expect(progressed).toEqual({ title: 'Security review', completed: 2 })
    const ended = contribution.definition.update({ ...initialContext, matches: [startMatch, progressMatch, endMatch], state: progressed }, endMatch)
    expect(ended).toEqual({ title: 'Security review', completed: 2, summary: 'Approved' })

    expect(contribution.definition.publication?.(startMatch)).toBe('animation-frame')
    expect(contribution.definition.publication?.(progressMatch)).toBe('immediate')
    expect(contribution.definition.publication?.(endMatch)).toBe('immediate')
    expect(contribution.definition.buildLocationData?.({ ...initialContext, state: ended }, 'turn')).toEqual({
      kind: 'turn',
      turn: 3,
      key: 'review-job',
      value: 2,
    })
    expect(contribution.definition.buildLocationData?.({ ...initialContext, state: ended }, 'step')).toBeNull()
    expect(contribution.definition.buildViewNode?.({ ...initialContext, state: ended })).toEqual({
      key: 'review-job:review-1',
      kind: 'review-job',
      id: 'review-1',
      target: 'chat',
      anchorSeq: 99,
      location: { kind: 'session' },
      visibility: 'hidden',
      data: { label: 'Approved', done: true },
    })
  })

  it('uses official start evidence for view defaults and permits a start-only component', () => {
    const contract = defineConversation({
      kind: 'notice',
      events: {
        'dshx-test/notice': {
          role: 'start',
          id: event => event.data.noticeId,
        },
      },
    })
    const contribution = contract.component({
      initial: ({ event }) => event.data.text,
      component({ data, node, sessionId, useSession, useSessions, useWorkspaces, useProjection, useTurnData, t }) {
        expectTypeOf(node.kind).toEqualTypeOf<'notice'>()
        expectTypeOf(node.data).toEqualTypeOf<string>()
        expectTypeOf(data).toEqualTypeOf<string>()
        expectTypeOf(sessionId).toEqualTypeOf<SessionId>()
        expectTypeOf(useSession).toBeFunction()
        expectTypeOf(useSessions).toBeFunction()
        expectTypeOf(useWorkspaces).toBeFunction()
        expectTypeOf(useProjection).toBeFunction()
        expectTypeOf(useTurnData).toBeFunction()
        expectTypeOf(t).toBeFunction()
        return null
      },
    })
    const event = sessionEvent('dshx-test/notice', 7, { noticeId: 'n-1', text: 'Ready' })
    const match = conversationMatch(event, 'start')
    const context = conversationContext<string>({ matches: [match], start: match, state: 'Ready' })

    expect(contribution.definition.publication).toBeUndefined()
    expect(contribution.definition.buildLocationData).toBeUndefined()
    expect(contribution.definition.buildViewNode?.(context)).toEqual({
      key: 'review-job:review-1',
      kind: 'notice',
      id: 'review-1',
      target: 'chat',
      anchorSeq: 7,
      location: { kind: 'session' },
      visibility: 'visible',
      data: 'Ready',
    })
  })

  it('rejects malformed definitions and lifecycle wrappers at the DSHX boundary', () => {
    expect(() =>
      defineConversation({
        kind: ' ',
        events: {
          'dshx-test/notice': { role: 'start', id: event => event.data.noticeId },
        },
      }),
    ).toThrow('non-empty string')
    expect(() => defineConversation({ kind: 'empty', events: {} })).toThrow('at least one event')
    expect(() =>
      defineConversation({
        kind: 'updates-only',
        events: {
          'dshx-test/review-progress': { role: 'update', id: event => event.data.reviewId },
        },
      }),
    ).toThrow('at least one start event')
    expect(() =>
      defineConversation({
        kind: 'bad-descriptor',
        events: { 'dshx-test/notice': { role: 'start' } },
      } as never),
    ).toThrow('must declare role and id(event)')
    expect(() =>
      defineConversation({
        kind: 'bad-publication',
        events: {
          'dshx-test/notice': { role: 'start', id: () => 'n-1', publication: 'later' },
        },
      } as never),
    ).toThrow('invalid publication')

    const contract = defineConversation({
      kind: 'review-job',
      events: {
        'dshx-test/review-start': { role: 'start', id: event => event.data.reviewId },
        'dshx-test/review-progress': { role: 'update', id: event => event.data.reviewId },
      },
    })
    expect(() =>
      contract.component({
        initial: () => ({ completed: 0 }),
        view: () => null,
        component: () => null,
      } as never),
    ).toThrow('reduce must be a function')
    const invalidId = defineConversation({
      kind: 'invalid-id',
      events: {
        'dshx-test/notice': { role: 'start', id: (() => 42) as never },
      },
    }).component({
      initial: ({ event }) => event.data.text,
      view: ({ state }) => (state === undefined ? null : { data: state }),
      component: () => null,
    })
    expect(() => invalidId.definition.match(sessionEvent('dshx-test/notice', 1, { noticeId: 'n-1', text: 'Ready' }))).toThrow('returned a non-string id')

    const invalidStepLocation = defineConversation({
      kind: 'invalid-step-location',
      events: {
        'dshx-test/notice': { role: 'start', id: event => event.data.noticeId },
      },
    }).component({
      initial: ({ event }) => event.data.text,
      locationData: () => ({ turn: 1, value: true }),
      component: () => null,
    })
    expect(() =>
      invalidStepLocation.definition.buildLocationData?.(
        conversationContext<string>({ matches: [], start: undefined, state: 'Ready' }),
        'step',
      ),
    ).toThrow('valid step coordinate')
  })

  it('rejects event vocabulary outside the official SessionEventMap at compile time', () => {
    const typecheck = (): void => {
      defineConversation({
        kind: 'unknown-event',
        events: {
          // @ts-expect-error Conversation event keys must belong to the official SessionEventMap.
          'dshx-test/not-registered': { role: 'start', id: () => 'unknown' },
        },
      })

      const updates = defineConversation({
        kind: 'requires-reducer',
        events: {
          'dshx-test/review-start': { role: 'start', id: event => event.data.reviewId },
          'dshx-test/review-progress': { role: 'update', id: event => event.data.reviewId },
        },
      })
      // @ts-expect-error A contract with update events requires a reducer.
      updates.component({
        initial: (): ReviewState => ({ title: 'Review', completed: 0 }),
        component: () => null,
      })
    }
    expect(typecheck).toBeTypeOf('function')
  })
})
