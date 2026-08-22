/** Runtime-free API contract implementation embedded in built artifacts. */
export const API_PUBLIC_SOURCE = [
  'export function method(options) { return options || {} }',
  'export function defineApi(definition) {',
  '  return {',
  '    ...definition,',
  '    host(handlers, options) {',
  "      return { kind: 'api', contract: this, handlers, authority: (options && options.authority) || 'loopback' }",
  '    },',
  '  }',
  '}',
  '',
].join('\n')
