/**
 * Iconos de lucide, solo los que se usan.
 *
 * `import { House, Dumbbell } from "lucide-react-native"` carga el índice de la librería, que trae sus
 * ~2.150 iconos: Metro no descarta lo que no se usa, y en la web eran más de 3 MB de los 4,6 MB del
 * paquete. Esta regla de Babel cambia cada icono por su archivo:
 *
 *   import { House as Casa, type LucideIcon } from "lucide-react-native";
 *   →  import Casa from "lucide-react-native/icons/house";
 *
 * En el código se sigue importando como siempre. Los tipos y lo que no es un icono (`createLucideIcon`,
 * `Icon`…) se quedan en el import original. Los alias de la librería (`BarChart3` → `chart-column`) salen
 * de su propio índice, así que la regla no hay que tocarla al usar iconos nuevos.
 */
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE = "lucide-react-native";

/** Nombre exportado → archivo del icono («House» → «house»), leído del índice ESM de la librería. */
function readIconFiles() {
  // `main` apunta a dist/cjs/lucide-react-native.js; el índice ESM está al lado.
  const cjsEntry = require.resolve(PACKAGE);
  const index = path.join(path.dirname(cjsEntry), "..", "esm", "lucide-react-native.mjs");
  const files = new Map();
  const line = /^export \{([^}]*)\} from '\.\/icons\/([\w-]+)\.mjs';$/gm;
  for (const match of fs.readFileSync(index, "utf8").matchAll(line)) {
    for (const part of match[1].split(",")) {
      const name = /^\s*default as (\w+)\s*$/.exec(part)?.[1];
      if (name) files.set(name, match[2]);
    }
  }
  if (files.size < 1000) throw new Error(`${PACKAGE}: no se han encontrado los iconos en ${index} (¿ha cambiado el formato?).`);
  return files;
}

let iconFiles = null;

module.exports = function lucideDirectImports({ types: t }) {
  return {
    name: "lucide-direct-imports",
    visitor: {
      ImportDeclaration(declaration) {
        const { node } = declaration;
        if (node.source.value !== PACKAGE || node.importKind === "type") return;
        iconFiles ??= readIconFiles();

        const direct = [];
        const kept = [];
        for (const specifier of node.specifiers) {
          const imported = specifier.type === "ImportSpecifier" ? (specifier.imported.name ?? specifier.imported.value) : null;
          const file = imported && specifier.importKind !== "type" ? iconFiles.get(imported) : undefined;
          if (file) {
            direct.push(t.importDeclaration([t.importDefaultSpecifier(t.identifier(specifier.local.name))], t.stringLiteral(`${PACKAGE}/icons/${file}`)));
          } else {
            kept.push(specifier);
          }
        }
        if (direct.length === 0) return;

        // Si solo quedan tipos (o nada), el import original sobra: dejarlo cargaría otra vez el índice entero.
        const keepsValues = kept.some((specifier) => specifier.importKind !== "type");
        if (keepsValues) {
          node.specifiers = kept;
          declaration.insertAfter(direct);
        } else {
          declaration.replaceWithMultiple(direct);
        }
      },
    },
  };
};
