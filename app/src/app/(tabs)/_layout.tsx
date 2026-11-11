import { Tabs } from "expo-router";
import { Apple, Dumbbell, House, Menu, PersonStanding } from "lucide-react-native";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CONTENT_MAX_WIDTH } from "@/components/screen";
import { t } from "@/i18n";
import { useColors } from "@/theme";

/** Barra inferior: las cinco secciones principales. En Nutrición hay además un botón flotante de cámara. */
export default function TabsLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // En la web la barra que viene por defecto es tan baja que recorta las etiquetas: se le da altura y, en
  // pantallas anchas, se alinea con la columna del contenido. En el móvil se deja la del sistema.
  const web = Platform.OS === "web";
  const side = Math.max(0, (width - CONTENT_MAX_WIDTH) / 2);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentFg,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          ...(web ? { height: 64 + insets.bottom, paddingTop: 4, paddingBottom: 4 + insets.bottom, paddingHorizontal: side } : null),
        },
        // `flexShrink: 0`: sin él, el texto se encogía hasta 9 px de alto y se cortaba por abajo.
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500", ...(web ? { lineHeight: 15, flexShrink: 0 } : null) },
        ...(web ? { tabBarLabelPosition: "below-icon" as const } : null),
      }}
    >
      <Tabs.Screen name="inicio" options={{ title: t("Inicio"), tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="entrenamiento" options={{ title: t("Entreno"), tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} /> }} />
      <Tabs.Screen name="nutricion" options={{ title: t("Nutrición"), tabBarIcon: ({ color, size }) => <Apple color={color} size={size} /> }} />
      <Tabs.Screen name="cuerpo" options={{ title: t("Cuerpo"), tabBarIcon: ({ color, size }) => <PersonStanding color={color} size={size} /> }} />
      <Tabs.Screen name="mas" options={{ title: t("Más"), tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
    </Tabs>
  );
}

