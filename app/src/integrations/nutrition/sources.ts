import type { NutritionSource } from "./contract";

/**
 * Fuentes EXTERNAS de comidas. Vacía: con la fusión, las pantallas de SnapCal (foto, texto, código de
 * barras, favoritas) forman parte de esta app y guardan directamente con `saveFoodEntries`. Queda por
 * si en el futuro otra app manda sus comidas.
 */
export const NUTRITION_SOURCES: NutritionSource[] = [];

export function connectedSources(): NutritionSource[] {
  return NUTRITION_SOURCES;
}
