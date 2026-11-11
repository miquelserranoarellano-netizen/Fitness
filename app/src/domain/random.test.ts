import { describe, expect, it } from "vitest";
import { EXERCISES, requireExercise } from "./exercises";
import { calorieFloor, estimateNutrition, type NutritionInput } from "./nutrition/targets";
import { generatePlan, type PlanInput } from "./training/plan";
import { APPETITE, BODY_AREAS, EQUIPMENT, GOALS, JOB_ACTIVITY, LEVELS, MACRO_STYLES, MUSCLES, SEVERITIES, SEXES } from "./types";

/**
 * Pruebas con muchos perfiles al azar, dentro de lo que el cuestionario deja introducir. Buscan las
 * combinaciones raras que nadie escribe a mano (solo un banco, tres lesiones y casi todos los ejercicios
 * vetados…). El azar sale de una semilla fija: si algo falla, falla siempre igual y el mensaje trae el
 * perfil exacto para repetirlo.
 */

function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(values: readonly T[]): T => values[int(0, values.length - 1)] as T;
  const some = <T,>(values: readonly T[], min: number, max: number): T[] => {
    const pool = [...values];
    const out: T[] = [];
    const count = Math.min(pool.length, int(min, max));
    for (let i = 0; i < count; i++) out.push(...pool.splice(int(0, pool.length - 1), 1));
    return out;
  };
  return { next, int, pick, some };
}

const EXERCISE_IDS = EXERCISES.map((exercise) => exercise.id);

describe("rutinas con perfiles al azar", () => {
  it("cualquier perfil que acepta el cuestionario da una rutina que se puede entrenar", () => {
    const random = generator(20261110);
    for (let i = 0; i < 2500; i++) {
      const input: PlanInput = {
        level: random.pick(LEVELS),
        goal: random.pick(GOALS),
        strengthFocus: random.next() < 0.3,
        daysPerWeek: random.int(2, 6),
        sessionMinutes: random.int(30, 150),
        priorityMuscles: random.some(MUSCLES, 0, random.next() < 0.1 ? 11 : 3),
        equipment: random.some(EQUIPMENT, 1, EQUIPMENT.length),
        limitations: random.some(BODY_AREAS, 0, 3).map((area) => ({ area, severity: random.pick(SEVERITIES) })),
        disliked: random.some(EXERCISE_IDS, 0, random.next() < 0.1 ? 30 : 4),
        favorites: random.some(EXERCISE_IDS, 0, 4),
        volumeAdjust: random.next() < 0.3 ? Object.fromEntries(random.some(MUSCLES, 1, 4).map((muscle) => [muscle, random.int(-4, 4)])) : undefined,
      };
      const label = `caso ${i}: ${JSON.stringify(input)}`;

      const plan = generatePlan(input);
      expect(plan.days, label).toHaveLength(input.daysPerWeek);
      const blocked = new Set(input.limitations.filter((limitation) => limitation.severity !== "mild").map((limitation) => limitation.area));
      for (const day of plan.days) {
        // Con muy poco material (solo un banco, por ejemplo) un día puede quedarse vacío: el motor lo avisa
        // y la capa de datos no guarda esa rutina (`UnusablePlanError`, probado en `data/plan-guard.test.ts`).
        if (day.exercises.length === 0) expect(plan.warnings.length, `${label} · ${day.name}: día vacío sin aviso`).toBeGreaterThan(0);
        expect(Number.isFinite(day.estimatedMinutes) && day.estimatedMinutes > 0, `${label} · ${day.name}: duración`).toBe(true);
        const ids = day.exercises.map((exercise) => exercise.exerciseId);
        expect(new Set(ids).size, `${label} · ${day.name}: ejercicio repetido`).toBe(ids.length);
        for (const planned of day.exercises) {
          const exercise = requireExercise(planned.exerciseId);
          expect(exercise.equipment.every((item) => input.equipment.includes(item)), `${label}: ${exercise.id} pide material que no hay`).toBe(true);
          expect(input.disliked, `${label}: ${exercise.id} estaba vetado`).not.toContain(exercise.id);
          expect(exercise.stress.some((area) => blocked.has(area)), `${label}: ${exercise.id} carga una zona lesionada`).toBe(false);
          expect(Number.isInteger(planned.sets) && planned.sets >= 1 && planned.sets <= 6, `${label}: ${exercise.id} con ${planned.sets} series`).toBe(true);
          expect(planned.repMin >= 1 && planned.repMin <= planned.repMax && planned.repMax <= 30, `${label}: repeticiones de ${exercise.id}`).toBe(true);
          expect(planned.rirMin >= 0 && planned.rirMin <= planned.rirMax && planned.rirMax <= 5, `${label}: RIR de ${exercise.id}`).toBe(true);
        }
      }
      for (const muscle of MUSCLES) {
        const volume = plan.weeklyVolume[muscle];
        expect(Number.isFinite(volume) && volume >= 0, `${label}: volumen de ${muscle}`).toBe(true);
      }
      expect(plan.rationale.length, label).toBeGreaterThan(0);
      // La misma entrada da siempre la misma rutina.
      if (i % 50 === 0) expect(generatePlan(input), label).toEqual(plan);
    }
  });

  it("la duración estimada no se pasa del tiempo disponible cuando hay material de sobra", () => {
    const random = generator(7);
    for (let i = 0; i < 500; i++) {
      const input: PlanInput = {
        level: random.pick(LEVELS),
        goal: random.pick(GOALS),
        strengthFocus: random.next() < 0.3,
        daysPerWeek: random.int(2, 6),
        sessionMinutes: random.int(30, 150),
        priorityMuscles: random.some(MUSCLES, 0, 3),
        equipment: [...EQUIPMENT],
        limitations: [],
        disliked: [],
        favorites: random.some(EXERCISE_IDS, 0, 3),
      };
      for (const day of generatePlan(input).days) {
        expect(day.estimatedMinutes, `caso ${i}: ${JSON.stringify(input)} · ${day.name}`).toBeLessThanOrEqual(input.sessionMinutes + 3);
      }
    }
  });
});

describe("objetivo nutricional con perfiles al azar", () => {
  it("siempre da cifras razonables, nunca por debajo del mínimo de seguridad", () => {
    const random = generator(42);
    for (let i = 0; i < 5000; i++) {
      const input: NutritionInput = {
        sex: random.pick(SEXES),
        ageYears: random.int(16, 100),
        heightCm: random.int(120, 230),
        weightKg: random.int(30, 250) + random.int(0, 9) / 10,
        jobActivity: random.pick(JOB_ACTIVITY),
        dailySteps: random.next() < 0.3 ? null : random.int(0, 40000),
        trainingDays: random.int(2, 6),
        sessionMinutes: random.int(30, 150),
        goal: random.pick(GOALS),
        level: random.pick(LEVELS),
        appetite: random.pick(APPETITE),
        macroStyle: random.next() < 0.5 ? undefined : random.pick(MACRO_STYLES),
      };
      const label = `caso ${i}: ${JSON.stringify(input)}`;
      const estimate = estimateNutrition(input);

      for (const [name, value] of Object.entries({ bmr: estimate.bmr, maintenance: estimate.maintenance, calories: estimate.calories, proteinG: estimate.proteinG, fatG: estimate.fatG, carbsG: estimate.carbsG })) {
        expect(Number.isFinite(value), `${label}: ${name} = ${value}`).toBe(true);
      }
      expect(estimate.calories, `${label}: por debajo del mínimo`).toBeGreaterThanOrEqual(calorieFloor(input.sex));
      expect(estimate.calories, `${label}: calorías desorbitadas`).toBeLessThanOrEqual(8000);
      expect(estimate.proteinG, `${label}: proteína`).toBeGreaterThan(0);
      expect(estimate.fatG, `${label}: grasa`).toBeGreaterThan(0);
      expect(estimate.carbsG, `${label}: hidratos negativos`).toBeGreaterThanOrEqual(0);
      expect(estimate.maintenanceRange[0], label).toBeLessThanOrEqual(estimate.maintenanceRange[1]);
      // Proteína con sentido para cualquier peso: nunca más de 2,2 g por kilo ni de 350 g.
      expect(estimate.proteinG, `${label}: proteína excesiva`).toBeLessThanOrEqual(Math.min(350, input.weightKg * 2.2 + 5));
      // Los macros suman, más o menos, las calorías del objetivo (los redondeos dejan un margen).
      const fromMacros = estimate.proteinG * 4 + estimate.carbsG * 4 + estimate.fatG * 9;
      expect(Math.abs(fromMacros - estimate.calories), `${label}: los macros suman ${fromMacros} kcal y el objetivo es ${estimate.calories}`).toBeLessThanOrEqual(Math.max(60, estimate.calories * 0.04));
    }
  });
});
