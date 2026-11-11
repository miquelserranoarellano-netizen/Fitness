import { beforeEach, describe, expect, it } from "vitest";
import { openTestDb } from "@/db/node";
import type { Db } from "@/db/types";
import { saveFoodEntries } from "@/integrations/nutrition/store";
import { addDays, today, weekStart } from "@/lib/dates";
import { getActiveBlock } from "./blocks";
import { setSteps, setWater } from "./daily";
import { exportAllData, TABLES } from "./export";
import { addFavorite } from "./favorites";
import { importAllData, parseExport } from "./import";
import { getProfile, isOnboarded } from "./profile";
import { addLimitation, completeOnboarding, logWeight, submitCheckin } from "./services";
import { finishSession, getSession, logSet, startSession } from "./sessions";
import { getSettings, updateSettings } from "./settings";
import { onboardingInput } from "./testing";

type Rows = Record<string, unknown>[];
type Exported = Record<string, unknown>;

const rice = { name: "Arroz blanco", grams: 200, calories: 260, proteinG: 5, carbsG: 57, fatG: 1, fiberG: 0.8, dataSource: "usda" as const, confidence: 0.9 };
const photo = "file:///datos/meal-photos/1.jpg";

/** Un poco de todo: cada tabla de la exportación acaba con al menos una fila. */
async function fillWithData(db: Db): Promise<void> {
  const now = new Date().toISOString();
  expect((await completeOnboarding(db, onboardingInput())).ok).toBe(true);
  await addLimitation(db, { kind: "injury", bodyArea: "knee", severity: "moderate", description: "Rodilla" });
  await logWeight(db, { date: addDays(today(), -1), kg: 68.4 });

  const block = (await getActiveBlock(db))!;
  const sessionId = await startSession(db, block.days[0]!.id);
  const session = (await getSession(db, sessionId))!;
  await logSet(db, { sessionExerciseId: session.exercises[0]!.id, setNumber: 1, weightKg: 42.5, reps: 9, rir: 1, restSeconds: 120 });
  expect(await finishSession(db, sessionId, { energy: 4, notes: "Buena sesión" })).toBe(true);

  const checkin = await submitCheckin(db, {
    weekStart: weekStart(today()),
    workoutsCompleted: 1,
    nutritionAdherence: 2,
    sleepQuality: 2,
    energy: 2,
    appetite: 3,
    performance: 3,
    pain: true,
    painNotes: "Hombro",
    improvedExercises: "",
    difficulties: "Dormir",
    weightKg: 68.4,
  });
  expect(checkin.ok).toBe(true);
  await db.run("insert into monthly_reports (id, period_start, period_end, report, created_at) values ('m1', ?, ?, ?, ?)", [addDays(today(), -30), today(), '{"summary":["Un mes"]}', now]);
  // Un JSON `null` en una columna obligatoria tiene que volver a ser "null", no NULL.
  await db.run("insert into recommendations (id, source, area, title, detail, evidence, created_at) values ('r1', 'rules', 'tracking', 'Pésate', 'Una vez a la semana', 'null', ?)", [now]);

  await saveFoodEntries(db, "foto", [{ eatenAt: now, date: today(), name: "Arroz", calories: 260, proteinG: 5, notes: "Con aceite", photoUri: photo, items: [rice] }]);
  expect((await addFavorite(db, { name: "Arroz", calories: 260, items: [rice], photoUri: photo })).ok).toBe(true);
  await setWater(db, today(), 750);
  await setSteps(db, today(), 7000, "manual");
  await db.run("insert into progress_photos (id, taken_on, pose, file_name, width, height, created_at) values ('p1', ?, 'front', 'p1.jpg', 1200, 1600, ?)", [today(), now]);
}

/** Lo que cambia de una exportación a otra sin que cambien los datos. */
function comparable(data: Exported): Exported {
  const { exportado_el: _ignored, ...rest } = data;
  return rest;
}

/** La exportación tal como queda tras importarla: sin fotografías. */
function withoutPhotos(data: Exported): Exported {
  const clear = (rows: unknown) => (rows as Rows).map((row) => ({ ...row, photo_uri: null }));
  return { ...data, progress_photos: [], food_entries: clear(data.food_entries), favorite_meals: clear(data.favorite_meals) };
}

const count = async (db: Db, table: string) => (await db.get<{ n: number }>(`select count(*) as n from ${table}`))?.n ?? 0;

let source: Db;
let exported: Exported;

beforeEach(async () => {
  source = await openTestDb();
  await fillWithData(source);
  exported = await exportAllData(source);
});

describe("importar una copia", () => {
  it("exportar, importar en una base vacía y volver a exportar da lo mismo (salvo las fotos)", async () => {
    for (const { name } of TABLES) expect((exported[name] as Rows).length, name).toBeGreaterThan(0);

    const target = await openTestDb();
    const result = await importAllData(target, JSON.stringify(exported, null, 2));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ version: 2, profileName: "Miquel", photosLeftOut: 3 });
      expect(result.data.counts).toMatchObject({ workout_sessions: 1, food_entries: 1, progress_photos: 0 });
    }

    expect(comparable(await exportAllData(target))).toEqual(comparable(withoutPhotos(exported)));
    expect(await isOnboarded(target)).toBe(true);
    expect((await getActiveBlock(target))?.days.length).toBe(5);
    expect(await count(target, "progress_photos")).toBe(0);
  });

  it("sustituye lo que había y conserva los ajustes del dispositivo", async () => {
    const target = await openTestDb();
    await completeOnboarding(target, { ...onboardingInput(), displayName: "Otra persona", weightKg: 90 });
    await updateSettings(target, { stepGoal: 8000 });

    expect((await importAllData(target, exported)).ok).toBe(true);
    expect((await getProfile(target))?.displayName).toBe("Miquel");
    expect(comparable(await exportAllData(target))).toEqual(comparable(withoutPhotos(exported)));
    expect((await getSettings(target)).stepGoal).toBe(8000);
  });

  it("enseña lo que trae la copia antes de importarla", () => {
    const parsed = parseExport(JSON.stringify(exported));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.exportedAt).toBe(exported.exportado_el);
    expect(parsed.data.counts).toMatchObject({ body_weights: 2, water_logs: 1, step_logs: 1 });
  });

  it("acepta el formato 1 e ignora tablas y columnas desconocidas", async () => {
    const v2Columns = ["fiber_g", "sugar_g", "sodium_mg", "calories_min", "calories_max", "notes", "updated_at"];
    const drop = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
    const { food_entry_items: _items, favorite_meals: _favorites, water_logs: _water, step_logs: _steps, ...v1Tables } = exported;
    const v1 = {
      ...v1Tables,
      formato: "smart-fitness-coach/exportacion@1",
      profiles: (exported.profiles as Rows).map((row) => ({ ...drop(row, ["target_weight_kg", "macro_style"]), user_id: "u1" })),
      food_entries: (exported.food_entries as Rows).map((row) => drop(row, v2Columns)),
      otra_tabla: [{ id: 1 }],
    };

    const target = await openTestDb();
    const result = await importAllData(target, v1);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.version).toBe(1);
    expect((await getProfile(target))?.macroStyle).toBe("standard");
    const meal = await target.get<{ name: string; notes: string | null }>("select name, notes from food_entries");
    expect(meal).toEqual({ name: "Arroz", notes: null });
    for (const table of ["food_entry_items", "favorite_meals", "water_logs", "step_logs"]) expect(await count(target, table)).toBe(0);
  });

  it("un archivo que no es una copia válida no toca nada", async () => {
    const before = comparable(await exportAllData(source));
    const { workout_sets: _sets, ...incomplete } = exported;
    const rows = (table: string) => exported[table] as Rows;
    const bad: unknown[] = [
      "{ esto no es JSON",
      "[]",
      JSON.stringify({ formato: "otra-app/copia@1" }),
      { ...exported, formato: "appcombinada/exportacion@3" },
      incomplete,
      { ...exported, body_weights: "muchos" },
      { ...exported, profiles: [] },
      // Pasa la validación del documento pero no el esquema: falla dentro de la transacción, ya con el
      // borrado hecho, y se deshace todo.
      { ...exported, body_weights: [...rows("body_weights"), { ...rows("body_weights")[0], id: "w9", measured_on: "2020-01-01", weight_kg: 5 }] },
      { ...exported, workout_sets: rows("workout_sets").map((row) => ({ ...row, session_exercise_id: "no-existe" })) },
      { ...exported, limitations: rows("limitations").map((row) => ({ ...row, description: { texto: "objeto" } })) },
      { ...exported, water_logs: [{ desconocida: 1 }] },
    ];
    for (const input of bad) {
      const result = await importAllData(source, input);
      expect(result.ok, JSON.stringify(input).slice(0, 80)).toBe(false);
    }
    expect(comparable(await exportAllData(source))).toEqual(before);

    const outOfRange = await importAllData(source, bad[7]);
    expect(!outOfRange.ok && outOfRange.error).toContain("body_weights");
    const newer = await importAllData(source, bad[3]);
    expect(!newer.ok && newer.error).toContain("versión más nueva");
  });
});
