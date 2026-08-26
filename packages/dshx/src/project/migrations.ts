import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { DshxDiagnostic } from '../diagnostics.js'

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const

function issue(file: string, message: string, hint: string): DshxDiagnostic {
  return { code: 'DSHX4501', severity: 'error', message, file, hint }
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return undefined
}

function sourceKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX
  return file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS
}

function analyzeSource(file: string, source: string): DshxDiagnostic[] {
  const diagnostics: DshxDiagnostic[] = []
  const node = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, sourceKind(file))
  const hostBindings = new Set<string>()
  const clientBindings = new Set<string>()
  const conversationBindings = new Set<string>()
  const slotBindings = new Set<string>()
  const configBindings = new Set<string>()
  const conversationLifecycles = new Set<string>()

  for (const statement of node.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const request = statement.moduleSpecifier.text
    const bindings = statement.importClause?.namedBindings
    if (request === '@becomeopc/dshx' && bindings !== undefined) {
      if (!ts.isNamespaceImport(bindings)) {
        const removed = bindings.elements
          .map(element => element.propertyName?.text ?? element.name.text)
          .filter(name => name !== 'defineConfig' && name !== 'DshxConfig')
        if (removed.length > 0)
          diagnostics.push(issue(file, `The root entry no longer exports ${removed.join(', ')}.`, 'Import each author API from its dedicated stable subpath.'))
      }
    }
    if (request === '@becomeopc/dshx/compiler' || request === '@becomeopc/dshx/compat' || request === '@becomeopc/dshx/cli') {
      diagnostics.push(issue(file, `${request} was consolidated into experimental tooling.`, 'Import the programmatic API from @becomeopc/dshx/tooling.'))
    }
    if (request === '@becomeopc/dshx/conversation') {
      diagnostics.push(
        issue(
          file,
          'Conversation moved to its explicit experimental entry.',
          'Import from @becomeopc/dshx/experimental/conversation and migrate to lifecycle.render(Component).',
        ),
      )
    }
    if (bindings === undefined || ts.isNamespaceImport(bindings)) continue
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text
      if (request === '@becomeopc/dshx/host' && imported === 'defineHost') hostBindings.add(element.name.text)
      if (request === '@becomeopc/dshx/client' && imported === 'defineClient') clientBindings.add(element.name.text)
      if (request === '@becomeopc/dshx/client' && imported === 'defineSlot') slotBindings.add(element.name.text)
      if ((request === '@becomeopc/dshx' || request === '@becomeopc/dshx/config') && imported === 'defineConfig') configBindings.add(element.name.text)
      if ((request === '@becomeopc/dshx/conversation' || request === '@becomeopc/dshx/experimental/conversation') && imported === 'defineConversation')
        conversationBindings.add(element.name.text)
      if (request === '@becomeopc/dshx/client' && imported === 'useQuery') {
        diagnostics.push(issue(file, 'useQuery was renamed to useApiQuery.', 'Import and call useApiQuery from @becomeopc/dshx/client.'))
      }
      if (imported === 'defineConversationNode') {
        diagnostics.push(
          issue(
            file,
            'defineConversationNode() and the separate renderer Slot were removed.',
            'Use defineConversation({ kind, events, initial, reduce, project }).render(Component) from @becomeopc/dshx/experimental/conversation.',
          ),
        )
      }
    }
  }

  for (const statement of node.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined &&
        ts.isCallExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        conversationBindings.has(declaration.initializer.expression.text)
      ) {
        conversationLifecycles.add(declaration.name.text)
      }
    }
  }

  const checkConfigObject = (object: ts.ObjectLiteralExpression): void => {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const name = propertyName(property.name)
      if ((name === 'host' || name === 'client') && ts.isStringLiteralLike(property.initializer)) {
        diagnostics.push(
          issue(file, `String shorthand for config.${name} was removed.`, `Use ${name}: { entry: ${JSON.stringify(property.initializer.text)} }.`),
        )
      }
    }
  }

  const visit = (current: ts.Node): void => {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      const argument = current.arguments[0]
      if (argument !== undefined && ts.isObjectLiteralExpression(argument)) {
        if (configBindings.has(current.expression.text)) checkConfigObject(argument)
        if (hostBindings.has(current.expression.text)) {
          for (const property of argument.properties) {
            if ('name' in property && propertyName(property.name) === 'api') {
              diagnostics.push(issue(file, 'defineHost({ api }) was removed.', 'Use defineHost({ apis: [contract.host(...)] }).'))
            }
          }
        }
        if (clientBindings.has(current.expression.text)) {
          for (const property of argument.properties) {
            if ('name' in property) {
              const name = propertyName(property.name)
              if (name === 'api' || name === 'apis') {
                diagnostics.push(
                  issue(file, `defineClient({ ${name} }) was removed.`, 'Delete the field; retained useApi/useApiQuery Hooks infer the Client capability.'),
                )
              }
              if (name === 'conversationNodes') {
                diagnostics.push(
                  issue(
                    file,
                    'defineClient({ conversationNodes }) was replaced by integrated Conversation contributions.',
                    'Use conversations: [lifecycle.render(Component)] and remove the separate conversation.chat.node Slot.',
                  ),
                )
              }
            }
          }
        }
      }
      if (conversationBindings.has(current.expression.text) && argument !== undefined && ts.isObjectLiteralExpression(argument)) {
        for (const property of argument.properties) {
          if ('name' in property && propertyName(property.name) === 'view') {
            diagnostics.push(
              issue(
                file,
                'Conversation view was renamed to project.',
                'Move projection logic to project(), then attach React with lifecycle.render(Component).',
              ),
            )
          }
        }
      }
    }
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      slotBindings.has(current.expression.text) &&
      current.arguments[0] !== undefined &&
      ts.isStringLiteralLike(current.arguments[0]) &&
      current.arguments[0].text === 'conversation.chat.node'
    ) {
      diagnostics.push(
        issue(
          file,
          'A separate conversation.chat.node renderer Slot is no longer required.',
          'Pass the React component to lifecycle.render(Component) and register the result in defineClient({ conversations }).',
        ),
      )
    }
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === 'component' &&
      ((ts.isIdentifier(current.expression.expression) && conversationLifecycles.has(current.expression.expression.text)) ||
        (ts.isCallExpression(current.expression.expression) &&
          ts.isIdentifier(current.expression.expression.expression) &&
          conversationBindings.has(current.expression.expression.expression.text)))
    ) {
      diagnostics.push(
        issue(
          file,
          'Conversation .component(...) was replaced by .render(Component).',
          'Keep lifecycle callbacks in defineConversation(...) and pass only the React renderer to .render(...).',
        ),
      )
    }
    if (file.endsWith('dshx.config.ts') && ts.isExportAssignment(current) && ts.isObjectLiteralExpression(current.expression))
      checkConfigObject(current.expression)
    ts.forEachChild(current, visit)
  }
  visit(node)
  return diagnostics
}

/** Report removed 0.1 authoring forms before TypeScript collapses them into generic errors. */
export async function checkMigrationDiagnostics(config: ResolvedDshxConfig): Promise<DshxDiagnostic[]> {
  const files = ts.sys.readDirectory(config.root, [...SOURCE_EXTENSIONS], ['node_modules', 'dist', '.git'], ['src/**/*', 'dshx.config.ts'])
  const diagnostics: DshxDiagnostic[] = []
  for (const file of files) {
    const absolute = resolve(file)
    let source: string
    try {
      source = await readFile(absolute, 'utf8')
    } catch {
      continue
    }
    diagnostics.push(...analyzeSource(absolute, source))
  }
  return diagnostics
}
