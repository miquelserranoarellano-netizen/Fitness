import { Redirect } from "expo-router";

/**
 * Hueco del botón de la cámara en la barra de abajo. Al tocarlo no se viene aquí: se abre la cámara para
 * registrar una comida (ver `(tabs)/_layout.tsx`). Si se llega por un enlace, se va a la pantalla de foto.
 */
export default function CameraTab() {
  return <Redirect href={{ pathname: "/comida/foto", params: { abrir: "camara" } }} />;
}
