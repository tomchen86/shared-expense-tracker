const path = require('node:path');
const ts = require('typescript');

const domain = path.resolve(__dirname, '../../packages/domain');

function diagnostics(configFile, code) {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(domain, configFile),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (error) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(error.messageText, '\n'),
        );
      },
    },
  );
  const file = path.join(domain, 'src/__tooling_type_probe__.ts');
  const host = ts.createCompilerHost(config.options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (filename, ...args) =>
    filename === file
      ? ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
      : getSourceFile(filename, ...args);
  return ts
    .getPreEmitDiagnostics(ts.createProgram([file], config.options, host))
    .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'));
}

test.each([
  ['process', 'process.cwd();'],
  ['Buffer', "Buffer.from('text');"],
  ['require', "require('node:fs');"],
  ['node:fs', "import { readFileSync } from 'node:fs'; readFileSync('file');"],
  ['test', "test('a test', () => {});"],
])('domain source rejects the %s API', (name, code) => {
  expect(diagnostics('tsconfig.json', code)).toEqual([
    expect.stringContaining(`Cannot find name '${name}'`),
  ]);
});

test('domain source can use portable JavaScript APIs', () => {
  expect(
    diagnostics(
      'tsconfig.json',
      'export const doubled = [1, 2].map(value => value * 2);',
    ),
  ).toEqual([]);
});

test('domain tests can use Jest and Node without enabling them in source', () => {
  expect(
    diagnostics(
      'tsconfig.test.json',
      `import { readFileSync } from 'node:fs';
       test('test tooling', () => expect(typeof readFileSync).toBe('function'));
      `,
    ),
  ).toEqual([]);
});
