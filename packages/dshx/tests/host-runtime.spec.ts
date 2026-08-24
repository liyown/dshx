import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { defineTool as officialDefineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineCommand, defineHost, defineTool } from '../src/host/index.js'
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
    const ctx = context((value) => {
      calls.push(`tool:${value.name}`)
      return value === first ? firstDispose : secondDispose
    })
    const plugin = createHostPlugin({
      inject: ['agents', 'agents'],
      tools: [first, second],
      async setup(received: Context) {
        expect(received).toBe(ctx)
        await Promise.resolve()
        calls.push('setup')
      },
    }, { packageId: '@test/plugin', logicalName: 'logical-host', sourceFile: '/project/src/host.ts' })

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
    const plugin = createHostPlugin({ name: 'explicit-host', inject: ['tools', 'agents', 'tools'], tools: [], setup }, {
      packageId: '@test/plugin',
      logicalName: 'logical-host',
    })
    expect(plugin.name).toBe('explicit-host')
    expect(plugin.inject).toEqual(['tools', 'agents'])
    plugin.apply(context(register))
    expect(register).not.toHaveBeenCalled()
    expect(setup).toHaveBeenCalledOnce()
  })

  it('does not hide duplicate tools from the official registry', () => {
    const duplicate = tool('duplicate')
    const register = vi.fn()
      .mockImplementationOnce(() => vi.fn())
      .mockImplementationOnce(() => { throw new Error('official duplicate tool error') })
    const plugin = createHostPlugin({ tools: [duplicate, duplicate] }, { packageId: '@test/plugin' })
    expect(() => plugin.apply(context(register))).toThrow('official duplicate tool error')
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('registers Commands in declaration order and delegates collision and disposal to DSH', () => {
    const calls: string[] = []
    const first = defineCommand({ name: 'first', description: 'First.', handler: () => ({ kind: 'success' }) })
    const second = defineCommand({ name: 'second', description: 'Second.', handler: () => ({ kind: 'success' }) })
    const commandDisposers = [vi.fn(), vi.fn()]
    const plugin = createHostPlugin({
      inject: ['commands', 'commands'],
      commands: [first, second],
      setup() { calls.push('setup') },
    }, { packageId: '@test/plugin' })
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
    ['invalid setup', { setup: true }, 'DSHX2002'],
  ])('rejects a %s with a stable diagnostic', (_label, definition, code) => {
    expect(() => createHostPlugin(definition, {
      packageId: '@test/plugin',
      sourceFile: '/project/src/host.ts',
    })).toThrow(expect.objectContaining({ code, file: '/project/src/host.ts', hint: expect.any(String) }))
  })

  it('rejects a native module without apply', () => {
    expect(() => createHostModule({ name: 'broken' }, {
      packageId: '@test/plugin',
      sourceFile: '/project/src/host.ts',
    })).toThrow(expect.objectContaining({ code: 'DSHX2001', file: '/project/src/host.ts' }))
  })
})
