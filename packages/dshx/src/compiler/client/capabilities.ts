import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import ts from 'typescript'

const CLIENT_PUBLIC = '@becomeopc/dshx/client'
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'] as const

interface SourceCapabilityAnalysis {
  readonly settings: boolean
  readonly api: boolean
  readonly imports: readonly string[]
}

interface ConversationDefinitionAnalysis {
  readonly uses: boolean
  readonly reexports: readonly string[]
}

/** Optional Cordis services that Client setup code may consume directly. */
export const CLIENT_SETUP_SERVICE_CAPABILITIES = {
  locale: { provider: '@deepseek-ai/dsh-client-locale' },
} as const

export interface ClientSetupServiceAnalysis {
  readonly services: readonly (keyof typeof CLIENT_SETUP_SERVICE_CAPABILITIES)[]
  /** Undefined means a dynamic definition prevented a safe static conclusion. */
  readonly inject: readonly string[] | undefined
  /** Services supplied by declarative Client fields such as non-empty locales. */
  readonly autoInject: readonly (keyof typeof CLIENT_SETUP_SERVICE_CAPABILITIES)[]
  readonly sourceFile: string | undefined
}

interface ClientDefinitionSourceAnalysis extends ClientSetupServiceAnalysis {
  readonly reexports: readonly string[]
}

async function sourceFile(specifier: string, importer: string): Promise<string | undefined> {
  const target = resolve(importer, '..', specifier)
  const extension = extname(target)
  const candidates =
    extension === ''
      ? [...SOURCE_EXTENSIONS.map(item => `${target}${item}`), ...SOURCE_EXTENSIONS.map(item => resolve(target, `index${item}`))]
      : [target, ...(extension === '.js' ? SOURCE_EXTENSIONS.slice(0, 3).map(item => `${target.slice(0, -3)}${item}`) : [])]
  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8')
      return candidate
    } catch {
      // Try the next TypeScript/JavaScript source form.
    }
  }
  return undefined
}

function staticPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text
  return undefined
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isNonNullExpression(expression)) {
    return unwrapExpression(expression.expression)
  }
  return expression
}

function objectUsesDefinitionProperty(expression: ts.Expression | undefined, field: 'conversations' | 'locales'): boolean {
  if (expression === undefined) return false
  const value = unwrapExpression(expression)
  // An indirect definition cannot prove that conversations are absent. The
  // final build check intentionally requires provider edges in that case.
  if (!ts.isObjectLiteralExpression(value)) return true
  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (field === 'conversations') return true
      continue
    }
    const name = staticPropertyName(property.name)
    if (name === undefined && ts.isComputedPropertyName(property.name)) {
      if (field === 'conversations') return true
      continue
    }
    if (name !== field) continue
    if (ts.isPropertyAssignment(property)) {
      const initializer = unwrapExpression(property.initializer)
      if (ts.isArrayLiteralExpression(initializer) && initializer.elements.length === 0) continue
    }
    return true
  }
  return false
}

function sourceCapabilities(source: string, file: string): SourceCapabilityAnalysis {
  const node = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const settingsHookNames = new Set<string>()
  const apiHookNames = new Set<string>()
  const namespaces = new Set<string>()
  const imports: string[] = []
  for (const statement of node.statements) {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.moduleSpecifier.text.startsWith('.')) imports.push(statement.moduleSpecifier.text)
      continue
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const request = statement.moduleSpecifier.text
    if (request.startsWith('.')) imports.push(request)
    if (request !== CLIENT_PUBLIC) continue
    const bindings = statement.importClause?.namedBindings
    if (bindings === undefined) continue
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
    else {
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text
        if (importedName === 'useSettings') settingsHookNames.add(element.name.text)
        if (importedName === 'useApi' || importedName === 'useApiQuery') apiHookNames.add(element.name.text)
      }
    }
  }
  let settings = false
  let api = false
  const visit = (current: ts.Node): void => {
    if (ts.isCallExpression(current)) {
      const expression = current.expression
      if (ts.isIdentifier(expression) && settingsHookNames.has(expression.text)) settings = true
      if (ts.isIdentifier(expression) && apiHookNames.has(expression.text)) api = true
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        namespaces.has(expression.expression.text) &&
        expression.name.text === 'useSettings'
      )
        settings = true
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        namespaces.has(expression.expression.text) &&
        (expression.name.text === 'useApi' || expression.name.text === 'useApiQuery')
      )
        api = true
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return { settings, api, imports }
}

function declarativeClientDefinition(source: string, file: string, field: 'conversations' | 'locales'): ConversationDefinitionAnalysis {
  const node = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const clientNames = new Set<string>()
  const namespaces = new Set<string>()
  const initializers = new Map<string, ts.Expression>()
  const reexports: string[] = []
  let unknownReexport = false
  for (const statement of node.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === CLIENT_PUBLIC) {
      const bindings = statement.importClause?.namedBindings
      if (bindings === undefined) continue
      if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
      else {
        for (const element of bindings.elements) {
          if ((element.propertyName?.text ?? element.name.text) === 'defineClient') clientNames.add(element.name.text)
        }
      }
      continue
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
          initializers.set(declaration.name.text, declaration.initializer)
        }
      }
      continue
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.') &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (element.name.text !== 'default') continue
        if (element.propertyName === undefined || element.propertyName.text === 'default') reexports.push(statement.moduleSpecifier.text)
        else unknownReexport = true
      }
    }
  }

  const inspect = (input: ts.Expression, seen = new Set<string>()): boolean => {
    const expression = unwrapExpression(input)
    if (ts.isObjectLiteralExpression(expression)) return objectUsesDefinitionProperty(expression, field)
    if (ts.isIdentifier(expression)) {
      if (seen.has(expression.text)) return true
      const initializer = initializers.get(expression.text)
      if (initializer === undefined) return true
      const next = new Set(seen)
      next.add(expression.text)
      return inspect(initializer, next)
    }
    if (ts.isCallExpression(expression)) {
      const callee = expression.expression
      const defineClientCall =
        (ts.isIdentifier(callee) && clientNames.has(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          namespaces.has(callee.expression.text) &&
          callee.name.text === 'defineClient')
      const argument = expression.arguments[0]
      return defineClientCall ? (argument === undefined ? false : inspect(argument, seen)) : true
    }
    return true
  }

  for (const statement of node.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) return { uses: inspect(statement.expression), reexports }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const defaultExport = statement.exportClause.elements.find(element => element.name.text === 'default')
      if (defaultExport !== undefined) {
        const localName = defaultExport.propertyName?.text ?? defaultExport.name.text
        const initializer = initializers.get(localName)
        return { uses: initializer === undefined ? true : inspect(initializer), reexports }
      }
    }
  }
  return { uses: unknownReexport, reexports }
}

function functionUsesSetupService(declaration: ts.FunctionLikeDeclaration, service: keyof typeof CLIENT_SETUP_SERVICE_CAPABILITIES): boolean {
  const parameter = declaration.parameters[0]
  if (parameter === undefined) return false
  if (ts.isObjectBindingPattern(parameter.name)) {
    return parameter.name.elements.some(element => (element.propertyName?.getText() ?? element.name.getText()) === service)
  }
  if (!ts.isIdentifier(parameter.name) || declaration.body === undefined) return false
  const contextName = parameter.name.text
  let used = false
  const visit = (node: ts.Node): void => {
    if (used) return
    if (node !== declaration && ts.isFunctionLike(node)) {
      const shadowsContext = node.parameters.some(item => ts.isIdentifier(item.name) && item.name.text === contextName)
      if (shadowsContext) return
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === contextName && node.name.text === service) {
      used = true
      return
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === contextName &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === service
    ) {
      used = true
      return
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer !== undefined &&
      ts.isIdentifier(unwrapExpression(node.initializer)) &&
      (unwrapExpression(node.initializer) as ts.Identifier).text === contextName &&
      node.name.elements.some(element => (element.propertyName?.getText() ?? element.name.getText()) === service)
    ) {
      used = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration.body)
  return used
}

function clientSetupServicesInSource(source: string, file: string): ClientDefinitionSourceAnalysis {
  const node = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const clientNames = new Set<string>()
  const namespaces = new Set<string>()
  const initializers = new Map<string, ts.Expression>()
  const functions = new Map<string, ts.FunctionLikeDeclaration>()
  const reexports: string[] = []

  for (const statement of node.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === CLIENT_PUBLIC) {
      const bindings = statement.importClause?.namedBindings
      if (bindings === undefined) continue
      if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
      else {
        for (const element of bindings.elements) {
          if ((element.propertyName?.text ?? element.name.text) === 'defineClient') clientNames.add(element.name.text)
        }
      }
      continue
    }
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) functions.set(statement.name.text, statement)
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) initializers.set(declaration.name.text, declaration.initializer)
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.') &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some(element => element.name.text === 'default' && (element.propertyName?.text ?? 'default') === 'default')
    ) {
      reexports.push(statement.moduleSpecifier.text)
    }
  }

  const resolveExpression = (input: ts.Expression, seen = new Set<string>()): ts.Expression | undefined => {
    const expression = unwrapExpression(input)
    if (!ts.isIdentifier(expression)) return expression
    if (seen.has(expression.text)) return undefined
    const initializer = initializers.get(expression.text)
    if (initializer === undefined) return undefined
    const next = new Set(seen)
    next.add(expression.text)
    return resolveExpression(initializer, next)
  }

  const resolveFunction = (input: ts.Expression, seen = new Set<string>()): ts.FunctionLikeDeclaration | undefined => {
    const expression = unwrapExpression(input)
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) return expression
    if (!ts.isIdentifier(expression) || seen.has(expression.text)) return undefined
    const declaration = functions.get(expression.text)
    if (declaration !== undefined) return declaration
    const initializer = initializers.get(expression.text)
    const next = new Set(seen)
    next.add(expression.text)
    return initializer === undefined ? undefined : resolveFunction(initializer, next)
  }

  let defaultExpression: ts.Expression | undefined
  for (const statement of node.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) defaultExpression = statement.expression
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const exported = statement.exportClause.elements.find(element => element.name.text === 'default')
      if (exported !== undefined) {
        const local = exported.propertyName?.text ?? exported.name.text
        defaultExpression = initializers.get(local)
      }
    }
  }
  if (defaultExpression === undefined)
    return {
      services: [],
      inject: undefined,
      autoInject: [],
      sourceFile: undefined,
      reexports,
    }
  const resolvedDefault = resolveExpression(defaultExpression)
  if (resolvedDefault === undefined || !ts.isCallExpression(resolvedDefault)) {
    return {
      services: [],
      inject: undefined,
      autoInject: [],
      sourceFile: undefined,
      reexports,
    }
  }
  const callee = resolvedDefault.expression
  const isDefineClient =
    (ts.isIdentifier(callee) && clientNames.has(callee.text)) ||
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      namespaces.has(callee.expression.text) &&
      callee.name.text === 'defineClient')
  if (!isDefineClient || resolvedDefault.arguments[0] === undefined) {
    return {
      services: [],
      inject: undefined,
      autoInject: [],
      sourceFile: undefined,
      reexports,
    }
  }
  const definition = resolveExpression(resolvedDefault.arguments[0])
  if (definition === undefined || !ts.isObjectLiteralExpression(definition)) {
    return { services: [], inject: undefined, autoInject: [], sourceFile: file, reexports }
  }

  const properties = definition.properties
  const spreadIndex = properties.reduce((last, property, index) => (ts.isSpreadAssignment(property) ? index : last), -1)
  const injectIndex = properties.reduce(
    (last, property, index) => (!ts.isSpreadAssignment(property) && staticPropertyName(property.name) === 'inject' ? index : last),
    -1,
  )
  let inject: readonly string[] | undefined = []
  if (injectIndex >= 0 && spreadIndex <= injectIndex) {
    const property = properties[injectIndex]
    const initializer =
      property !== undefined && ts.isPropertyAssignment(property)
        ? resolveExpression(property.initializer)
        : property !== undefined && ts.isShorthandPropertyAssignment(property)
          ? resolveExpression(property.name)
          : undefined
    inject =
      initializer !== undefined &&
      ts.isArrayLiteralExpression(initializer) &&
      initializer.elements.every(element => ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element))
        ? initializer.elements.map(element => (element as ts.StringLiteralLike).text)
        : undefined
  } else if (spreadIndex >= 0) {
    inject = undefined
  }

  const localeIndex = properties.reduce(
    (last, property, index) => (!ts.isSpreadAssignment(property) && staticPropertyName(property.name) === 'locales' ? index : last),
    -1,
  )
  const localeProperty = localeIndex >= 0 && spreadIndex <= localeIndex ? properties[localeIndex] : undefined
  const localeInitializer =
    localeProperty !== undefined && ts.isPropertyAssignment(localeProperty)
      ? resolveExpression(localeProperty.initializer)
      : localeProperty !== undefined && ts.isShorthandPropertyAssignment(localeProperty)
        ? resolveExpression(localeProperty.name)
        : undefined
  const autoInject =
    localeInitializer !== undefined && ts.isArrayLiteralExpression(localeInitializer) && localeInitializer.elements.length > 0 ? (['locale'] as const) : []

  let setup: ts.FunctionLikeDeclaration | undefined
  for (let index = properties.length - 1; index >= 0; index -= 1) {
    if (index < spreadIndex) break
    const property = properties[index]
    if (property === undefined || ts.isSpreadAssignment(property) || staticPropertyName(property.name) !== 'setup') continue
    if (ts.isMethodDeclaration(property)) setup = property
    else if (ts.isPropertyAssignment(property)) setup = resolveFunction(property.initializer)
    else if (ts.isShorthandPropertyAssignment(property)) setup = functions.get(property.name.text) ?? resolveFunction(property.name)
    break
  }
  if (setup === undefined) return { services: [], inject, autoInject, sourceFile: file, reexports }
  const services = (Object.keys(CLIENT_SETUP_SERVICE_CAPABILITIES) as Array<keyof typeof CLIENT_SETUP_SERVICE_CAPABILITIES>).filter(service =>
    functionUsesSetupService(setup!, service),
  )
  return { services, inject, autoInject, sourceFile: file, reexports }
}

/** Conservative source-level capability preview; the post-tree-shake build check is authoritative. */
export async function clientUsesSettings(entry: string, root: string): Promise<boolean> {
  const pending = [resolve(root, entry)]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    let source: string
    try {
      source = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const analysis = sourceCapabilities(source, file)
    if (analysis.settings) return true
    for (const request of analysis.imports) {
      const target = await sourceFile(request, file)
      if (target !== undefined && !visited.has(target)) pending.push(target)
    }
  }
  return false
}

/** Conservative source-level preview for retained API hook capability. */
export async function clientUsesApi(entry: string, root: string): Promise<boolean> {
  const pending = [resolve(root, entry)]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    let source: string
    try {
      source = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const analysis = sourceCapabilities(source, file)
    if (analysis.api) return true
    for (const request of analysis.imports) {
      const target = await sourceFile(request, file)
      if (target !== undefined && !visited.has(target)) pending.push(target)
    }
  }
  return false
}

/** Conservative preview of an explicit defineClient({ conversations }) contribution. */
export async function clientUsesConversationComponents(entry: string, root: string): Promise<boolean> {
  const pending = [resolve(root, entry)]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    let source: string
    try {
      source = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const analysis = declarativeClientDefinition(source, file, 'conversations')
    if (analysis.uses) return true
    for (const request of analysis.reexports) {
      const target = await sourceFile(request, file)
      if (target !== undefined && !visited.has(target)) pending.push(target)
    }
  }
  return false
}

/** Conservative preview of an explicit defineClient({ locales }) contribution. */
export async function clientUsesLocales(entry: string, root: string): Promise<boolean> {
  const pending = [resolve(root, entry)]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    let source: string
    try {
      source = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const analysis = declarativeClientDefinition(source, file, 'locales')
    if (analysis.uses) return true
    for (const request of analysis.reexports) {
      const target = await sourceFile(request, file)
      if (target !== undefined && !visited.has(target)) pending.push(target)
    }
  }
  return false
}

/** Inspect direct optional Cordis-service use in defineClient({ setup(ctx) }). */
export async function clientSetupServices(entry: string, root: string): Promise<ClientSetupServiceAnalysis> {
  const pending = [resolve(root, entry)]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    let source: string
    try {
      source = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const analysis = clientSetupServicesInSource(source, file)
    if (analysis.sourceFile !== undefined) return analysis
    for (const request of analysis.reexports) {
      const target = await sourceFile(request, file)
      if (target !== undefined && !visited.has(target)) pending.push(target)
    }
  }
  return { services: [], inject: undefined, autoInject: [], sourceFile: undefined }
}
