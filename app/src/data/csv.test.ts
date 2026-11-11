import { beforeEach, describe, expect, it } from "vitest";
import { openTestDb } from "@/db/node";
import type { Db } from "@/db/types";
import { saveFoodEntries } from "@/integrations/nutrition/store";
import { addDays, today } from "@/lib/dates";
import { exportCsv, toCsv } from "./csv";
import { setSteps, setWater } from "./daily";
import { completeOnboarding } from "./services";
import { onboardingInput } from "./testing";

let db: Db;
beforeEach(async () => {
  db = await openTestDb();
  expect((await completeOnboarding(db, onboardingInput())).ok).toBe(true);
});

const lines = (content: string) => content.replace(/^﻿/, "").trim().split("\r\n");

describe("CSV", () => {
  it("usa «;», coma decimal y comillas cuando hace falta", () => {
    const content = toCsv(["a", "b"], [[1.5, 'Arroz; "con" pollo'], [null, 2]]);
    expect(content.startsWith("﻿")).toBe(true);
    expect(lines(content)).toEqual(["a;b", '1,5;"Arroz; ""con"" pollo"', ";2"]);
  });

  it("resumen diario con calorías, objetivo, cumplido, agua, pasos y peso", async () => {
    const day = addDays(today(), -1);
    await saveFoodEntries(db, "foto", [{ eatenAt: `${day}T13:00:00Z`, date: day, name: "Lentejas", calories: 600, proteinG: 30, carbsG: 80, fatG: 15, items: [] }]);
    await setWater(db, day, 1500);
    await setSteps(db, day, 8000, "manual");
    const { fileName, content } = await exportCsv(db, "daily", today());
    expect(fileName).toMatch(/diario-\d{4}-\d{2}-\d{2}\.csv$/);
    const rows = lines(content);
    expect(rows[0]).toBe("Fecha;Calorías;Objetivo (kcal);Cumplido;Proteína (g);Carbohidratos (g);Grasas (g);Agua (ml);Pasos;Peso (kg)");
    const yesterday = rows.find((row) => row.startsWith(day))!.split(";");
    expect(yesterday.slice(1, 2)).toEqual(["600"]);
    expect(yesterday[3]).toBe("no"); // muy por debajo del objetivo
    expect(yesterday.slice(4)).toEqual(["30", "80", "15", "1500", "8000", ""]);
    expect(rows.some((row) => row.startsWith(today()) && row.endsWith(";68"))).toBe(true); // peso del cuestionario
  });

  it("comidas, entrenamientos y medidas", async () => {
    await saveFoodEntries(db, "texto", [{ eatenAt: `${today()}T08:30:00Z`, date: today(), name: "Tostadas", calories: 300, proteinG: 10, carbsG: 45, fatG: 8, items: [] }]);
    expect(lines((await exportCsv(db, "meals", today())).content)[1]).toBe(`${today()};08:30;Tostadas;300;10;45;8;texto`);
    expect(lines((await exportCsv(db, "workouts", today())).content)).toHaveLength(1); // solo la cabecera
    const measures = lines((await exportCsv(db, "measurements", today())).content);
    expect(measures[0]).toContain("Cintura (cm)");
    expect(measures[1]).toContain(";76");
  });
});
