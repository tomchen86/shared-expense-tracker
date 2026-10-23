const path = require('node:path');
const ts = require('typescript');

const inside = (file, directory) => file.startsWith(directory + path.sep);

function moduleReference(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier;
  }
  if (ts.isImportEqualsDeclaration(node)) {
    return node.moduleReference.expression;
  }
  if (ts.isImportTypeNode(node)) return node.argument.literal;
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
  ) {
    return node.arguments[0];
  }
}

function checkPlatformBoundaries(mobile) {
  const src = path.join(mobile, 'src');
  const ui = path.join(src, 'ui');
  const config = ts.readConfigFile(
    path.join(mobile, 'tsconfig.json'),
    ts.sys.readFile,
  );
  if (config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, '\n'),
    );
  const { options } = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    mobile,
  );
  const errors = [];
  const files = ts.sys.readDirectory(mobile, undefined, [
    '**/node_modules/**',
    '**/.expo/**',
    '**/dist/**',
    '**/coverage/**',
    path.join(mobile, 'ios'),
    path.join(mobile, 'android'),
  ]);

  for (const file of files) {
    const inUi = inside(file, ui);
    const relative = path.relative(mobile, file);
    if (!inUi && /\.(ios|android)(\.|$)/.test(path.basename(file))) {
      errors.push(`${relative}: platform files belong in src/ui/`);
    }
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = ts.createSourceFile(
      file,
      ts.sys.readFile(file),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      const reference = moduleReference(node);
      if (reference && ts.isStringLiteralLike(reference)) {
        const specifier = reference.text;
        const report = (message) => {
          const { line } = source.getLineAndCharacterOfPosition(
            reference.getStart(source),
          );
          errors.push(`${relative}:${line + 1}: ${message}`);
        };
        if (inUi) {
          const resolved = ts.resolveModuleName(
            specifier,
            file,
            options,
            ts.sys,
          ).resolvedModule?.resolvedFileName;
          if (resolved && inside(resolved, src) && !inside(resolved, ui)) {
            report('src/ui/ must not import capability code');
          }
        } else {
          const bindings =
            node.importClause?.namedBindings ?? node.exportClause;
          const namedPlatform = bindings?.elements?.some(
            (element) =>
              (element.propertyName ?? element.name).text === 'Platform',
          );
          // Whole-module imports can hide Platform access behind an alias or destructuring.
          const wholeReactNative =
            specifier === 'react-native' &&
            (node.importClause?.name ||
              (bindings &&
                (ts.isNamespaceImport(bindings) ||
                  ts.isNamespaceExport(bindings))) ||
              (ts.isExportDeclaration(node) && !bindings) ||
              ts.isCallExpression(node) ||
              ts.isImportEqualsDeclaration(node) ||
              ts.isImportTypeNode(node));
          if (
            namedPlatform ||
            wholeReactNative ||
            /^react-native\/.*\bPlatform\b/.test(specifier)
          ) {
            report(
              'Platform belongs in src/ui/; use named React Native imports elsewhere',
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return errors;
}

if (require.main === module) {
  const errors = checkPlatformBoundaries(
    path.resolve(__dirname, '../apps/mobile'),
  );
  for (const error of errors) console.error(error);
  process.exitCode = errors.length ? 1 : 0;
}

module.exports = { checkPlatformBoundaries };
