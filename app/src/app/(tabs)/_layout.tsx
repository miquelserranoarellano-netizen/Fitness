import { Tabs } from "expo-router";
import { Apple, Dumbbell, House, Menu, PersonStanding } from "lucide-react-native";
import { t } from "@/i18n";
import { useColors } from "@/theme";

/** Barra inferior: las cinco secciones principales. En Nutrición hay además un botón flotante de cámara. */
export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentFg,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
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

