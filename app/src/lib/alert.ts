import { Alert, Platform, type AlertButton } from "react-native";

/**
 * Como `Alert.alert`, pero también funciona en la web, donde `Alert.alert` no hace nada (y por eso no se
 * podían borrar pesadas, descartar sesiones ni generar una rutina nueva desde el navegador).
 *
 * En el móvil es el diálogo de siempre. En la web: con «Cancelar» y una acción, `window.confirm`; sin
 * «Cancelar», `window.alert` y después la acción, si la hay.
 */
export function appAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const cancel = buttons?.find((button) => button.style === "cancel");
  const action = buttons?.find((button) => button.style !== "cancel");
  if (cancel && action) {
    if (globalThis.confirm?.(text)) action.onPress?.();
    else cancel.onPress?.();
    return;
  }
  globalThis.alert?.(text);
  action?.onPress?.();
}
