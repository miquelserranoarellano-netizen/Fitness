import { router } from "expo-router";
import { BarChart3, CalendarClock, ClipboardCheck, FileText, KeyRound, UserRound } from "lucide-react-native";
import { View } from "react-native";
import { Segmented } from "@/components/form";
import { Screen } from "@/components/screen";
import { Card, CardHeader, LinkRow, Notice, Txt } from "@/components/ui";
import { AVAILABLE_LANGUAGES, LANGUAGE_NAMES, t, type LanguagePreference } from "@/i18n";
import { usePreferences } from "@/lib/preferences";
import { isWeb } from "@/lib/web";
import { space, type ThemeMode } from "@/theme";

/** El resto de secciones, como «Más» en la web desde el móvil, y las preferencias de la interfaz. */
export default function More() {
  const { preferences, setThemeMode, setLanguagePreference } = usePreferences();
  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "system", label: t("Sistema") },
    { value: "light", label: t("Claro") },
    { value: "dark", label: t("Oscuro") },
  ];
  const languageOptions: { value: LanguagePreference; label: string }[] = [
    { value: "system", label: t("Sistema") },
    ...AVAILABLE_LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] })),
  ];
  const pendingLanguages = (["en", "fr", "de"] as const).filter((code) => !AVAILABLE_LANGUAGES.includes(code));

  return (
    <Screen tab title={t("Más")}>
      <Card>
        <LinkRow icon={BarChart3} title={t("Análisis")} subtitle={t("Puntos fuertes y débiles por grupo muscular")} onPress={() => router.push("/analisis")} />
        <LinkRow icon={CalendarClock} title={t("Historial")} subtitle={t("Sesiones y progresión de cada ejercicio")} onPress={() => router.push("/historial")} />
        <LinkRow icon={ClipboardCheck} title={t("Revisiones")} subtitle={t("Revisión semanal, informes mensuales y siguiente bloque")} onPress={() => router.push("/revisiones")} />
        <LinkRow icon={FileText} title={t("Informe inicial")} subtitle={t("Tu punto de partida")} onPress={() => router.push("/informe-inicial")} />
        <LinkRow icon={UserRound} title={t("Perfil")} subtitle={t("Datos, objetivos, limitaciones, recordatorios y tus datos")} onPress={() => router.push("/perfil")} />
        <LinkRow icon={KeyRound} title={t("Servidor y código de acceso")} subtitle={t("Para analizar comidas con IA y buscar códigos de barras")} onPress={() => router.push("/servidor")} />
      </Card>

      {isWeb ? (
        <Notice title={t("Versión web de prueba")}>
          {t(
            "Tus datos se guardan en este navegador. Exporta una copia de vez en cuando (Perfil → Tus datos). En el iPhone, añade la web a la pantalla de inicio: si no, Safari puede borrar los datos tras unos días sin abrirla.",
          )}
        </Notice>
      ) : null}

      <Card>
        <CardHeader title={t("Apariencia e idioma")} />
        <View style={{ gap: space.lg }}>
          <View style={{ gap: space.sm }}>
            <Txt variant="label">{t("Tema")}</Txt>
            <Segmented options={themeOptions} value={preferences.theme} onChange={setThemeMode} />
            <Txt variant="tiny">{t("«Sistema» sigue el modo claro u oscuro del teléfono.")}</Txt>
          </View>
          <View style={{ gap: space.sm }}>
            <Txt variant="label">{t("Idioma")}</Txt>
            <Segmented options={languageOptions} value={preferences.language} onChange={setLanguagePreference} />
            {pendingLanguages.length > 0 ? (
              <Txt variant="tiny">{t("Inglés, francés y alemán llegarán cuando esté terminada la traducción de toda la app.")}</Txt>
            ) : null}
          </View>
        </View>
      </Card>

      <Txt variant="tiny" style={{ textAlign: "center" }}>
        {isWeb ? t("Smart Fitness Coach · tus datos se guardan solo en este navegador") : t("Smart Fitness Coach · tus datos se guardan solo en este teléfono")}
      </Txt>
    </Screen>
  );
}
