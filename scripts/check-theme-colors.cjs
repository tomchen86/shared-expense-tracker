const path = require('node:path');
const ts = require('typescript');

const namedColors = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black
   blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse
   chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
   darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
   darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
   darkslateblue darkslategray darkslategrey darkturquoise darkviolet
   deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
   forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green
   greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender
   lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
   lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
   lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue
   lightyellow lime limegreen linen magenta maroon mediumaquamarine
   mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
   mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
   mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered
   orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip
   peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown
   royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver
   skyblue slateblue slategray slategrey snow springgreen steelblue tan teal
   thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    /\s+/,
  ),
);

function isColor(value) {
  const color = value.trim().toLowerCase();
  return (
    namedColors.has(color) ||
    /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(color) ||
    /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/.test(color)
  );
}

function checkThemeColors(mobile) {
  const errors = [];
  const files = ts.sys.readDirectory(
    mobile,
    undefined,
    [
      '**/node_modules/**',
      '**/tests/**',
      '**/__tests__/**',
      path.join(mobile, 'src/ui'),
    ],
    ['src/**/*', 'app/**/*'],
  );

  for (const file of files) {
    if (
      !/\.[cm]?[jt]sx?$/.test(file) ||
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
    ) {
      continue;
    }
    const source = ts.createSourceFile(
      file,
      ts.sys.readFile(file),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      const value = ts.isStringLiteralLike(node)
        ? node.text
        : ts.isTemplateExpression(node)
          ? node.head.text
          : undefined;
      if (value !== undefined && isColor(value)) {
        const { line } = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );
        errors.push(
          `${path.relative(mobile, file)}:${line + 1}: hard-coded color ${JSON.stringify(value)} belongs in src/ui/; use useThemeColors()`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return errors;
}

if (require.main === module) {
  const errors = checkThemeColors(path.resolve(__dirname, '../apps/mobile'));
  for (const error of errors) console.error(error);
  process.exitCode = errors.length ? 1 : 0;
}

module.exports = { checkThemeColors };
