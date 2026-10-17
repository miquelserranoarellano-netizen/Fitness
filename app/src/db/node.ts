import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrations";
import type { Db, Queryable, SqlValue } from "./types";

/**
 * Implementación para las pruebas (Node): la misma interfaz que en el móvil, sobre `node:sqlite`.
 * No se importa nunca desde la app. Con `upTo` se queda en una versión antigua del esquema.
 */
export async function openTestDb(path = ":memory:", upTo?: number): Promise<Db> {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON;");

  const base: Queryable = {
    all: async <T>(sql: string, params: SqlValue[] = []) => database.prepare(sql).all(...params) as T[],
    get: async <T>(sql: string, params: SqlValue[] = []) => (database.prepare(sql).get(...params) as T | undefined) ?? null,
    run: async (sql, params = []) => ({ changes: Number(database.prepare(sql).run(...params).changes) }),
    exec: async (sql) => {
      database.exec(sql);
    },
  };

  let depth = 0;
  const db: Db = {
    ...base,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      if (depth > 0) throw new Error("Transacción anidada: dentro de una transacción usa solo `tx`.");
      depth++;
      database.exec("BEGIN");
      try {
        const out = await fn(base);
        database.exec("COMMIT");
        return out;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      } finally {
        depth--;
      }
    },
  };
  await migrate(db, upTo);
  return db;
}
