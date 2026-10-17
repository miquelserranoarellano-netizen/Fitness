import { describe, expect, it } from "vitest";
import { EXERCISES, requireExercise } from "../exercises";
import { EQUIPMENT, LEVELS, MUSCLES, type Muscle } from "../types";
import { chooseSplit, generatePlan, weeklyVolume, type PlanInput } from "./plan";

const base: PlanInput = {
  level: "beginner",
  goal: "muscle_gain",
  strengthFocus: false,
  daysPerWeek: 4,
  sessionMinutes: 60,
  priorityMuscles: [],
  equipment: [...EQUIPMENT],
  limitations: [],
  disliked: [],
  favorites: [],
};

describe("catálogo de ejercicios", () => {
  it("tiene identificadores únicos y alternativas que existen", () => {
    const ids = EXERCISES.map((exercise) => exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const exercise of EXERCISES) {
      expect(exercise.steps.length, exercise.id).toBeGreaterThanOrEqual(3);
      expect(exercise.mistakes.length, exercise.id).toBeGreaterThanOrEqual(2);
      expect(exercise.cues.length, exercise.id).toBeGreaterThanOrEqual(2);
      expect(exercise.alternatives.length, exercise.id).toBeGreaterThanOrEqual(1);
      for (const alternative of exercise.alternatives) expect(ids, `${exercise.id} → ${alternative}`).toContain(alternative);
      expect(exercise.alternatives).not.toContain(exercise.id);
    }
  });
});

describe("chooseSplit", () => {
  it("elige la distribución según los días disponibles", () => {
    const pick = (daysPerWeek: number, priorityMuscles: Muscle[] = []) =>
      chooseSplit({ daysPerWeek, level: "intermediate", priorityMuscles }).split;
    expect(pick(2)).toBe("full_body_2");
    expect(pick(3)).toBe("full_body_3");
    expect(pick(4)).toBe("upper_lower_4");
    expect(pick(5)).toBe("ulppl_5");
    expect(pick(5, ["biceps", "triceps"])).toBe("upper_lower_arms_5");
    expect(pick(6)).toBe("ppl_6");
  });
});

describe("generatePlan", () => {
  it("genera rutinas válidas para cualquier combinación de días, nivel y tiempo", () => {
    for (const level of LEVELS) {
      for (const daysPerWeek of [2, 3, 4, 5, 6]) {
        for (const sessionMinutes of [30, 45, 60, 90, 120]) {
          const label = `${level} · ${daysPerWeek} días · ${sessionMinutes} min`;
          const plan = generatePlan({ ...base, level, daysPerWeek, sessionMinutes });
          expect(plan.days, label).toHaveLength(daysPerWeek);
          for (const day of plan.days) {
            expect(day.exercises.length, label).toBeGreaterThanOrEqual(3);
            expect(day.estimatedMinutes, `${label} · ${day.name}`).toBeLessThanOrEqual(sessionMinutes + 3);
            const ids = day.exercises.map((exercise) => exercise.exerciseId);
            expect(new Set(ids).size, `${label}: ejercicio repetido en ${day.name}`).toBe(ids.length);
            for (const exercise of day.exercises) {
              requireExercise(exercise.exerciseId);
              expect(exercise.sets).toBeGreaterThanOrEqual(2);
              expect(exercise.sets).toBeLessThanOrEqual(5);
              expect(exercise.repMin).toBeLessThanOrEqual(exercise.repMax);
              expect(exercise.rirMin).toBeLessThanOrEqual(exercise.rirMax);
            }
          }
        }
      }
    }
  });

  it("es determinista", () => {
    const input = { ...base, priorityMuscles: ["biceps", "quads"] as Muscle[] };
    expect(generatePlan(input)).toEqual(generatePlan(input));
  });

  it("no supera el volumen máximo semanal de ningún músculo", () => {
    const plan = generatePlan({ ...base, level: "intermediate", daysPerWeek: 6, sessionMinutes: 120 });
    for (const muscle of MUSCLES) {
      expect(plan.weeklyVolume[muscle], muscle).toBeLessThanOrEqual(plan.volumeTargets[muscle].max + 0.5);
    }
  });

  it("da más volumen a los músculos prioritarios", () => {
    const normal = generatePlan({ ...base, level: "intermediate", sessionMinutes: 75 });
    const arms = generatePlan({ ...base, level: "intermediate", sessionMinutes: 75, priorityMuscles: ["biceps", "triceps"] });
    expect(arms.weeklyVolume.biceps).toBeGreaterThan(normal.weeklyVolume.biceps);
    expect(arms.weeklyVolume.triceps).toBeGreaterThan(normal.weeklyVolume.triceps);
  });

  it("el volumen declarado coincide con los ejercicios del plan", () => {
    const plan = generatePlan({ ...base, daysPerWeek: 5, priorityMuscles: ["biceps", "triceps", "quads"] });
    const recomputed = weeklyVolume(plan.days.flatMap((day) => day.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets }))));
    expect(plan.weeklyVolume).toEqual(recomputed);
  });

  it("respeta el material disponible", () => {
    const plan = generatePlan({ ...base, equipment: ["dumbbells", "bench"] });
    for (const day of plan.days) {
      for (const planned of day.exercises) {
        const exercise = requireExercise(planned.exerciseId);
        expect(exercise.equipment.every((item) => item === "dumbbells" || item === "bench"), exercise.id).toBe(true);
      }
    }
  });

  it("evita los ejercicios que cargan una zona con limitación moderada o importante", () => {
    const plan = generatePlan({ ...base, limitations: [{ area: "lower_back", severity: "moderate" }] });
    for (const day of plan.days) {
      for (const planned of day.exercises) {
        expect(requireExercise(planned.exerciseId).stress, planned.exerciseId).not.toContain("lower_back");
      }
    }
    expect(plan.rationale.some((item) => item.title === "Limitaciones físicas")).toBe(true);
  });

  it("mantiene los ejercicios con aviso cuando la limitación es leve", () => {
    const plan = generatePlan({ ...base, limitations: [{ area: "shoulder", severity: "mild" }] });
    const noted = plan.days.flatMap((day) => day.exercises).filter((exercise) => exercise.note !== null);
    for (const exercise of noted) expect(requireExercise(exercise.exerciseId).stress).toContain("shoulder");
  });

  it("no incluye los ejercicios que el usuario quiere evitar y prefiere sus favoritos", () => {
    const plan = generatePlan({ ...base, level: "intermediate", disliked: ["bench_press"], favorites: ["machine_chest_press"] });
    const ids = plan.days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseId));
    expect(ids).not.toContain("bench_press");
    expect(ids).toContain("machine_chest_press");
  });

  it("propone a un principiante ejercicios técnicamente sencillos", () => {
    const plan = generatePlan(base);
    const ids = plan.days.flatMap((day) => day.exercises.map((exercise) => exercise.exerciseId));
    expect(ids).not.toContain("back_squat");
    expect(ids).not.toContain("barbell_row");
  });
});
