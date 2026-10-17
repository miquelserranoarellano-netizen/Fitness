import { createContext, useContext } from "react";

/**
 * Sistema visual: sobrio, con un único acento lima para acciones y progreso, en modo oscuro (el
 * original) y claro. Las pantallas leen la paleta con `useColors()`; nunca importan colores fijos.
 *
 * Contraste comprobado (WCAG): los textos (`fg`, `muted`, `subtle`, `accentFg` y los de estado)
 * llegan a 4,5:1 sobre `bg`, `surface` y `raised`; las marcas de los gráficos, a 3:1 sobre `surface`.
 * La paleta de datos (viz1-3) es la misma en los dos modos y pasa el validador de daltonismo.
 *
 * `accent` es el relleno lima (botón principal, casillas marcadas) y siempre lleva texto `accentInk`.
 * Para texto, iconos y trazos de acento se usa `accentFg`: en oscuro es el mismo lima; en claro, un
 * verde oliva legible sobre blanco.
 */

export type Scheme = "light" | "dark";
export type ThemeMode = "system" | Scheme;
export type Tone = "neutral" | "accent" | "positive" | "warning" | "danger" | "info";

export type Palette = {
  scheme: Scheme;
  bg: string;
  surface: string;
  raised: string;
  hover: string;
  line: string;
  lineStrong: string;

  fg: string;
  muted: string;
  subtle: string;

  accent: string;
  accentInk: string;
  accentFg: string;
  accentBorder: string;
  accentFaint: string;
  accentSoft: string;
  accentLine: string;

  positive: string;
  warning: string;
  danger: string;
  info: string;
  dangerSoft: string;
  dangerLine: string;

  /** Fondo de barras de progreso y de pistas. */
  track: string;
  trackFaint: string;
  ringTrack: string;
  /** Velo detrás de las hojas modales. */
  overlay: string;
  /** Silueta de la guía de medidas. */
  figure: string;
  figureMark: string;

  viz1: string;
  viz2: string;
  viz3: string;
  vizMuted: string;
  vizGrid: string;
  vizAxis: string;
  vizBand: string;

  /** Color de texto e icono de cada tono (badges y avisos). */
  tone: Record<Tone, string>;
  /** Fondo translúcido de cada tono. */
  toneBg: Record<Tone, string>;
};

const dark: Palette = {
  scheme: "dark",
  bg: "#08090a",
  surface: "#101113",
  raised: "#17181b",
  hover: "#1f2125",
  line: "rgba(255,255,255,0.07)",
  lineStrong: "rgba(255,255,255,0.14)",

  fg: "#f2f3f5",
  muted: "#a0a4ab",
  subtle: "#80848c",

  accent: "#c2f25c",
  accentInk: "#0c1203",
  accentFg: "#c2f25c",
  accentBorder: "#c2f25c",
  accentFaint: "rgba(194,242,92,0.06)",
  accentSoft: "rgba(194,242,92,0.12)",
  accentLine: "rgba(194,242,92,0.35)",

  positive: "#5ee0a0",
  warning: "#f5c451",
  danger: "#ff7a7a",
  info: "#7cb1ff",
  dangerSoft: "rgba(255,122,122,0.12)",
  dangerLine: "rgba(255,122,122,0.35)",

  track: "rgba(255,255,255,0.06)",
  trackFaint: "rgba(255,255,255,0.04)",
  ringTrack: "rgba(255,255,255,0.08)",
  overlay: "rgba(0,0,0,0.7)",
  figure: "rgba(255,255,255,0.22)",
  figureMark: "rgba(255,255,255,0.18)",

  viz1: "#3987e5",
  viz2: "#d95926",
  viz3: "#199e70",
  vizMuted: "#7a7e86",
  vizGrid: "#1e2024",
  vizAxis: "#62666e",
  vizBand: "rgba(255,255,255,0.06)",

  tone: { neutral: "#a0a4ab", accent: "#c2f25c", positive: "#5ee0a0", warning: "#f5c451", danger: "#ff7a7a", info: "#7cb1ff" },
  toneBg: {
    neutral: "rgba(255,255,255,0.06)",
    accent: "rgba(194,242,92,0.12)",
    positive: "rgba(94,224,160,0.12)",
    warning: "rgba(245,196,81,0.12)",
    danger: "rgba(255,122,122,0.12)",
    info: "rgba(124,177,255,0.12)",
  },
};

const light: Palette = {
  scheme: "light",
  bg: "#f4f5f7",
  surface: "#ffffff",
  raised: "#eceef1",
  hover: "#e3e6ea",
  line: "rgba(0,0,0,0.08)",
  lineStrong: "rgba(0,0,0,0.15)",

  fg: "#111316",
  muted: "#4f545c",
  subtle: "#62676f",

  accent: "#c2f25c",
  accentInk: "#0c1203",
  accentFg: "#456d0a",
  accentBorder: "#6a9418",
  accentFaint: "rgba(69,109,10,0.06)",
  accentSoft: "rgba(69,109,10,0.10)",
  accentLine: "rgba(69,109,10,0.35)",

  positive: "#0f7442",
  warning: "#965500",
  danger: "#c62828",
  info: "#1f5fbf",
  dangerSoft: "rgba(198,40,40,0.08)",
  dangerLine: "rgba(198,40,40,0.35)",

  track: "rgba(0,0,0,0.07)",
  trackFaint: "rgba(0,0,0,0.04)",
  ringTrack: "rgba(0,0,0,0.08)",
  overlay: "rgba(0,0,0,0.45)",
  figure: "rgba(0,0,0,0.28)",
  figureMark: "rgba(0,0,0,0.2)",

  viz1: "#3987e5",
  viz2: "#d95926",
  viz3: "#199e70",
  vizMuted: "#868b93",
  vizGrid: "#e9ebef",
  vizAxis: "#8a9098",
  vizBand: "rgba(0,0,0,0.05)",

  tone: { neutral: "#4f545c", accent: "#456d0a", positive: "#0f7442", warning: "#965500", danger: "#c62828", info: "#1f5fbf" },
  toneBg: {
    neutral: "rgba(0,0,0,0.05)",
    accent: "rgba(69,109,10,0.10)",
    positive: "rgba(15,116,66,0.10)",
    warning: "rgba(150,85,0,0.10)",
    danger: "rgba(198,40,40,0.08)",
    info: "rgba(31,95,191,0.08)",
  },
};

export const palettes: Record<Scheme, Palette> = { dark, light };

/** Modo efectivo: el elegido o, en «sistema», el del teléfono (oscuro si no se sabe). */
export function resolveScheme(mode: ThemeMode, system: string | null | undefined): Scheme {
  if (mode !== "system") return mode;
  return system === "light" ? "light" : "dark";
}

export const ThemeContext = createContext<Palette>(dark);

/** Paleta del tema activo. */
export function useColors(): Palette {
  return useContext(ThemeContext);
}

export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const font = {
  title: 28,
  h1: 22,
  h2: 18,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

/** Números que no bailan al cambiar (pesos, repeticiones, tiempos). */
export const tabular = { fontVariant: ["tabular-nums"] as ("tabular-nums")[] };
