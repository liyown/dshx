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

function objectUsesConversations(expression: ts.Expression | undefined): boolean {
  if (expression === undefined) return false
  const value = unwrapExpression(expression)
  // An indirect definition cannot prove that conversations are absent. The
  // final build check intentionally requires provider edges in that case.
  if (!ts.isObjectLiteralExpression(value)) return true
  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) return true
    const name = staticPropertyName(property.name)
    if (name === undefined && ts.isComputedPropertyName(property.name)) return true
    if (name !== 'conversations') continue
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
        if (importedName === 'useApi' || importedName === 'useQuery') apiHookNames.add(element.name.text)
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
        (expression.name.text === 'useApi' || expression.name.text === 'useQuery')
      )
        api = true
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return { settings, api, imports }
}

function conversationDefinition(source: string, file: string): ConversationDefinitionAnalysis {
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
    if (ts.isObjectLiteralExpression(expression)) return objectUsesConversations(expression)
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
    const analysis = conversationDefinition(source, file)
    if (analysis.uses) return true
    for (const request of analysis.reexports) {
      const target = await sourceFile(request, file)
      if (target !== undefined && !visited.has(target)) pending.push(target)
    }
  }
  return false
}
