/**
 * Traducciones. El texto en español es a la vez el texto original y la clave:
 *
 *   t("Objetivo diario")
 *   t("Objetivo recalculado: unas {kcal} kcal al día.", { kcal: 2650 })
 *   tn(series, "{n} serie", "{n} series")
 *
 * Cada catálogo (`catalogs/en.ts`, …) traduce esas frases; lo que falta se muestra en español. Los
 * textos que se definen fuera de un componente (constantes, etiquetas) se marcan con `msg()` y se
 * traducen al mostrarlos con `t(CONSTANTE)`.
 *
 * El idioma activo es global: lo fija `src/lib/preferences.tsx` al arrancar y al cambiarlo en el
 * perfil, y en ese momento se vuelve a montar la navegación para que todo se redibuje. Por eso
 * `t()` funciona también fuera de React (formato de fechas, mensajes de error).
 *
 * Este módulo no depende de React Native: lo usan también las pruebas.
 */

export type Language = "es" | "en" | "fr" | "de";
export type LanguagePreference = "system" | Language;
export type Params = Record<string, string | number>;
type Catalog = Readonly<Record<string, string>>;

/** Nombre de cada idioma en su propio idioma, para el selector. */
export const LANGUAGE_NAMES: Record<Language, string> = { es: "Español", en: "English", fr: "Français", de: "Deutsch" };

const LOCALE_TAGS: Record<Language, string> = { es: "es-ES", en: "en-GB", fr: "fr-FR", de: "de-DE" };

/**
 * Catálogos de traducción. Vacío a propósito hasta la fase 10 de la fusión (traducción a EN, FR y DE):
 * hasta entonces solo se ofrece el español, para no mostrar una app a medio traducir.
 */
const CATALOGS: Partial<Record<Exclude<Language, "es">, Catalog>> = {};

/** Idiomas que se pueden elegir: el español y los que tengan catálogo. */
export const AVAILABLE_LANGUAGES: Language[] = ["es", ...(Object.keys(CATALOGS) as Language[])];

let current: Language = "es";

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  current = AVAILABLE_LANGUAGES.includes(language) ? language : "es";
}

/** Etiqueta BCP 47 del idioma activo para `toLocaleString` («es-ES», «en-GB»…). */
export function localeTag(language: Language = current): string {
  return LOCALE_TAGS[language];
}

/**
 * Idioma efectivo: el elegido o, en «sistema», el primero de los del teléfono que esté disponible.
 * Si ninguno lo está, español.
 */
export function resolveLanguage(preference: LanguagePreference, deviceLanguages: readonly string[]): Language {
  if (preference !== "system") return AVAILABLE_LANGUAGES.includes(preference) ? preference : "es";
  for (const code of deviceLanguages) {
    const base = code.toLowerCase().slice(0, 2) as Language;
    if (AVAILABLE_LANGUAGES.includes(base)) return base;
  }
  return "es";
}

function interpolate(text: string, params: Params): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/** Traduce un texto en español al idioma activo y sustituye los `{parámetros}`. */
export function t(text: string, params?: Params): string {
  const translated = current === "es" ? text : (CATALOGS[current]?.[text] ?? text);
  return params ? interpolate(translated, params) : translated;
}

/** ¿Usa la forma singular este número? En francés, 0 y 1 son singulares; en el resto, solo 1. */
export function isSingular(count: number, language: Language = current): boolean {
  return language === "fr" ? Math.abs(count) < 2 : count === 1;
}

/**
 * Singular o plural según el número. `{n}` se sustituye por el número con el formato del idioma.
 *   tn(3, "{n} serie", "{n} series") → «3 series»
 */
export function tn(count: number, singular: string, plural: string, params?: Params): string {
  return t(isSingular(count) ? singular : plural, { n: count.toLocaleString(localeTag()), ...params });
}

/** Marca un texto para traducirlo más tarde con `t()` (constantes definidas fuera de un componente). */
export function msg<T extends string>(text: T): T {
  return text;
}
