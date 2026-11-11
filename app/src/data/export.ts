import type { Queryable } from "@/db/types";

/**
 * Exportación de todos los datos en un único documento JSON, tabla a tabla con los mismos nombres de
 * columna que la base de datos (las de la web, sin `user_id`, más las de nutrición de la fusión con
 * SnapCal). Sirve de copia de seguridad y para importarlos después (`import.ts`). Las fotografías se
 * incluyen solo como metadatos (rutas), no las imágenes.
 *
 * Formato 2 (`appcombinada/exportacion@2`): el 1 era el de la app de partida, sin las tablas de
 * alimentos, favoritas, agua y pasos.
 */

export const EXPORT_FORMAT = "appcombinada/exportacion@2";

/** Tablas exportadas, padres antes que hijas (el orden en que se vuelven a insertar al importar). */
export const TABLES: { name: string; order: string }[] = [
  { name: "profiles", order: "id" },
  { name: "limitations", order: "created_at" },
  { name: "body_weights", order: "measured_on" },
  { name: "body_measurements", order: "measured_on" },
  { name: "progress_photos", order: "taken_on" },
  { name: "training_blocks", order: "number" },
  { name: "plan_days", order: "block_id, position" },
  { name: "plan_exercises", order: "plan_day_id, position" },
  { name: "workout_sessions", order: "started_at" },
  { name: "session_exercises", order: "session_id, position" },
  { name: "workout_sets", order: "completed_at" },
  { name: "nutrition_targets", order: "created_at" },
  { name: "food_entries", order: "eaten_at" },
  { name: "food_entry_items", order: "food_entry_id, position" },
  { name: "favorite_meals", order: "created_at" },
  { name: "water_logs", order: "logged_on" },
  { name: "step_logs", order: "logged_on" },
  { name: "weekly_checkins", order: "week_start" },
  { name: "monthly_reports", order: "period_start" },
  { name: "recommendations", order: "created_at" },
];

/** Columnas que guardan JSON como texto: en la exportación se devuelven ya como objetos. */
export const JSON_COLUMNS: ReadonlySet<string> = new Set([
  "secondary_goals",
  "priority_muscles",
  "favorite_exercises",
  "disliked_exercises",
  "strength_marks",
  "weak_muscles",
  "training_weekdays",
  "equipment",
  "allergies",
  "rationale",
  "evaluation",
  "method",
  "report",
  "evidence",
  "items",
]);

export async function exportAllData(db: Queryable): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    formato: EXPORT_FORMAT,
    exportado_el: new Date().toISOString(),
    unidades: "Pesos en kilogramos, longitudes en centímetros, agua en mililitros y sodio en miligramos.",
    nota: "Mismas tablas y columnas que la base de datos de la app, sin user_id (los datos son de un único usuario).",
  };
  for (const table of TABLES) {
    const rows = await db.all<Record<string, unknown>>(`select * from ${table.name} order by ${table.order}`);
    out[table.name] = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
          if (typeof value === "string" && JSON_COLUMNS.has(key)) {
            try {
              return [key, JSON.parse(value)];
            } catch {
              return [key, value];
            }
          }
          return [key, value];
        }),
      ),
    );
  }
  return out;
}
