/**
 * Capa mínima sobre SQLite. La app usa `expo-sqlite`; las pruebas usan `node:sqlite` con la misma
 * interfaz, así que las consultas son idénticas en el móvil y en los tests.
 *
 * Convenciones (las mismas que la web, adaptadas a SQLite):
 * - Un único usuario por dispositivo: no hay columna `user_id`.
 * - Magnitudes en kg y cm; fechas de calendario como texto `AAAA-MM-DD`; instantes como ISO 8601.
 * - Listas y objetos en columnas de texto con JSON (`json()` al escribir, `parseJson()` al leer).
 * - Booleanos como 0/1.
 */

export type SqlValue = string | number | null;

export type RunResult = { changes: number };

export interface Queryable {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  /** Varias sentencias sin parámetros (migraciones). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  /** Todo o nada. Dentro de `fn` usa solo `tx`. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

export const json = (value: unknown): string => JSON.stringify(value ?? null);

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const bool = (value: boolean): number => (value ? 1 : 0);

export const nowIso = (): string => new Date().toISOString();
