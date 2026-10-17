import type { Units } from "@/domain/types";
import { localeTag } from "@/i18n";

/**
 * La base de datos guarda siempre kilogramos y centímetros. Aquí se convierte solo para mostrar y
 * para leer lo que escribe el usuario según sus unidades preferidas.
 */

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export const weightUnit = (units: Units) => (units === "imperial" ? "lb" : "kg");
export const lengthUnit = (units: Units) => (units === "imperial" ? "in" : "cm");

export function toDisplayWeight(kg: number, units: Units): number {
  return units === "imperial" ? kg / KG_PER_LB : kg;
}

export function fromDisplayWeight(value: number, units: Units): number {
  return units === "imperial" ? value * KG_PER_LB : value;
}

export function toDisplayLength(cm: number, units: Units): number {
  return units === "imperial" ? cm / CM_PER_IN : cm;
}

export function fromDisplayLength(value: number, units: Units): number {
  return units === "imperial" ? value * CM_PER_IN : value;
}

/** Salto de carga en las unidades del usuario (los discos en libras van de 2,5 en 2,5). */
export function displayLoadStep(stepKg: number, units: Units): number {
  if (units === "metric") return stepKg;
  return Math.max(2.5, Math.round((stepKg / KG_PER_LB) / 2.5) * 2.5);
}

export function formatNumber(value: number, maxDigits = 1, minDigits = 0): string {
  return value.toLocaleString(localeTag(), { maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits });
}

export function formatSigned(value: number, maxDigits = 1): string {
  const rounded = Number(value.toFixed(maxDigits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(rounded), maxDigits)}`;
}

export function formatWeight(kg: number, units: Units, digits = 1): string {
  return `${formatNumber(toDisplayWeight(kg, units), digits)} ${weightUnit(units)}`;
}

export function formatLength(cm: number, units: Units, digits = 1): string {
  return `${formatNumber(toDisplayLength(cm, units), digits)} ${lengthUnit(units)}`;
}

/** Redondea para mostrar una carga en un campo de entrada sin decimales espurios. */
export function roundDisplay(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Interpreta un número escrito con coma o punto decimal. Devuelve null si no es válido. */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "" || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
