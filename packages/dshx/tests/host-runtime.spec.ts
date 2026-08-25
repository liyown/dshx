import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import Schema from '@deepseek-ai/schemastery'
import { defineTool as officialDefineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  defineCommand,
  defineHost,
  definePromptContext,
  definePromptSection,
  defineTool,
  type AssembleContext,
  type PromptContext,
  type PromptSection,
} from '../src/host/index.js'
import { defineSettings } from '../src/settings/index.js'
import { createHostModule, createHostPlugin } from '../src/host/runtime.js'

function tool(name: string): ToolDefinition {
  return { name } as ToolDefinition
}

function context(register: (tool: ToolDefinition) => () => void): Context {
  return { tools: { register } } as unknown as Context
}

describe('defineHost', () => {
  it('re-exports the official defineTool without wrapping it', () => {
    expect(defineTool).toBe(officialDefineTool)
  })

  it('preserves official defineTool inference and registry-ready output', () => {
    const status = defineTool({
      name: 'status',
      description: 'Return status.',
      parameters: {
        prefix: { type: 'string', required: true },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, _exec) {
        expectTypeOf(args.prefix).toBeString()
        return `${args.prefix}:ok`
      },
    })
    expectTypeOf(status.execute).toBeFunction()
    const official: ToolDefinition = status
    expect(official).toBe(status)
  })

  it('preserves object identity and literal inference', () => {
    const definition = {
      name: 'literal-host' as const,
      inject: ['agents'] as const,
      setup(_ctx: Context) {},
    }
    const result = defineHost(definition)
    expect(result).toBe(definition)
    expectTypeOf(result.name).toEqualTypeOf<'literal-host'>()
    expectTypeOf(result.inject).toEqualTypeOf<readonly ['agents']>()
  })

  it('uses the official augmented Context and ToolDefinition types', () => {
    const officialTool = tool('official')
    const definition = defineHost({
      tools: [officialTool] as const,
      setup(ctx) {
        expectTypeOf(ctx).toEqualTypeOf<Context>()
        expectTypeOf(ctx.tools.register).toBeFunction()
      },
    })
    expectTypeOf(definition.tools).toEqualTypeOf<readonly [ToolDefinition]>()
  })

  it('preserves the official Command definition and invocation types', () => {
    const command = defineCommand({
      name: 'status',
      description: 'Return status.',
      handler(invocation) {
        expectTypeOf(invocation).toMatchTypeOf<Parameters<CommandDefinition['handler']>[0]>()
        return { kind: 'success', text: invocation.rawInput }
      },
    })
    const official: CommandDefinition = command
    expect(official).toBe(command)
  })

  it('wraps official Prompt values without changing their identity or inference', () => {
    const sectionValue = {
      name: 'plugin:guidance' as const,
      order: 150 as const,
      text: 'Use the status tool.' as const,
      complete: true as const,
    }
    const section = definePromptSection(sectionValue)
    const contextValue = {
      name: 'plugin:runtime' as const,
      order: 0 as const,
      text(assembly: AssembleContext) {
        expectTypeOf(assembly).toEqualTypeOf<AssembleContext>()
        return assembly.signal?.aborted === true ? 'aborted' : 'ready'
      },
    }
    const promptContext = definePromptContext(contextValue)

    expect(section).toEqual({ kind: 'section', section: sectionValue })
    expect(section.section).toBe(sectionValue)
    expect(promptContext).toEqual({ kind: 'context', context: contextValue })
    expect(promptContext.context).toBe(contextValue)
    expectTypeOf(section.kind).toEqualTypeOf<'section'>()
    expectTypeOf(section.section.name).toEqualTypeOf<'plugin:guidance'>()
    expectTypeOf(section.section.complete).toEqualTypeOf<true>()
    expectTypeOf(promptContext.kind).toEqualTypeOf<'context'>()
    expectTypeOf(promptContext.context.name).toEqualTypeOf<'plugin:runtime'>()
  })

  it('rejects unknown definition fields at compile time', () => {
    defineHost({
      // @ts-expect-error Host behavior outside the supported surface belongs in setup(ctx).
      typo: true,
    })
  })
})

describe('Host runtime adapter', () => {
  it('merges inject in order, registers official tools, then calls setup', async () => {
    const calls: string[] = []
    const first = tool('first')
    const second = tool('second')
    const firstDispose = vi.fn()
    const secondDispose = vi.fn()
    const ctx = context(value => {
      calls.push(`tool:${value.name}`)
      return value === first ? firstDispose : secondDispose
    })
    const plugin = createHostPlugin(
      {
        inject: ['agents', 'agents'],
        tools: [first, second],
        async setup(received: Context) {
          expect(received).toBe(ctx)
          await Promise.resolve()
          calls.push('setup')
        },
      },
      { packageId: '@test/plugin', logicalName: 'logical-host', sourceFile: '/project/src/host.ts' },
    )

    expect(plugin.name).toBe('logical-host')
    expect(plugin.inject).toEqual(['agents', 'tools'])
    await plugin.apply(ctx)
    expect(calls).toEqual(['tool:first', 'tool:second', 'setup'])
    expect(firstDispose).not.toHaveBeenCalled()
    expect(secondDispose).not.toHaveBeenCalled()
  })

  it('prefers the definition name and does not add tools for an empty list', () => {
    const register = vi.fn(() => vi.fn())
    const setup = vi.fn()
    const plugin = createHostPlugin(
      { name: 'explicit-host', inject: ['tools', 'agents', 'tools'], tools: [], setup },
      {
        packageId: '@test/plugin',
        logicalName: 'logical-host',
      },
    )
    expect(plugin.name).toBe('explicit-host')
    expect(plugin.inject).toEqual(['tools', 'agents'])
    plugin.apply(context(register))
    expect(register).not.toHaveBeenCalled()
    expect(setup).toHaveBeenCalledOnce()
  })

  it('does not hide duplicate tools from the official registry', () => {
    const duplicate = tool('duplicate')
    const register = vi
      .fn()
      .mockImplementationOnce(() => vi.fn())
      .mockImplementationOnce(() => {
        throw new Error('official duplicate tool error')
      })
    const plugin = createHostPlugin({ tools: [duplicate, duplicate] }, { packageId: '@test/plugin' })
    expect(() => plugin.apply(context(register))).toThrow('official duplicate tool error')
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('registers Commands in declaration order and delegates collision and disposal to DSH', () => {
    const calls: string[] = []
    const first = defineCommand({ name: 'first', description: 'First.', handler: () => ({ kind: 'success' }) })
    const second = defineCommand({ name: 'second', description: 'Second.', handler: () => ({ kind: 'success' }) })
    const commandDisposers = [vi.fn(), vi.fn()]
    const plugin = createHostPlugin(
      {
        inject: ['commands', 'commands'],
        commands: [first, second],
        setup() {
          calls.push('setup')
        },
      },
      { packageId: '@test/plugin' },
    )
    expect(plugin.inject).toEqual(['commands'])
    plugin.apply({
      commands: {
        register(command: CommandDefinition) {
          calls.push(`command:${command.name}`)
          return commandDisposers[calls.length - 1]
        },
      },
    } as unknown as Context)
    expect(calls).toEqual(['command:first', 'command:second', 'setup'])
    expect(commandDisposers[0]).not.toHaveBeenCalled()
    expect(commandDisposers[1]).not.toHaveBeenCalled()
  })

  it('registers Tools, Commands, and Prompt contributions in order without owning official disposers', () => {
    const calls: string[] = []
    const status = tool('status')
    const command = defineCommand({ name: 'status', description: 'Status.', handler: () => ({ kind: 'success' }) })
    const sectionValue: PromptSection = { name: 'plugin:guidance', order: 150, text: 'Use status.' }
    const secondSection: PromptSection = { name: 'plugin:constraints', order: 150, text: 'Stay concise.' }
    const contextValue: PromptContext = { name: 'plugin:runtime', order: 0, text: () => 'ready' }
    const disposers = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    const plugin = createHostPlugin(
      {
        inject: ['systemPrompt', 'systemPrompt'],
        tools: [status],
        commands: [command],
        prompts: [definePromptSection(sectionValue), definePromptSection(secondSection), definePromptContext(contextValue)],
        setup() {
          calls.push('setup')
        },
      },
      { packageId: '@test/plugin' },
    )

    expect(plugin.inject).toEqual(['systemPrompt', 'tools', 'commands'])
    plugin.apply({
      tools: {
        register(value: ToolDefinition) {
          calls.push(`tool:${value.name}`)
          return disposers[0]
        },
      },
      commands: {
        register(value: CommandDefinition) {
          calls.push(`command:${value.name}`)
          return disposers[1]
        },
      },
      systemPrompt: {
        section(value: PromptSection) {
          expect(value).toBe(value.name === sectionValue.name ? sectionValue : secondSection)
          calls.push(`section:${value.name}`)
          return value === sectionValue ? disposers[2] : disposers[3]
        },
        context(value: PromptContext) {
          expect(value).toBe(contextValue)
          calls.push(`context:${value.name}`)
          return disposers[4]
        },
      },
    } as unknown as Context)

    expect(calls).toEqual(['tool:status', 'command:status', 'section:plugin:guidance', 'section:plugin:constraints', 'context:plugin:runtime', 'setup'])
    for (const dispose of disposers) expect(dispose).not.toHaveBeenCalled()
  })

  it('does not inject systemPrompt for an empty Prompt list', () => {
    const setup = vi.fn()
    const plugin = createHostPlugin({ prompts: [], setup }, { packageId: '@test/plugin' })
    expect(plugin.inject).toEqual([])
    plugin.apply({} as Context)
    expect(setup).toHaveBeenCalledOnce()
  })

  it('registers direct and advanced Settings after Prompts and before top-level setup', () => {
    const calls: string[] = []
    const direct = defineSettings({ namespace: 'direct', schema: Schema.object({ enabled: Schema.boolean().default(true) }) })
    const advanced = defineSettings({ namespace: 'advanced', schema: Schema.object({ count: Schema.number().default(0) }), applies: 'restart' })
    const scope = { get: vi.fn(), watch: vi.fn(), update: vi.fn(), replace: vi.fn() }
    const setupDispose = vi.fn()
    const validate = vi.fn()
    const plugin = createHostPlugin(
      {
        inject: ['settings', 'settings'],
        tools: [tool('status')],
        commands: [defineCommand({ name: 'status', description: 'Status.', handler: () => ({ kind: 'success' }) })],
        prompts: [definePromptSection({ name: 'plugin:guidance', order: 150, text: 'Use status.' })],
        settings: [
          direct,
          advanced.host({
            base: { count: 2 },
            validate,
            setup(received, receivedCtx) {
              expect(received).toBe(scope)
              expect(receivedCtx).toBe(ctx)
              calls.push('settings:setup')
              return setupDispose
            },
          }),
        ],
        setup() {
          calls.push('setup')
        },
      },
      { packageId: '@test/plugin' },
    )
    const effects: Array<() => () => void> = []
    const ctx = {
      tools: { register: (value: ToolDefinition) => { calls.push(`tool:${value.name}`) } },
      commands: { register: (value: CommandDefinition) => { calls.push(`command:${value.name}`) } },
      systemPrompt: { section: (value: PromptSection) => { calls.push(`prompt:${value.name}`) } },
      settings: {
        register(namespace: string, schema: unknown, options: Record<string, unknown>) {
          calls.push(`settings:${namespace}`)
          expect(schema).toBe(namespace === 'direct' ? direct.schema : advanced.schema)
          if (namespace === 'direct') expect(options).toEqual({ applies: 'live' })
          else expect(options).toEqual({ applies: 'restart', base: { count: 2 }, validate })
          return scope
        },
      },
      effect(execute: () => () => void) {
        effects.push(execute)
      },
    } as unknown as Context

    expect(plugin.inject).toEqual(['settings', 'tools', 'commands', 'systemPrompt'])
    plugin.apply(ctx)
    expect(calls).toEqual([
      'tool:status',
      'command:status',
      'prompt:plugin:guidance',
      'settings:direct',
      'settings:advanced',
      'settings:setup',
      'setup',
    ])
    expect(effects).toHaveLength(1)
    expect(effects[0]?.()).toBe(setupDispose)
    expect(setupDispose).not.toHaveBeenCalled()
  })

  it('does not inject Settings for an empty list and delegates duplicates to the official registry', () => {
    const empty = createHostPlugin({ settings: [] }, { packageId: '@test/plugin' })
    expect(empty.inject).toEqual([])
    empty.apply({} as Context)

    const contract = defineSettings({ namespace: 'duplicate', schema: Schema.object({ enabled: Schema.boolean() }) })
    const register = vi.fn().mockReturnValueOnce({}).mockImplementationOnce(() => { throw new Error('official duplicate settings error') })
    const duplicate = createHostPlugin({ settings: [contract, contract] }, { packageId: '@test/plugin' })
    expect(() => duplicate.apply({ settings: { register } } as unknown as Context)).toThrow('official duplicate settings error')
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('preserves native Host name, inject, Config, apply and config argument', () => {
    const Config = { validate: true }
    const apply = vi.fn(() => 'native-result')
    const source = { name: 'native-host', inject: { tools: null }, Config, apply }
    const plugin = createHostModule(source, { packageId: '@test/plugin', logicalName: 'logical-host' })
    const ctx = context(() => vi.fn())
    const config = { enabled: true }
    expect(plugin).toMatchObject({ name: 'native-host', inject: source.inject, Config })
    expect(plugin.apply(ctx, config)).toBe('native-result')
    expect(apply).toHaveBeenCalledWith(ctx, config)
  })

  it.each([
    ['non-object definition', null, 'DSHX2001'],
    ['unknown field', { unknown: true }, 'DSHX2002'],
    ['empty name', { name: '' }, 'DSHX2002'],
    ['invalid inject', { inject: [''] }, 'DSHX2002'],
    ['invalid tools', { tools: {} }, 'DSHX2002'],
    ['invalid commands', { commands: {} }, 'DSHX2002'],
    ['invalid prompts', { prompts: {} }, 'DSHX2002'],
    ['direct Prompt value', { prompts: [{ name: 'prompt', order: 1, text: 'invalid' }] }, 'DSHX2002'],
    ['malformed Prompt wrapper', { prompts: [{ kind: 'section', section: null }] }, 'DSHX2002'],
    ['invalid settings', { settings: {} }, 'DSHX2002'],
    ['malformed Settings wrapper', { settings: [{ kind: 'settings', namespace: 'broken' }] }, 'DSHX2002'],
    ['invalid setup', { setup: true }, 'DSHX2002'],
  ])('rejects a %s with a stable diagnostic', (_label, definition, code) => {
    expect(() =>
      createHostPlugin(definition, {
        packageId: '@test/plugin',
        sourceFile: '/project/src/host.ts',
      }),
    ).toThrow(expect.objectContaining({ code, file: '/project/src/host.ts', hint: expect.any(String) }))
  })

  it('rejects a native module without apply', () => {
    expect(() =>
      createHostModule(
        { name: 'broken' },
        {
          packageId: '@test/plugin',
          sourceFile: '/project/src/host.ts',
        },
      ),
    ).toThrow(expect.objectContaining({ code: 'DSHX2001', file: '/project/src/host.ts' }))
  })
})
