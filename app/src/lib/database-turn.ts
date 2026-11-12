import Constants from "expo-constants";
import { isWeb } from "./web";

/**
 * Una sola pestaña con los datos, en la web.
 *
 * En la web, expo-sqlite guarda la base de datos en el sistema de archivos privado del navegador (OPFS) y abre sus
 * archivos en exclusiva: mientras una pestaña la tiene abierta, otra no puede abrirla y falla («Access Handles
 * cannot be created…»; en Safari, «The operation failed for an unknown transient reason»). Y no se suelta hasta
 * que esa pestaña se cierra.
 *
 * Por eso cada pestaña, antes de abrir la base de datos, pide el turno con un candado del navegador (Web Locks) y no
 * lo suelta mientras viva. Si otra pestaña lo tiene, esta espera: en cuanto la otra se cierra, esta abre los datos
 * sola. «Usar aquí» le pide a la otra que ceda: pasa a una página que lo explica (`public/otra-pestana.html`), y al
 * dejar la app suelta los archivos. En el móvil nativo no hace falta y no hace nada.
 */

const LOCK = "ikyndo-base-de-datos";
const CHANNEL = "ikyndo-pestanas";
const YIELD = "cede";

let turn: Promise<void> | null = null;

/**
 * Espera a que esta pestaña tenga el turno de la base de datos. `onWaiting` se llama si otra pestaña lo tiene y hay
 * que esperar. Se puede llamar varias veces: todas comparten la misma espera.
 */
export function waitForDatabaseTurn(onWaiting: () => void): Promise<void> {
  const locks = isWeb ? globalThis.navigator?.locks : undefined;
  if (!locks) return Promise.resolve();
  turn ??= new Promise<void>((resolve) => {
    const hold = () => {
      listenForYieldRequests();
      resolve();
      // El candado se suelta solo cuando la pestaña se cierra o sale de la app.
      return new Promise<void>(() => undefined);
    };
    void locks.request(LOCK, { ifAvailable: true }, (lock) => {
      if (lock) return hold();
      onWaiting();
      void locks.request(LOCK, hold);
      return undefined;
    });
  });
  return turn;
}

/** Pide a la pestaña que tiene los datos que los suelte («Usar aquí»). */
export function askOtherTabToYield(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(YIELD);
  channel.close();
}

/** ¿Es el fallo de abrir la base de datos mientras otra pestaña la tiene? */
export function isDatabaseBusyError(error: unknown): boolean {
  if (!isWeb || !(error instanceof Error)) return false;
  return /createSyncAccessHandle|Access Handle|unknown transient reason|NoModificationAllowed/i.test(`${error.name} ${error.message}`);
}

function listenForYieldRequests(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    if (event.data !== YIELD) return;
    const base = (Constants.expoConfig?.experiments?.baseUrl ?? "").replace(/\/+$/, "");
    window.location.replace(`${base}/otra-pestana.html`);
  };
}
