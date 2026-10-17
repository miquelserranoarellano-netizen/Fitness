import { afterEach, describe, expect, it } from "vitest";
import { getLanguage, isSingular, localeTag, msg, resolveLanguage, setLanguage, t, tn } from "./index";

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

  it("solo ofrece idiomas con catálogo y, si no hay ninguno del teléfono, español", () => {
    expect(resolveLanguage("system", ["es-ES"])).toBe("es");
    expect(resolveLanguage("system", ["pl-PL"])).toBe("es");
    // Hasta la fase 10 no hay catálogos: el inglés todavía no se puede elegir.
    expect(resolveLanguage("en", [])).toBe("es");
    setLanguage("en");
    expect(getLanguage()).toBe("es");
  });

  it("msg no cambia el texto y localeTag da la etiqueta del idioma", () => {
    expect(msg("Cálculo inicial")).toBe("Cálculo inicial");
    expect(localeTag("de")).toBe("de-DE");
    expect(localeTag()).toBe("es-ES");
  });
});
