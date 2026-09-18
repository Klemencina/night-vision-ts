const path = require('node:path')
const fs = require('node:fs')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile)
const formatHost = {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n'
}

function check(diagnostics) {
    if (!diagnostics.length) return
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost))
    process.exit(1)
}

check(config.error ? [config.error] : [])
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
check(parsed.errors)

const program = ts.createProgram(
    [path.join(root, 'src/index.ts'), path.join(__dirname, 'modules.d.ts')],
    {
        ...parsed.options,
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        declarationMap: false,
        noEmitOnError: true,
        rootDir: path.join(root, 'src'),
        outDir: path.join(root, 'dist')
    }
)

// NodeNext consumers need explicit extensions in ESM declarations.
function declarationExtensions(context) {
    const { factory } = context
    function visit(node) {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            const specifier = node.moduleSpecifier.text
            if (specifier.startsWith('.') && !path.extname(specifier)) {
                const updated = factory.createStringLiteral(`${specifier}.js`)
                return ts.isImportDeclaration(node)
                    ? factory.updateImportDeclaration(
                          node,
                          node.modifiers,
                          node.importClause,
                          updated,
                          node.attributes
                      )
                    : factory.updateExportDeclaration(
                          node,
                          node.modifiers,
                          node.isTypeOnly,
                          node.exportClause,
                          updated,
                          node.attributes
                      )
            }
        }
        return ts.visitEachChild(node, visit, context)
    }
    return source => ts.visitNode(source, visit)
}

check(ts.getPreEmitDiagnostics(program))
const result = program.emit(undefined, undefined, undefined, true, {
    afterDeclarations: [declarationExtensions]
})
check(result.diagnostics)
if (result.emitSkipped) process.exit(1)

// Keep CommonJS declarations in CommonJS mode without copying the public API.
const checker = program.getTypeChecker()
const entry = program.getSourceFile(path.join(root, 'src/index.ts'))
const entryExports = checker.getExportsOfModule(checker.getSymbolAtLocation(entry))
const commonjs = [
    'import type * as Api from "./index.js" with { "resolution-mode": "import" };',
    ''
]
for (const symbol of entryExports) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    const name = symbol.getName()
    if (target.flags & ts.SymbolFlags.Value) {
        commonjs.push(`export declare const ${name}: typeof Api.${name};`)
    }
    if (target.flags & ts.SymbolFlags.Type) {
        commonjs.push(`export type ${name} = Api.${name};`)
    }
}
fs.writeFileSync(path.join(root, 'dist/index.d.cts'), commonjs.join('\n') + '\n')
