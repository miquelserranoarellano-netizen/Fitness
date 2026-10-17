import { z } from "zod";
import type { Queryable } from "@/db/types";
import { getState, setState } from "./profile";

/**
 * Ajustes de la parte de nutrición y hábitos (de SnapCal): objetivos de pasos y agua, calorías
 * sobrantes y recordatorios de comidas y agua. Se guardan en `app_state`. El tema y el idioma no
 * están aquí: son preferencias de la interfaz (`src/lib/preferences.tsx`).
 */

const KEY = "ajustes";

const minutesOfDay = z.number().int().min(0).max(1439);

export const settingsSchema = z.object({
  /** Pasos diarios objetivo. */
  stepGoal: z.number().int().min(1000).max(50000),
  /** Agua diaria objetivo, en ml. */
  waterGoalMl: z.number().int().min(500).max(6000),
  /** Sumar al día las calorías que sobraron el anterior (máx. 200). Desactivado por defecto. */
  rollover: z.boolean(),
  reminders: z.object({
    meals: z.boolean(),
    /** Desayuno, comida y cena, en minutos desde medianoche. */
    mealTimes: z.tuple([minutesOfDay, minutesOfDay, minutesOfDay]),
    water: z.boolean(),
  }),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  stepGoal: 10000,
  waterGoalMl: 2000,
  rollover: false,
  reminders: { meals: false, mealTimes: [9 * 60, 14 * 60, 21 * 60], water: false },
};

/** Ajustes guardados; lo que falte o no sea válido toma el valor por defecto. */
export async function getSettings(db: Queryable): Promise<AppSettings> {
  const saved = (await getState<Partial<AppSettings>>(db, KEY)) ?? {};
  const merged = { ...DEFAULT_SETTINGS, ...saved, reminders: { ...DEFAULT_SETTINGS.reminders, ...(saved.reminders ?? {}) } };
  const parsed = settingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  // Si algún valor guardado no es válido, se recupera campo a campo.
  const fields = Object.fromEntries(
    (Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]).map((key) => {
      const check = settingsSchema.shape[key].safeParse(merged[key]);
      return [key, check.success ? check.data : DEFAULT_SETTINGS[key]];
    }),
  );
  return fields as AppSettings;
}

export type SettingsResult = { ok: true; data: AppSettings } | { ok: false; error: string };

/** Cambia algunos ajustes y guarda el resultado completo. */
export async function updateSettings(db: Queryable, patch: Partial<AppSettings>): Promise<SettingsResult> {
  const current = await getSettings(db);
  const next = { ...current, ...patch, reminders: { ...current.reminders, ...(patch.reminders ?? {}) } };
  const parsed = settingsSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: "Algún ajuste está fuera de rango." };
  await setState(db, KEY, parsed.data);
  return { ok: true, data: parsed.data };
}
