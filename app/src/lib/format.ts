import { getLanguage, type Language } from "@/i18n";

/** «8-12» o «10» si ambos extremos coinciden. */
export function formatRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}-${max}`;
}

/** Segundos como «1:30». */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Descanso legible: «2 min», «1 min 15 s», «45 s». */
export function formatRest(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} s`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Plural en castellano para los textos que aún forman el motor y la capa de datos (se traducirán en la
 * fase 10). En las pantallas se usa `tn()` de `@/i18n`.
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const AND: Record<Language, string> = { es: "y", en: "and", fr: "et", de: "und" };

/** Une una lista en el idioma activo: «a, b y c» (en castellano, con «e» ante i-/hi-). */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  const last = items[items.length - 1]!;
  const language = getLanguage();
  const and = language === "es" && /^h?i/i.test(last) ? "e" : AND[language];
  return `${items.slice(0, -1).join(", ")} ${and} ${last}`;
}
