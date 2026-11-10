// Genera un código de acceso para una persona: `npm run new-code -- marc` imprime `marc:XXXXXXXX…`.
// Añade esa línea a ACCESS_CODES (separada por comas) y pásale a esa persona solo la parte de después de «:».
import { randomBytes } from "node:crypto";

const name = (process.argv[2] ?? "").trim();
if (!/^[\p{L}\p{N}_.-]{1,40}$/u.test(name)) {
  console.error("Uso: npm run new-code -- nombre   (letras, números, «.», «_» o «-»)");
  process.exit(1);
}
// 18 bytes al azar = 24 caracteres sin «:» ni «,», que separan las entradas de ACCESS_CODES.
console.log(`${name}:${randomBytes(18).toString("base64url")}`);
