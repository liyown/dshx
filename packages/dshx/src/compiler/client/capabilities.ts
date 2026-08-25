import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import ts from 'typescript'

const CLIENT_PUBLIC = '@becomeopc/dshx/client'
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'] as const

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

function settingsCallAndImports(source: string, file: string): { readonly uses: boolean; readonly imports: readonly string[] } {
  const node = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hookNames = new Set<string>()
  const namespaces = new Set<string>()
  const imports: string[] = []
  for (const statement of node.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const request = statement.moduleSpecifier.text
    if (request.startsWith('.')) imports.push(request)
    if (request !== CLIENT_PUBLIC) continue
    const bindings = statement.importClause?.namedBindings
    if (bindings === undefined) continue
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
    else {
      for (const element of bindings.elements) {
        if ((element.propertyName?.text ?? element.name.text) === 'useSettings') hookNames.add(element.name.text)
      }
    }
  }
  let uses = false
  const visit = (current: ts.Node): void => {
    if (uses) return
    if (ts.isCallExpression(current)) {
      const expression = current.expression
      if (ts.isIdentifier(expression) && hookNames.has(expression.text)) uses = true
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        namespaces.has(expression.expression.text) &&
        expression.name.text === 'useSettings'
      )
        uses = true
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return { uses, imports }
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
    const analysis = settingsCallAndImports(source, file)
    if (analysis.uses) return true
    for (const request of analysis.imports) {
      const target = await sourceFile(request, file)
      if (target !== undefined && !visited.has(target)) pending.push(target)
    }
  }
  return false
}
