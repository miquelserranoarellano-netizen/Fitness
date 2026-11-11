import { describe, expect, it } from "vitest";
import { addMonths, formatMonth, monthEnd, monthStart } from "./dates";

describe("meses", () => {
  it("calcula el inicio, el fin y el salto de mes, también en cambio de año y en bisiestos", () => {
    expect(monthStart("2026-11-11")).toBe("2026-11-01");
    expect(addMonths("2026-11-11", 1)).toBe("2026-12-01");
    expect(addMonths("2026-12-05", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
    expect(monthEnd("2026-11-11")).toBe("2026-11-30");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
  });

  it("escribe el mes en español", () => {
    expect(formatMonth("2026-11-11")).toBe("noviembre de 2026");
  });
});
