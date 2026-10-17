import { getLanguage, t, tn, type Language } from "@/i18n";

/**
 * Fechas de calendario como cadenas `AAAA-MM-DD`.
 * Se opera siempre en UTC para que ningún cambio de hora desplace un día.
 *
 * Diferencia con la web: allí «hoy» se calculaba en el servidor con la zona de Madrid. En la app,
 * «hoy» es el día del propio teléfono, y los textos se forman sin `Intl` para que salgan igual en
 * Android e iOS, en el idioma activo.
 */

const DAY_MS = 86_400_000;

type Names = { months: string[]; monthsShort: string[]; weekdays: string[] };

/** Nombres de meses y días (los días empiezan en domingo, como `getUTCDay`). */
const NAMES: Record<Language, Names> = {
  es: {
    months: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    monthsShort: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"],
    weekdays: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  },
  en: {
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  fr: {
    months: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    monthsShort: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
    weekdays: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  },
  de: {
    months: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    monthsShort: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
    weekdays: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  },
};

function toUtc(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const pad = (value: number) => String(value).padStart(2, "0");

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
}

/** Fecha de hoy según el reloj y la zona horaria del teléfono. */
export function today(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Convierte un instante en su fecha de calendario en la zona horaria del teléfono. */
export function dateOf(instant: Date | string): string {
  return today(typeof instant === "string" ? new Date(instant) : instant);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(date: string): number {
  const day = new Date(toUtc(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Lunes de la semana a la que pertenece la fecha. */
export function weekStart(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

function parts(date: string) {
  const value = new Date(toUtc(date));
  return { day: value.getUTCDate(), month: value.getUTCMonth(), year: value.getUTCFullYear(), weekday: value.getUTCDay() };
}

/** «15 de octubre de 2026» · «15 October 2026» · «15 octobre 2026» · «15. Oktober 2026» */
export function formatDate(date: string): string {
  const { day, month, year } = parts(date);
  const language = getLanguage();
  const name = NAMES[language].months[month];
  if (language === "es") return `${day} de ${name} de ${year}`;
  if (language === "de") return `${day}. ${name} ${year}`;
  return `${day} ${name} ${year}`;
}

/** «15 oct» · «15 Oct» · «15 oct.» · «15. Okt.» */
export function formatShortDate(date: string): string {
  const { day, month } = parts(date);
  const language = getLanguage();
  const name = NAMES[language].monthsShort[month];
  return language === "de" ? `${day}. ${name}` : `${day} ${name}`;
}

/** «miércoles, 15 de octubre» · «Wednesday, 15 October» · «mercredi 15 octobre» · «Mittwoch, 15. Oktober» */
export function formatWeekdayDate(date: string): string {
  const { day, month, weekday } = parts(date);
  const language = getLanguage();
  const { months, weekdays } = NAMES[language];
  if (language === "es") return `${weekdays[weekday]}, ${day} de ${months[month]}`;
  if (language === "fr") return `${weekdays[weekday]} ${day} ${months[month]}`;
  if (language === "de") return `${weekdays[weekday]}, ${day}. ${months[month]}`;
  return `${weekdays[weekday]}, ${day} ${months[month]}`;
}

/** «hoy», «ayer», «hace 3 días», «hace 2 semanas»… */
export function relativeDay(date: string, reference: string): string {
  const diff = daysBetween(date, reference);
  if (diff === 0) return t("hoy");
  if (diff === 1) return t("ayer");
  if (diff < 0) return formatShortDate(date);
  if (diff < 14) return tn(diff, "hace {n} día", "hace {n} días");
  if (diff < 60) return tn(Math.round(diff / 7), "hace {n} semana", "hace {n} semanas");
  return tn(Math.round(diff / 30), "hace {n} mes", "hace {n} meses");
}

/** Hora local «HH:mm» de un instante. */
export function formatTime(instant: string): string {
  const value = new Date(instant);
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
