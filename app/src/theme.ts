import { createContext, useContext } from "react";

/**
 * Sistema visual: sobrio y elegante, con un único acento para acciones y progreso. El modo por
 * defecto es el claro (fondo blanco, tarjetas en un gris cálido muy suave y acento verde bosque); el
 * oscuro (el original, con acento lima) se elige en «Más». Las pantallas leen la paleta con
 * `useColors()`; nunca importan colores fijos.
 *
 * Contraste comprobado (WCAG): los textos (`fg`, `muted`, `subtle`, `accentFg` y los de estado)
 * llegan a 4,5:1 sobre `bg`, `surface` y `raised`; las marcas de los gráficos, a 3:1 sobre `surface`.
 * La paleta de datos (viz1-3) es la misma en los dos modos y pasa el validador de daltonismo.
 *
 * `accent` es el relleno del botón principal y de las casillas marcadas, y siempre lleva texto
 * `accentInk`. Para texto, iconos y trazos de acento se usa `accentFg`.
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
  bg: "#ffffff",
  surface: "#f6f7f5",
  raised: "#ffffff",
  hover: "#eceeeb",
  line: "rgba(18,21,19,0.07)",
  lineStrong: "rgba(18,21,19,0.16)",

  fg: "#121513",
  muted: "#545a56",
  subtle: "#666c68",

  accent: "#1d6b45",
  accentInk: "#ffffff",
  accentFg: "#1d6b45",
  accentBorder: "#1d6b45",
  accentFaint: "rgba(29,107,69,0.05)",
  accentSoft: "rgba(29,107,69,0.09)",
  accentLine: "rgba(29,107,69,0.35)",

  positive: "#13744a",
  warning: "#955800",
  danger: "#bf352b",
  info: "#2a62b8",
  dangerSoft: "rgba(191,53,43,0.07)",
  dangerLine: "rgba(191,53,43,0.30)",

  track: "rgba(18,21,19,0.07)",
  trackFaint: "rgba(18,21,19,0.04)",
  ringTrack: "rgba(18,21,19,0.08)",
  overlay: "rgba(0,0,0,0.40)",
  figure: "rgba(0,0,0,0.26)",
  figureMark: "rgba(0,0,0,0.18)",

  viz1: "#3987e5",
  viz2: "#d95926",
  viz3: "#199e70",
  vizMuted: "#878d89",
  vizGrid: "#e8eae7",
  vizAxis: "#868c88",
  vizBand: "rgba(18,21,19,0.05)",

  tone: { neutral: "#545a56", accent: "#1d6b45", positive: "#13744a", warning: "#955800", danger: "#bf352b", info: "#2a62b8" },
  toneBg: {
    neutral: "rgba(18,21,19,0.05)",
    accent: "rgba(29,107,69,0.09)",
    positive: "rgba(19,116,74,0.09)",
    warning: "rgba(149,88,0,0.09)",
    danger: "rgba(191,53,43,0.07)",
    info: "rgba(42,98,184,0.08)",
  },
};

export const palettes: Record<Scheme, Palette> = { dark, light };

/** Modo efectivo: el elegido o, en «sistema», el del teléfono (claro si no se sabe). */
export function resolveScheme(mode: ThemeMode, system: string | null | undefined): Scheme {
  if (mode !== "system") return mode;
  return system === "dark" ? "dark" : "light";
}

export const ThemeContext = createContext<Palette>(light);

/** Paleta del tema activo. */
export function useColors(): Palette {
  return useContext(ThemeContext);
}

export const radius = { sm: 8, md: 12, lg: 20, full: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const font = {
  title: 30,
  h1: 22,
  h2: 18,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

/** Números que no bailan al cambiar (pesos, repeticiones, tiempos). */
export const tabular = { fontVariant: ["tabular-nums"] as ("tabular-nums")[] };
