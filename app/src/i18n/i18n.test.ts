import { afterEach, describe, expect, it } from "vitest";
import { AVAILABLE_LANGUAGES, getLanguage, isSingular, labels, localeTag, msg, resolveLanguage, setLanguage, t, tn } from "./index";

afterEach(() => setLanguage("es"));

describe("traducciones", () => {
  it("devuelve el texto en español y sustituye los parámetros", () => {
    expect(t("Objetivo diario")).toBe("Objetivo diario");
    expect(t("Unas {kcal} kcal al día", { kcal: 2650 })).toBe("Unas 2650 kcal al día");
    expect(t("Sin {nada}")).toBe("Sin {nada}");
  });

  it("elige singular o plural con las reglas de cada idioma", () => {
    expect(tn(1, "{n} serie", "{n} series")).toBe("1 serie");
    expect(tn(3, "{n} serie", "{n} series")).toBe("3 series");
    expect(tn(0, "{n} serie", "{n} series")).toBe("0 series");
    expect(isSingular(0, "fr")).toBe(true);
    expect(isSingular(1, "fr")).toBe(true);
    expect(isSingular(2, "fr")).toBe(false);
    expect(isSingular(0, "de")).toBe(false);
  });

  it("formatea el número del plural según el idioma", () => {
    expect(tn(12000, "{n} paso", "{n} pasos")).toBe(`${(12000).toLocaleString("es-ES")} pasos`);
  });

  it("elige el idioma del teléfono si hay catálogo y, si no, español", () => {
    expect(resolveLanguage("system", ["es-ES"])).toBe("es");
    expect(resolveLanguage("system", ["pl-PL"])).toBe("es");
    expect(resolveLanguage("system", ["pl-PL", "de-AT"])).toBe("de");
    expect(resolveLanguage("en", [])).toBe("en");
    expect(AVAILABLE_LANGUAGES).toEqual(["es", "en", "fr", "de"]);
  });

  it("traduce textos, plurales y etiquetas al idioma elegido", () => {
    setLanguage("en");
    expect(getLanguage()).toBe("en");
    expect(t("Objetivo diario")).toBe("Daily target");
    expect(t("Te quedan {kcal} kcal", { kcal: 500 })).toBe("500 kcal left");
    expect(tn(3, "{n} semana", "{n} semanas")).toBe("3 weeks");
    setLanguage("fr");
    expect(tn(1, "{n} semana", "{n} semanas")).toBe("1 semaine");
    const table = labels({ fat_loss: "Perder grasa" });
    expect(table.fat_loss).toBe("Perdre du gras");
    setLanguage("de");
    expect(labels(["Lunes", "Martes"] as const).map((day) => day)).toEqual(["Montag", "Dienstag"]);
    expect(t("Texto que no está en el catálogo")).toBe("Texto que no está en el catálogo");
  });

  it("msg no cambia el texto y localeTag da la etiqueta del idioma", () => {
    expect(msg("Cálculo inicial")).toBe("Cálculo inicial");
    expect(localeTag("de")).toBe("de-DE");
    expect(localeTag()).toBe("es-ES");
  });
});
