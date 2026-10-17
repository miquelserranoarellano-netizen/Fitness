const ACCENTS: Record<string, string> = { á: "a", à: "a", ä: "a", é: "e", è: "e", ë: "e", í: "i", ì: "i", ï: "i", ó: "o", ò: "o", ö: "o", ú: "u", ù: "u", ü: "u", ñ: "n", ç: "c" };

/** Minúsculas y sin tildes, para buscar sin que importen los acentos. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[áàäéèëíìïóòöúùüñç]/g, (char) => ACCENTS[char] ?? char);
}
