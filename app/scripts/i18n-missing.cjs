// Lista los textos de la app (t, tn, msg, labels, nombres y consejos de ejercicios) que faltan en algún
// catálogo de traducción. Uso: npm run i18n
const ts = require("typescript");
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "src");
const keys = new Set();
const strings = (node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) keys.add(node.text);
  ts.forEachChild(node, strings);
};
function scan(file) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const inCatalog = file.includes(`${path.sep}domain${path.sep}exercises${path.sep}`);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === "labels") node.arguments.forEach(strings);
      const args = name === "tn" ? node.arguments.slice(1, 3) : name === "t" || name === "msg" ? node.arguments.slice(0, 1) : [];
      for (const arg of args) if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) keys.add(arg.text);
    }
    if (inCatalog && ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && (node.name.text === "name" || node.name.text === "cues")) strings(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(src);
}
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !full.includes(`${path.sep}i18n${path.sep}`)) scan(full);
  }
})(root);
let missing = 0;
for (const lang of ["en", "fr", "de"]) {
  const text = fs.readFileSync(path.join(root, "i18n", "catalogs", `${lang}.ts`), "utf8");
  const have = new Set([...text.matchAll(/^  ("(?:[^"\\]|\\.)*"): /gm)].map((m) => JSON.parse(m[1])));
  const absent = [...keys].filter((key) => !have.has(key));
  missing += absent.length;
  if (absent.length) console.log(`${lang}: faltan ${absent.length}\n  ${absent.slice(0, 30).join("\n  ")}`);
}
console.log(missing ? `Faltan ${missing} traducciones.` : `Todo traducido (${keys.size} textos en 3 idiomas).`);
process.exit(missing ? 1 : 0);
