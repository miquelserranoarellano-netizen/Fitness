import { z } from "zod";
import { USER_TABLES } from "@/db/migrations";
import type { Db, Queryable, SqlValue } from "@/db/types";
import { EXPORT_FORMAT, JSON_COLUMNS, TABLES } from "./export";
import type { Result } from "./services";

/**
 * Importación de una copia hecha con «Exportar mis datos» (`export.ts`): sustituye todos los datos de
 * este dispositivo por los de la copia. Sirve para pasar los datos de la web de prueba a la app del
 * móvil y para restaurar una copia de seguridad.
 *
 * - Acepta el formato 2 (`appcombinada/exportacion@2`) y el 1 (el de la app de partida: sin las tablas
 *   de alimentos, favoritas, agua y pasos, que quedan vacías).
 * - Todo o nada: el documento se valida antes de tocar la base de datos, y el borrado y las inserciones
 *   van en una sola transacción. Si una fila no cumple el esquema, no cambia nada.
 * - Solo se escriben las columnas que existen en el esquema actual: las desconocidas se ignoran y las
 *   que faltan toman su valor por defecto.
 * - Las fotografías no van en la copia: las de progreso no se importan y las comidas y favoritas llegan
 *   sin foto. Los archivos de fotos que hubiera en el teléfono se borran aparte (en la pantalla).
 * - Los ajustes del dispositivo (`app_state`: objetivos de agua y pasos, borrador del cuestionario) no
 *   van en la copia y se conservan.
 */

/** Un archivo mayor no es una copia de la app (una de varios años ocupa unos pocos MB). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** Tablas que el formato 1 todavía no tenía. */
const V2_TABLES = new Set(["food_entry_items", "favorite_meals", "water_logs", "step_logs"]);

/** Las fotos de progreso son archivos del teléfono: sin ellos, sus filas no sirven. */
const SKIPPED_TABLES = new Set(["progress_photos"]);

/** Columnas con la ruta de una foto en el teléfono: llegan vacías. */
const PHOTO_COLUMNS = new Set(["photo_uri"]);

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.string(), z.unknown())]);
const rowsSchema = z.array(z.record(z.string(), cellSchema));
const headerSchema = z.object({ formato: z.string(), exportado_el: z.string().optional() });

type Cell = z.infer<typeof cellSchema>;
export type ExportRow = Record<string, Cell>;

export type ParsedExport = {
  version: 1 | 2;
  /** Cuándo se hizo la copia (instante ISO), si lo dice. */
  exportedAt: string | null;
  profileName: string;
  tables: Record<string, ExportRow[]>;
  /** Filas que se importarán de cada tabla. */
  counts: Record<string, number>;
  /** Fotografías (de progreso, de comidas y de favoritas) que no vienen en la copia. */
  photosLeftOut: number;
};

const NOT_A_COPY = "Este archivo no es una copia de la app. Elige el que descargaste con «Exportar mis datos».";

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });

class ImportError extends Error {}

/** Valida una copia (el texto del archivo o el JSON ya leído) sin tocar la base de datos. */
export function parseExport(input: unknown): Result<ParsedExport> {
  let value = input;
  if (typeof input === "string") {
    if (input.length > MAX_IMPORT_BYTES) return fail("El archivo es demasiado grande para ser una copia de la app.");
    try {
      value = JSON.parse(input);
    } catch {
      return fail(NOT_A_COPY);
    }
  }

  const header = headerSchema.safeParse(value);
  if (!header.success) return fail(NOT_A_COPY);
  const { formato, exportado_el } = header.data;
  const version = formato === EXPORT_FORMAT ? 2 : /\/exportacion@1$/.test(formato) ? 1 : null;
  if (version === null) {
    return fail(/\/exportacion@\d+$/.test(formato) ? "Esta copia es de una versión más nueva de la app. Actualiza la app y vuelve a intentarlo." : NOT_A_COPY);
  }

  const document = value as Record<string, unknown>;
  const tables: Record<string, ExportRow[]> = {};
  for (const { name } of TABLES) {
    if (document[name] === undefined && version === 1 && V2_TABLES.has(name)) {
      tables[name] = [];
      continue;
    }
    if (document[name] === undefined) return fail(`La copia está incompleta: le falta la tabla «${name}».`);
    const rows = rowsSchema.safeParse(document[name]);
    if (!rows.success) return fail(`La copia tiene datos que no son válidos en la tabla «${name}».`);
    tables[name] = rows.data;
  }

  const profiles = tables.profiles ?? [];
  if (profiles.length === 0) return fail("La copia no tiene perfil: no hay datos que importar.");
  if (profiles.length > 1) return fail("La copia tiene datos que no son válidos en la tabla «profiles».");
  const displayName = profiles[0]?.display_name;

  const withPhoto = (rows: ExportRow[] = []) => rows.filter((row) => typeof row.photo_uri === "string" && row.photo_uri !== "").length;
  return ok({
    version,
    exportedAt: exportado_el && !Number.isNaN(Date.parse(exportado_el)) ? exportado_el : null,
    profileName: typeof displayName === "string" ? displayName : "",
    tables,
    counts: Object.fromEntries(TABLES.map(({ name }) => [name, SKIPPED_TABLES.has(name) ? 0 : (tables[name]?.length ?? 0)])),
    photosLeftOut: (tables.progress_photos?.length ?? 0) + withPhoto(tables.food_entries) + withPhoto(tables.favorite_meals),
  });
}

/**
 * Sustituye todos los datos por los de la copia. Devuelve lo importado o, si la copia no es válida,
 * el motivo (y entonces no se ha cambiado nada).
 */
export async function importAllData(db: Db, input: unknown): Promise<Result<ParsedExport>> {
  const parsed = parseExport(input);
  if (!parsed.ok) return parsed;
  const copy = parsed.data;

  let current = "";
  try {
    await db.transaction(async (tx) => {
      for (const table of USER_TABLES) if (table !== "app_state") await tx.run(`delete from ${table}`);
      for (const { name } of TABLES) {
        if (SKIPPED_TABLES.has(name)) continue;
        current = name;
        const columns = await schemaColumns(tx, name);
        for (const row of copy.tables[name] ?? []) await insertRow(tx, name, columns, row);
      }
    });
  } catch (cause) {
    if (cause instanceof ImportError) return fail(cause.message);
    const detail = cause instanceof Error ? cause.message : String(cause);
    return fail(`La copia tiene datos que no son válidos en la tabla «${current}» (${detail}). No se ha cambiado nada.`);
  }
  return ok(copy);
}

type Column = { notNull: boolean };

async function schemaColumns(db: Queryable, table: string): Promise<Map<string, Column>> {
  const rows = await db.all<{ name: string; notnull: number }>(`pragma table_info(${table})`);
  return new Map(rows.map((row) => [row.name, { notNull: Number(row.notnull) === 1 }]));
}

async function insertRow(db: Queryable, table: string, columns: Map<string, Column>, row: ExportRow): Promise<void> {
  // Los nombres de columna salen del esquema, no del archivo.
  const names = Object.keys(row).filter((name) => columns.has(name));
  if (names.length === 0) throw new ImportError(`La copia tiene una fila vacía en la tabla «${table}». No se ha cambiado nada.`);
  const values = names.map((name) => toSqlValue(table, name, columns.get(name)!, row[name] ?? null));
  await db.run(`insert into ${table} (${names.map((name) => `"${name}"`).join(", ")}) values (${names.map(() => "?").join(", ")})`, values);
}

/** Lo contrario de la exportación: el JSON vuelve a texto y los booleanos a 0/1. */
function toSqlValue(table: string, column: string, info: Column, value: Cell): SqlValue {
  if (PHOTO_COLUMNS.has(column)) return null;
  if (JSON_COLUMNS.has(column)) {
    // Un `null` guardado como texto en una columna obligatoria se exporta como null: vuelve a ser "null".
    if (value === null) return info.notNull ? "null" : null;
    return JSON.stringify(value);
  }
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new ImportError(`La copia tiene datos que no son válidos en la tabla «${table}» (${column}). No se ha cambiado nada.`);
}
