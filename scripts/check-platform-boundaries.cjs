const path = require('node:path');
const ts = require('typescript');

const inside = (file, directory) => file.startsWith(directory + path.sep);

function propertyName(node) {
  if (!node) return;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
}

function isProcessEnv(node) {
  return (
    propertyName(node) === 'env' &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process'
  );
}

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
  const storage = path.join(src, 'storage');
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
    const inStorage = inside(file, storage);
    const isTest =
      inside(file, path.join(mobile, 'tests')) ||
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
    const relative = path.relative(mobile, file);
    if (!inUi && /\.(ios|android|native|web)(\.|$)/.test(path.basename(file))) {
      errors.push(`${relative}: platform files belong in src/ui/`);
    }
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = ts.createSourceFile(
      file,
      ts.sys.readFile(file),
      ts.ScriptTarget.Latest,
      true,
    );
    const report = (node, message) => {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      errors.push(`${relative}:${line + 1}: ${message}`);
    };
    function visit(node) {
      if (!inUi) {
        const expoOsAccess =
          propertyName(node) === 'EXPO_OS' && isProcessEnv(node.expression);
        const expoOsBinding =
          ts.isVariableDeclaration(node) &&
          isProcessEnv(node.initializer) &&
          ts.isObjectBindingPattern(node.name) &&
          node.name.elements.some(
            (element) =>
              (element.propertyName ?? element.name).text === 'EXPO_OS',
          );
        if (expoOsAccess || expoOsBinding) {
          report(node, 'process.env.EXPO_OS belongs in src/ui/');
        }
      }
      const reference = moduleReference(node);
      if (reference && ts.isStringLiteralLike(reference)) {
        const specifier = reference.text;
        const resolved = ts.resolveModuleName(specifier, file, options, ts.sys)
          .resolvedModule?.resolvedFileName;
        if (!inStorage && /^expo-sqlite(?:\/|$)/.test(specifier)) {
          report(reference, 'only src/storage/ may import expo-sqlite');
        }
        if (
          inStorage &&
          resolved &&
          inside(resolved, src) &&
          !inside(resolved, storage) &&
          !inside(resolved, ui)
        ) {
          report(reference, 'src/storage/ must not import capability code');
        }
        if (!isTest && resolved === path.join(storage, 'node.ts')) {
          report(reference, 'only tests may import src/storage/node.ts');
        }
        if (inUi) {
          if (resolved && inside(resolved, src) && !inside(resolved, ui)) {
            report(reference, 'src/ui/ must not import capability code');
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
              reference,
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
