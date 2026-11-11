import { describe, expect, it } from "vitest";
import { openTestDb } from "@/db/node";
import { getProfile, isOnboarded } from "@/data/profile";
import { completeOnboarding } from "@/data/services";
import { convertDraftUnits, emptyDraft, onboardingFromDraft, validateStep, type Draft, type StepId } from "./draft";

/** Lo que pide el cuestionario corto, tal como lo dejan los selectores (texto, coma decimal). */
function shortQuestionnaire(): Draft {
  return {
    ...emptyDraft(),
    age: "31",
    sex: "female",
    height: "165",
    weight: "61,5",
    country: "España",
    primaryGoal: "fat_loss",
    experience: "1to2y",
    daysPerWeek: 3,
    sessionMinutes: 60,
    equipment: ["dumbbells", "bench"],
    jobActivity: "light",
    dailySteps: "6500",
    appetite: "normal",
    dietPreference: "vegetarian",
    allergies: ["gluten"],
  };
}

const STEPS: StepId[] = ["personal", "goals", "experience", "availability", "habits", "nutrition"];

describe("cuestionario corto, sin escribir", () => {
  it("se completa sin nombre, medidas, sueño, estrés ni comidas al día", async () => {
    const draft = shortQuestionnaire();
    for (const step of STEPS) expect(validateStep(step, draft), step).toBeNull();

    const db = await openTestDb();
    const result = await completeOnboarding(db, onboardingFromDraft(draft));
    expect(result.ok).toBe(true);
    expect(await isOnboarded(db)).toBe(true);
    const profile = await getProfile(db);
    expect(profile?.displayName).toBe("");
    expect(profile?.heightCm).toBe(165);
    expect(profile?.dailySteps).toBe(6500);
    expect(profile?.country).toBe("España");
  });

  it("guarda el peso con el decimal elegido", () => {
    expect(onboardingFromDraft(shortQuestionnaire()).weightKg).toBe(61.5);
  });

  it("los pasos «No lo sé» quedan sin dato", () => {
    expect(onboardingFromDraft({ ...shortQuestionnaire(), dailySteps: "" }).dailySteps).toBeNull();
  });
});

describe("cambio de unidades", () => {
  it("convierte la altura y el peso elegidos", () => {
    expect(convertDraftUnits({ units: "metric", height: "180", weight: "80" }, "imperial")).toEqual({ units: "imperial", height: "71", weight: "176,4" });
    const back = convertDraftUnits({ units: "imperial", height: "71", weight: "176,4" }, "metric");
    expect(back.height).toBe("180");
    expect(back.weight).toBe("80");
  });

  it("no toca nada si no cambia o si está vacío", () => {
    expect(convertDraftUnits({ units: "metric", height: "180", weight: "80" }, "metric")).toEqual({});
    expect(convertDraftUnits({ units: "metric", height: "", weight: "" }, "imperial")).toEqual({ units: "imperial", height: "", weight: "" });
  });
});
