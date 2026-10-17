/**
 * Identificadores únicos (UUID v4). En la app se usa `expo-crypto` (ver `DataProvider`); en las
 * pruebas, el `crypto` de Node. El generador de reserva solo existe para no fallar nunca.
 */

type Generator = () => string;

function fallback(): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

let generator: Generator = () => {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return crypto?.randomUUID ? crypto.randomUUID() : fallback();
};

export function setIdGenerator(next: Generator): void {
  generator = next;
}

export function newId(): string {
  return generator();
}
