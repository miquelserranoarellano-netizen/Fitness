import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect } from "react";
import { View } from "react-native";
import { Loading } from "@/components/screen";
import { Button, Notice, Txt } from "@/components/ui";
import { DataProvider } from "@/data/provider";
import { t } from "@/i18n";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { requestPersistentStorage } from "@/lib/web";
import { space, useColors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <PreferencesProvider>
      <AppShell />
    </PreferencesProvider>
  );
}

function AppShell() {
  const colors = useColors();
  const { language } = usePreferences();
  const hideSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  // En la web los datos viven en el navegador: se le pide que no los borre si le falta espacio.
  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  const base = colors.scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, background: colors.bg, card: colors.bg, text: colors.fg, border: colors.line, primary: colors.accentFg, notification: colors.accentFg },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={colors.scheme === "dark" ? "light" : "dark"} />
      <DataProvider fallback={<Loading />} onReady={hideSplash}>
        {/* `key`: al cambiar de idioma se vuelve a montar la navegación para que todo se traduzca. */}
        <Stack
          key={language}
          screenOptions={{
            // Desde el SDK 58, en iOS 26 la cabecera es transparente (Liquid Glass) y el contenido pasa por
            // debajo. Las pantallas están pensadas con la cabecera opaca del tema: se mantiene así.
            headerTransparent: false,
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.fg,
            headerTitleStyle: { fontWeight: "600" },
            headerShadowVisible: false,
            headerBackTitle: t("Atrás"),
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t("Inicio") }} />
          <Stack.Screen name="bienvenida" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="informe-inicial" options={{ title: t("Informe inicial") }} />
          <Stack.Screen name="sesion/[id]" options={{ title: t("Entrenamiento"), gestureEnabled: false }} />
          <Stack.Screen name="ejercicio/[id]" options={{ title: t("Ejercicio") }} />
          <Stack.Screen name="historial/index" options={{ title: t("Historial") }} />
          <Stack.Screen name="historial/[id]" options={{ title: t("Sesión") }} />
          <Stack.Screen name="analisis" options={{ title: t("Análisis") }} />
          <Stack.Screen name="revisiones/index" options={{ title: t("Revisiones") }} />
          <Stack.Screen name="revisiones/semanal" options={{ title: t("Revisión semanal") }} />
          <Stack.Screen name="revisiones/semana/[week]" options={{ title: t("Informe semanal") }} />
          <Stack.Screen name="revisiones/mes/[id]" options={{ title: t("Informe mensual") }} />
          <Stack.Screen name="perfil" options={{ title: t("Perfil") }} />
          <Stack.Screen name="servidor" options={{ title: t("Servidor y código de acceso") }} />
          <Stack.Screen name="comida/foto" options={{ title: t("Foto de la comida") }} />
          <Stack.Screen name="comida/texto" options={{ title: t("Escribir la comida") }} />
          <Stack.Screen name="comida/codigo" options={{ title: t("Código de barras") }} />
          <Stack.Screen name="comida/favoritas" options={{ title: t("Favoritas y recientes") }} />
          <Stack.Screen name="comida/nueva" options={{ title: t("Revisar comida") }} />
          <Stack.Screen name="comida/[id]" options={{ title: t("Corregir comida") }} />
        </Stack>
      </DataProvider>
    </ThemeProvider>
  );
}

/** Si una pantalla falla, se muestra el error en lugar de cerrar la app. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, justifyContent: "center", gap: space.md }}>
      <Txt variant="h1">{t("Algo ha fallado")}</Txt>
      <Notice tone="danger">{error.message}</Notice>
      <Txt variant="small">{t("Tus datos siguen guardados en el teléfono. Puedes reintentarlo.")}</Txt>
      <Button onPress={retry}>{t("Reintentar")}</Button>
    </View>
  );
}
