import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Quién puede usar el servidor y cuánto.
 *
 * - **Códigos de acceso** (`ACCESS_CODES` en `.env`): `nombre:código,nombre2:código2`. Cada persona que
 *   prueba la app tiene el suyo: se puede retirar uno sin tocar los demás y los registros dicen quién gasta
 *   qué. La app lo manda en `Authorization: Bearer <código>` y lo guarda en el teléfono o el navegador; no va
 *   dentro del código de la app (el antiguo `APP_TOKEN` sí iba, y en la web lo podía leer cualquiera).
 * - **Cupo diario** de análisis con IA, por persona y en total, para que el gasto en Anthropic tenga techo.
 *   Vive en memoria: se reinicia a medianoche (hora de Madrid) y al reiniciar el servidor.
 */

export const MIN_CODE_LENGTH = 16;
const NAME_PATTERN = /^[\p{L}\p{N}_.-]{1,40}$/u;

const sha256 = (value) => createHash("sha256").update(value).digest();

/**
 * Lee `ACCESS_CODES`. Devuelve las personas (con el código ya resumido con SHA-256) y los problemas
 * encontrados, sin copiar nunca un código en los mensajes.
 */
export function parseAccessCodes(raw) {
  const testers = [];
  const problems = [];
  const names = new Set();
  const codes = new Set();
  const entries = String(raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  entries.forEach((entry, index) => {
    const separator = entry.indexOf(":");
    if (separator <= 0) {
      problems.push(`La entrada ${index + 1} no tiene la forma nombre:código.`);
      return;
    }
    const name = entry.slice(0, separator).trim();
    const code = entry.slice(separator + 1).trim();
    if (!NAME_PATTERN.test(name)) {
      problems.push(`El nombre de la entrada ${index + 1} solo puede llevar letras, números, «.», «_» o «-» (hasta 40).`);
      return;
    }
    if (code.length < MIN_CODE_LENGTH) {
      problems.push(`El código de «${name}» es demasiado corto: mínimo ${MIN_CODE_LENGTH} caracteres (genera uno con npm run new-code).`);
      return;
    }
    if (names.has(name.toLowerCase())) problems.push(`«${name}» está repetido.`);
    if (codes.has(code)) problems.push(`El código de «${name}» es el mismo que el de otra persona.`);
    names.add(name.toLowerCase());
    codes.add(code);
    testers.push({ name, hash: sha256(code) });
  });
  return { testers, problems };
}

/** El código de `Authorization: Bearer <código>`, o null. */
export function bearerToken(header) {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(\S{1,200})\s*$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Nombre de la persona dueña del código, o null. Compara con todos sin parar en el primero que coincide y
 * con resúmenes de la misma longitud, así el tiempo de respuesta no da pistas.
 */
export function findTester(testers, code) {
  if (typeof code !== "string" || code.length === 0) return null;
  const received = sha256(code);
  let found = null;
  for (const tester of testers) {
    if (timingSafeEqual(received, tester.hash) && found === null) found = tester.name;
  }
  return found;
}

/**
 * Freno a quien prueba códigos al azar: tras `limit` códigos incorrectos desde la misma dirección en
 * `windowMs`, esa dirección queda bloqueada hasta que pase la ventana. Los aciertos no cuentan, así que
 * quien tiene un código bueno no se ve afectado por sus propias peticiones.
 */
export function createFailureTracker({ limit = 10, windowMs = 10 * 60 * 1000, maxEntries = 10_000, now = () => Date.now() } = {}) {
  const entries = new Map(); // dirección -> { count, resetAt }

  const current = (key) => {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.resetAt <= now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  };

  return {
    /** ¿Está bloqueada esta dirección? */
    blocked(key) {
      return limit > 0 && (current(key)?.count ?? 0) >= limit;
    },
    /** Apunta un código incorrecto. */
    fail(key) {
      const entry = current(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      // Memoria acotada: si se llena, se sueltan las entradas más antiguas.
      if (entries.size >= maxEntries) {
        for (const oldest of entries.keys()) {
          entries.delete(oldest);
          if (entries.size < maxEntries) break;
        }
      }
      entries.set(key, { count: 1, resetAt: now() + windowMs });
    },
  };
}

const madridDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Cupo diario de análisis con IA. `perPerson` y `total` a 0 significan sin límite.
 * `take(name)` apunta uno si queda cupo y devuelve null; si no, "person" o "total".
 */
export function createDailyQuota({ perPerson = 40, total = 300, now = () => new Date() } = {}) {
  let day = null;
  let all = 0;
  const counts = new Map();

  const roll = () => {
    const today = madridDay.format(now());
    if (today !== day) {
      day = today;
      all = 0;
      counts.clear();
    }
  };

  return {
    take(name) {
      roll();
      const used = counts.get(name) ?? 0;
      if (perPerson > 0 && used >= perPerson) return "person";
      if (total > 0 && all >= total) return "total";
      counts.set(name, used + 1);
      all += 1;
      return null;
    },
    /** Devuelve un análisis que al final no se hizo (la IA no llegó a trabajar). */
    refund(name) {
      roll();
      const used = counts.get(name) ?? 0;
      if (used === 0) return;
      counts.set(name, used - 1);
      all = Math.max(0, all - 1);
    },
    status(name) {
      roll();
      return { used: counts.get(name) ?? 0, limit: perPerson > 0 ? perPerson : null };
    },
  };
}
