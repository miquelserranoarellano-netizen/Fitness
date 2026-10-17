import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { muscleStats, type Log } from "./analysis/muscles";
import { analyzeWeakPoints, type WeakPointInput } from "./analysis/weakpoints";
import { measureProgress } from "./body/measurements";
import { buildMonthlyReport } from "./review/monthly";
import { buildWeeklyReport, type CheckinAnswers, type WeeklyInput } from "./review/weekly";
import { nextDayPosition, recentWeeks, sessionsPerWeek, streakWeeks } from "./training/adherence";
import { decideNextBlock } from "./training/next-block";
import { volumeTargets } from "./training/plan";
import { MEASURES, type Measure } from "./types";

const TODAY = "2026-10-09"; // viernes

/** Una sesión por semana de un ejercicio, de la más reciente a la más antigua. */
function weeklyLogs(exerciseId: string, weights: number[], reps = 10, discomfort = 0): Log[] {
  return weights
    .map((weightKg, index) => ({
      exerciseId,
      date: addDays(TODAY, -7 * (weights.length - 1 - index)),
      discomfort,
      sets: [1, 2, 3].map(() => ({ weightKg, reps, rir: 2 })),
    }))
    .reverse();
}

const noMeasures = measureProgress([]);
const targets = volumeTargets("beginner", []);

describe("adherencia", () => {
  it("cuenta sesiones por semana y calcula la racha", () => {
    const counts = sessionsPerWeek(["2026-10-05", "2026-10-07", "2026-09-28", "2026-09-30", "2026-10-01", "2026-09-21", "2026-09-22", "2026-09-24"]);
    expect(counts.get("2026-10-05")).toBe(2);
    // La semana en curso (2 de 3) no suma, pero tampoco rompe la racha de las dos anteriores.
    expect(streakWeeks(counts, 3, TODAY)).toBe(2);
    expect(streakWeeks(counts, 2, TODAY)).toBe(3);
    expect(streakWeeks(new Map(), 3, TODAY)).toBe(0);
    const weeks = recentWeeks(counts, 3, TODAY, 8, "2026-09-21");
    expect(weeks.map((week) => week.completed)).toEqual([3, 3, 2]);
  });

  it("rota los días del plan", () => {
    expect(nextDayPosition(4, null)).toBe(0);
    expect(nextDayPosition(4, 1)).toBe(2);
    expect(nextDayPosition(4, 3)).toBe(0);
  });
});

describe("análisis de puntos débiles", () => {
  const base: Omit<WeakPointInput, "stats"> = {
    targets,
    measures: noMeasures,
    declaredWeak: [],
    priority: [],
    adherence: 0.9,
    poorRecovery: false,
  };

  it("sin registros, todo es información insuficiente", () => {
    const findings = analyzeWeakPoints({ ...base, stats: muscleStats([], TODAY) });
    expect(findings.every((finding) => finding.kind === "insufficient")).toBe(true);
  });

  it("no concluye nada con una percepción o una medida aislada: lo marca como posible área de mejora", () => {
    const measures = measureProgress([{ date: "2026-10-01", values: { ...emptyValues(), arm_flexed: 33 } }]);
    const findings = analyzeWeakPoints({ ...base, measures, declaredWeak: ["biceps"], stats: muscleStats([], TODAY) });
    const biceps = findings.find((finding) => finding.muscle === "biceps")!;
    expect(biceps.kind).toBe("aesthetic");
    expect(biceps.evidence.join(" ")).toContain("Todavía no hay sesiones suficientes");
  });

  it("confirma una debilidad solo cuando un grupo se estanca mientras otros progresan", () => {
    const logs = [...weeklyLogs("ez_curl", [20, 20, 20, 20]), ...weeklyLogs("leg_press", [100, 110, 120, 130])];
    const stats = muscleStats(logs, TODAY);
    expect(stats.biceps.progressPct).toBeCloseTo(0, 5);
    expect(stats.quads.progressPct).toBeGreaterThan(10);

    const findings = analyzeWeakPoints({ ...base, stats });
    expect(findings.find((finding) => finding.muscle === "biceps")?.kind).toBe("confirmed");
    expect(findings.find((finding) => finding.muscle === "quads")?.kind).toBe("strength");
    expect(findings.find((finding) => finding.muscle === "chest")?.kind).toBe("insufficient");
  });

  it("si nada progresa o la adherencia es baja, no culpa a un músculo concreto", () => {
    const stalledEverywhere = muscleStats([...weeklyLogs("ez_curl", [20, 20, 20, 20]), ...weeklyLogs("leg_press", [100, 100, 100, 100])], TODAY);
    expect(analyzeWeakPoints({ ...base, stats: stalledEverywhere }).some((finding) => finding.kind === "confirmed")).toBe(false);

    const mixed = muscleStats([...weeklyLogs("ez_curl", [20, 20, 20, 20]), ...weeklyLogs("leg_press", [100, 110, 120, 130])], TODAY);
    const lowAdherence = analyzeWeakPoints({ ...base, adherence: 0.5, stats: mixed });
    expect(lowAdherence.find((finding) => finding.muscle === "biceps")?.kind).toBe("on_track");
  });

  it("con molestias, la propuesta es resolverlas antes de subir volumen", () => {
    const logs = [...weeklyLogs("ez_curl", [20, 20, 20, 20], 10, 2), ...weeklyLogs("leg_press", [100, 110, 120, 130])];
    const biceps = analyzeWeakPoints({ ...base, stats: muscleStats(logs, TODAY) }).find((finding) => finding.muscle === "biceps")!;
    expect(biceps.kind).toBe("confirmed");
    expect(biceps.proposal).toContain("molestias");
  });
});

describe("siguiente bloque", () => {
  const logs = [...weeklyLogs("ez_curl", [20, 20, 20, 20]), ...weeklyLogs("leg_press", [100, 110, 120, 130])];
  const stats = muscleStats(logs, TODAY);
  const findings = analyzeWeakPoints({ stats, targets, measures: noMeasures, declaredWeak: [], priority: ["biceps"], adherence: 0.9, poorRecovery: false });
  const good = { energy: 4, sleepQuality: 4, performance: 4, pain: false };
  const tired = { energy: 2, sleepQuality: 2, performance: 3, pain: false };

  it("sube el volumen solo del grupo estancado y mantiene el resto", () => {
    const decision = decideNextBlock({ findings, stats, priority: ["biceps"], previousAdjust: {}, adherence: 0.9, checkins: [good, good, good] });
    expect(decision.volumeAdjust).toEqual({ biceps: 2 });
    expect(decision.deload).toBe(false);
    expect(decision.avoidExercises).toEqual([]);
  });

  it("no sube volumen con mala adherencia ni con fatiga acumulada", () => {
    expect(decideNextBlock({ findings, stats, priority: [], previousAdjust: {}, adherence: 0.5, checkins: [good] }).volumeAdjust).toEqual({});
    const tiredDecision = decideNextBlock({ findings, stats, priority: [], previousAdjust: { biceps: 2 }, adherence: 0.9, checkins: [tired, tired, good] });
    expect(tiredDecision.deload).toBe(true);
    expect(tiredDecision.volumeAdjust).toEqual({ biceps: 1 });
  });

  it("retira los ejercicios con molestias repetidas y, si no hay nada que cambiar, lo dice", () => {
    const painful = muscleStats(weeklyLogs("ez_curl", [20, 20, 20, 20], 10, 2), TODAY);
    const decision = decideNextBlock({ findings: [], stats: painful, priority: [], previousAdjust: {}, adherence: 0.9, checkins: [good] });
    expect(decision.avoidExercises).toEqual(["ez_curl"]);

    const steady = decideNextBlock({ findings: [], stats: muscleStats([], TODAY), priority: [], previousAdjust: {}, adherence: 0.9, checkins: [good] });
    expect(steady.changes).toHaveLength(1);
    expect(steady.changes[0]?.title).toContain("Se mantiene");
  });
});

describe("revisión semanal", () => {
  const answers: CheckinAnswers = {
    workoutsCompleted: 4,
    nutritionAdherence: 4,
    sleepQuality: 4,
    energy: 4,
    appetite: 3,
    performance: 4,
    pain: false,
    painNotes: "",
    improvedExercises: "",
    difficulties: "",
    weightKg: null,
  };
  const input: WeeklyInput = {
    weekStart: "2026-09-28",
    answers,
    plannedSessions: 4,
    loggedSessions: 4,
    weekLogs: [{ exerciseId: "ez_curl", date: "2026-09-29", discomfort: 0, sets: Array.from({ length: 7 }, () => ({ weightKg: 22.5, reps: 10, rir: 2 })) }],
    priorLogs: [{ exerciseId: "ez_curl", date: "2026-09-22", discomfort: 0, sets: [{ weightKg: 20, reps: 10, rir: 2 }] }],
    volumeTargets: targets,
    priorityMuscles: ["biceps"],
    weights: [
      { date: "2026-09-21", kg: 68 },
      { date: "2026-09-28", kg: 68.3 },
    ],
    trend: { status: "insufficient", entries: 2, needed: "Faltan pesadas." },
    calorieDecision: { action: "wait", deltaKcal: 0, title: "", reason: "" },
    proteinTargetG: 120,
    previous: [],
    formatWeight: (kg) => `${kg.toFixed(1)} kg`,
  };

  it("en una buena semana no propone cambios", () => {
    const report = buildWeeklyReport(input);
    expect(report.changes).toEqual([]);
    expect(report.problems).toEqual([]);
    expect(report.goals.every((goal) => goal.met)).toBe(true);
    expect(report.weight.currentKg).toBeCloseTo(68.3);
    expect(report.weight.deltaKg).toBeCloseTo(0.3);
    expect(report.muscles.find((item) => item.muscle === "biceps")).toMatchObject({ sets: 7, performance: "up", volume: "in_range" });
    expect(report.nextGoals.length).toBeGreaterThan(0);
  });

  it("ante el dolor recomienda no entrenar a través de él y valoración profesional", () => {
    const report = buildWeeklyReport({ ...input, answers: { ...answers, pain: true, painNotes: "hombro derecho" } });
    const change = report.changes.find((item) => item.title.includes("dolor"))!;
    expect(change.detail).toContain("profesional sanitario");
    expect(report.problems.join(" ")).toContain("hombro derecho");
  });

  it("con baja adherencia no toca la rutina, y solo ajusta calorías si la regla lo decide", () => {
    const low = buildWeeklyReport({ ...input, answers: { ...answers, workoutsCompleted: 2 }, loggedSessions: 2 });
    expect(low.changes.map((change) => change.area)).toEqual(["training"]);
    expect(low.changes[0]?.detail).toContain("no se modifica");

    const more = buildWeeklyReport({ ...input, calorieDecision: { action: "increase", deltaKcal: 125, title: "Sube unas 125 kcal", reason: "…" } });
    expect(more.changes).toMatchObject([{ area: "nutrition", calorieDelta: 125 }]);
  });

  it("avisa si faltan la pesada o los registros de las sesiones", () => {
    const report = buildWeeklyReport({ ...input, weights: [], loggedSessions: 1 });
    expect(report.weight.currentKg).toBeNull();
    expect(report.changes.some((change) => change.area === "tracking")).toBe(true);
    expect(report.summary.join(" ")).toContain("solo hay 1 registrados");
  });
});

describe("informe mensual", () => {
  it("separa lo que mejora de lo que se estanca y señala los datos que faltan", () => {
    const measures = measureProgress([
      { date: "2026-09-05", values: { ...emptyValues(), arm_flexed: 33, thigh: 52, waist: 76 } },
      { date: "2026-10-05", values: { ...emptyValues(), arm_flexed: 33.6, thigh: 52, waist: 76.5 } },
    ]);
    const report = buildMonthlyReport({
      periodStart: "2026-09-05",
      periodEnd: TODAY,
      weights: [
        { date: "2026-09-05", kg: 68 },
        { date: "2026-10-05", kg: 69.2 },
      ],
      measures,
      sessionsCompleted: 17,
      sessionsPlanned: 19,
      findings: [],
      calorieDecision: { action: "keep", deltaKcal: 0, title: "", reason: "" },
      formatLength: (cm) => `${cm} cm`,
      formatWeight: (kg) => `${kg} kg`,
    });
    expect(report.weight.change?.absolute).toBeCloseTo(1.2);
    expect(report.adherence.pct).toBe(89);
    expect(report.improving.join(" ")).toContain("Brazo contraído");
    expect(report.stalled.join(" ")).toContain("Muslo");
    expect(report.improving.join(" ") + report.stalled.join(" ")).not.toContain("Cintura");
    expect(report.changes).toEqual(["No hay cambios justificados: mantén el plan y sigue registrando."]);
  });
});

function emptyValues(): Record<Measure, number | null> {
  return Object.fromEntries(MEASURES.map((measure) => [measure, null])) as Record<Measure, number | null>;
}
