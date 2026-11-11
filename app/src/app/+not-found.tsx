import { Stack, useRouter } from "expo-router";
import { Compass } from "lucide-react-native";
import { View } from "react-native";
import { Button, EmptyState } from "@/components/ui";
import { t } from "@/i18n";
import { space, useColors } from "@/theme";

/**
 * Dirección que no existe (un enlace antiguo o mal escrito). Sustituye a la página de Expo Router, que
 * está en inglés y enlaza a la lista de todas las pantallas de la app.
 */
export default function NotFound() {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, justifyContent: "center" }}>
      <Stack.Screen options={{ title: t("Página no encontrada") }} />
      <EmptyState
        icon={Compass}
        title={t("Esta página no existe")}
        action={
          <Button onPress={() => router.replace("/")}>{t("Ir al inicio")}</Button>
        }
      >
        {t("Puede que el enlace sea antiguo o esté mal escrito. Tus datos siguen donde estaban.")}
      </EmptyState>
    </View>
  );
}
