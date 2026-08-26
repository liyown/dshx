/**
 * In-memory adapter/replay coverage only. Extending SessionEventMap gives this
 * fixture static event types; it does not authorize those event names through
 * DSH persistence or widen the official durable event vocabulary.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import type {
  ChatConversationViewNode,
  ConversationEventInput,
  ConversationNodeDefinition,
  ConversationViewDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionEvent, SessionEventMap, SessionEventType } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it } from 'vitest'
import { defineConversation } from '../src/conversation/index.js'
import { getConversationContributionParts } from '../src/conversation/define.js'

type PublicClientRuntime = typeof import('@deepseek-ai/dsh-client-runtime/client')
type TestAssembler = InstanceType<PublicClientRuntime['ConversationNodeAssembler']>

interface ClientModuleRegistration {
  readonly factory: (require: (id: string) => unknown) => unknown
}

function loadPublicClientRuntime(): PublicClientRuntime {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('@deepseek-ai/dsh-client-runtime/client')
  let registration: ClientModuleRegistration | undefined
  runInNewContext(readFileSync(entry, 'utf8'), {
    window: {
      __ModuleLoader__: {
        load(value: ClientModuleRegistration) {
          registration = value
        },
      },
    },
  })
  if (registration === undefined) {
    throw new Error('public dsh-client-runtime bundle did not register its module factory')
  }
  return registration.factory(id => require(id)) as PublicClientRuntime
}

const { ConversationNodeAssembler, conversationContextKey } = loadPublicClientRuntime()

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'dshx-test/assembly-start': {
      readonly reviewId: string
      readonly title: string
    }
    'dshx-test/assembly-progress': {
      readonly reviewId: string
      readonly completed: number
    }
    'dshx-test/assembly-finish': {
      readonly reviewId: string
      readonly summary: string
    }
  }
}

interface ReviewState {
  readonly title: string
  readonly completed: number
  readonly summary?: string
}

type TestSnapshot = readonly ChatConversationViewNode[]

class TestEventDefinitions {
  constructor(private readonly definitions: readonly ConversationNodeDefinition[]) {}

  entries(): readonly ConversationNodeDefinition[] {
    return this.definitions
  }

  fallbackEntry(): undefined {
    return undefined
  }
}

class TestViewDefinitions {
  constructor(private readonly definitions: readonly ConversationViewDefinition[]) {}

  entries(): readonly ConversationViewDefinition[] {
    return this.definitions
  }
}

function testChatView(): ConversationViewDefinition<ChatConversationViewNode, TestSnapshot> {
  return {
    target: 'chat',
    create() {
      const nodes = new Map<string, ChatConversationViewNode>()
      const snapshot = (): TestSnapshot => [...nodes.values()].sort((left, right) => left.anchorSeq - right.anchorSeq)
      return {
        empty: [],
        replace(input) {
          nodes.clear()
          for (const node of input.nodes) nodes.set(node.key, node)
          return snapshot()
        },
        apply(input) {
          for (const node of input.upserts) nodes.set(node.key, node)
          return snapshot()
        },
      }
    },
  }
}

function sessionEvent<Type extends SessionEventType>(type: Type, seq: number, data: SessionEventMap[Type]): SessionEvent<Type> {
  return { type, seq, time: 1_700_000_000_000 + seq, data } as SessionEvent<Type>
}

function input<Type extends SessionEventType>(type: Type, seq: number, data: SessionEventMap[Type]): ConversationEventInput {
  return { event: sessionEvent(type, seq, data), view: undefined }
}

const start = input('dshx-test/assembly-start', 10, {
  reviewId: 'review-1',
  title: 'Security review',
})
const progress = input('dshx-test/assembly-progress', 11, {
  reviewId: 'review-1',
  completed: 3,
})
const finish = input('dshx-test/assembly-finish', 12, {
  reviewId: 'review-1',
  summary: 'Approved',
})

const reviewConversation = defineConversation({
  kind: 'assembly-review',
  events: {
    'dshx-test/assembly-start': {
      role: 'start',
      id: event => event.data.reviewId,
      publication: 'immediate',
    },
    'dshx-test/assembly-progress': {
      role: 'update',
      id: event => event.data.reviewId,
      publication: 'animation-frame',
    },
    'dshx-test/assembly-finish': {
      role: 'update',
      id: event => event.data.reviewId,
      publication: 'none',
    },
  },
  initial(_context, event): ReviewState {
    return { title: event.data.title, completed: 0 }
  },
  reduce(state, _context, event): ReviewState {
    if (event.type === 'dshx-test/assembly-progress') {
      return { ...state, completed: event.data.completed }
    }
    return { ...state, summary: event.data.summary }
  },
})
const reviewComponent = reviewConversation.render(() => null)
const reviewParts = getConversationContributionParts(reviewComponent)

function assembler(): TestAssembler {
  return new ConversationNodeAssembler(new TestEventDefinitions([reviewParts.definition]), new TestViewDefinitions([testChatView()]))
}

function snapshotOf(value: TestAssembler): TestSnapshot {
  return value.snapshot('chat') as TestSnapshot
}

function stateOf(value: TestAssembler): ReviewState | undefined {
  return snapshotOf(value)[0]?.data as ReviewState | undefined
}

describe('Conversation component official assembler integration', () => {
  it('replays an update-only tail when its start is later prepended', () => {
    const paged = assembler()
    expect(paged.replaceWindow([progress], true)).toBe('immediate')
    expect(paged.flush()).toBe(true)
    expect(snapshotOf(paged)).toEqual([])

    expect(paged.prepend([start], false)).toBe('immediate')
    expect(paged.flush()).toBe(true)

    const complete = assembler()
    expect(complete.replaceWindow([start, progress], false)).toBe('immediate')
    expect(complete.flush()).toBe(true)

    expect(snapshotOf(paged)).toEqual(snapshotOf(complete))
    expect(snapshotOf(paged)[0]).toMatchObject({
      key: conversationContextKey('assembly-review', 'review-1'),
      kind: 'assembly-review',
      id: 'review-1',
      target: 'chat',
      data: { title: 'Security review', completed: 3 },
    })
  })

  it('returns append publication cadence and materializes updates only on flush', () => {
    const value = assembler()
    value.replaceWindow([start], false)
    expect(value.flush()).toBe(true)
    expect(stateOf(value)).toEqual({ title: 'Security review', completed: 0 })

    expect(value.append(progress)).toBe('animation-frame')
    expect(stateOf(value)).toEqual({ title: 'Security review', completed: 0 })
    expect(value.flush()).toBe(true)
    expect(stateOf(value)).toEqual({ title: 'Security review', completed: 3 })

    expect(value.append(finish)).toBe('none')
    expect(stateOf(value)).toEqual({ title: 'Security review', completed: 3 })
    expect(value.flush()).toBe(true)
    expect(stateOf(value)).toEqual({
      title: 'Security review',
      completed: 3,
      summary: 'Approved',
    })
    expect(value.flush()).toBe(false)
  })

  it('rebuilds from retained inputs after the live registries change', () => {
    const value = assembler()
    value.replaceWindow([start, progress, finish], false)
    expect(value.flush()).toBe(true)
    const before = snapshotOf(value)

    expect(value.rebuildRegistry()).toBe('immediate')
    expect(snapshotOf(value)).toEqual([])
    expect(value.flush()).toBe(true)
    expect(snapshotOf(value)).toEqual(before)
  })
})
