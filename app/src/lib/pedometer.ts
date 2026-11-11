import { Pedometer } from "expo-sensors";
import { useEffect, useEffectEvent, useState } from "react";
import { Platform } from "react-native";
import { isWeb } from "./web";

/**
 * Pasos del día desde el podómetro del teléfono (expo-sensors, incluido en Expo Go).
 *
 * - iPhone: el sistema guarda el historial, así que se lee el total de hoy desde medianoche y se vuelve a
 *   leer cada minuto mientras la pantalla está abierta.
 * - Android: solo hay un contador en vivo desde que se abre la app; cada paso nuevo se avisa con
 *   `onSteps` como total de hoy = lo guardado + lo contado.
 * - Web o sin sensor: `status` es "unavailable" y los pasos se ponen a mano.
 *
 * Usa sensores del teléfono: no se prueba con vitest.
 */

export type PedometerStatus = "checking" | "ready" | "denied" | "unavailable";

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

export function usePhoneSteps({ saved, onSteps }: { saved: number; onSteps: (steps: number) => void }) {
  const [status, setStatus] = useState<PedometerStatus>(isWeb ? "unavailable" : "checking");
  // Siempre lo último guardado y el último `onSteps`, sin volver a conectar con el sensor.
  const currentSaved = useEffectEvent(() => saved);
  const emit = useEffectEvent((steps: number) => onSteps(steps));

  useEffect(() => {
    if (isWeb) return;
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) return !cancelled && setStatus("unavailable");
        const permission = await Pedometer.requestPermissionsAsync();
        if (!permission.granted) return !cancelled && setStatus("denied");
        if (cancelled) return;
        setStatus("ready");

        if (Platform.OS === "ios") {
          const read = async () => {
            const result = await Pedometer.getStepCountAsync(startOfToday(), new Date());
            if (!cancelled && result.steps > currentSaved()) emit(result.steps);
          };
          await read();
          timer = setInterval(() => void read().catch(() => undefined), 60_000);
        } else {
          const base = currentSaved();
          let last = 0;
          subscription = Pedometer.watchStepCount((result) => {
            // Se guarda como mucho cada 25 pasos para no escribir en cada paso.
            if (cancelled || result.steps - last < 25) return;
            last = result.steps;
            emit(base + result.steps);
          });
        }
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      if (timer) clearInterval(timer);
    };
  }, []);

  return status;
}
