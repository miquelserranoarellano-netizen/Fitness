import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import { migrate } from "./migrations";
import type { Db, Queryable, SqlValue } from "./types";

type Conn = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync" | "execAsync">;

function wrap(conn: Conn): Queryable {
  return {
    all: <T>(sql: string, params: SqlValue[] = []) => conn.getAllAsync<T>(sql, params),
    get: <T>(sql: string, params: SqlValue[] = []) => conn.getFirstAsync<T>(sql, params),
    run: async (sql, params = []) => {
      const result = await conn.runAsync(sql, params);
      return { changes: result.changes };
    },
    exec: (sql) => conn.execAsync(sql),
  };
}

export const DATABASE_NAME = "smart-fitness-coach.db";

/** Abre la base de datos del teléfono, la configura y aplica las migraciones pendientes. */
export async function openAppDb(): Promise<Db> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await database.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const base = wrap(database);
  const db: Db = {
    ...base,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      // La transacción exclusiva aísla las consultas de `tx`; en web no existe y se usa la normal.
      if (Platform.OS === "web") {
        let out: T | undefined;
        await database.withTransactionAsync(async () => {
          out = await fn(base);
        });
        return out as T;
      }
      let out: T | undefined;
      await database.withExclusiveTransactionAsync(async (txn) => {
        out = await fn(wrap(txn));
      });
      return out as T;
    },
  };
  await migrate(db);
  return db;
}
