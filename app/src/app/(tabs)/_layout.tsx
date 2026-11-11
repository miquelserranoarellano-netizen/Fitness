import { router, Tabs } from "expo-router";
import { Apple, Camera, Dumbbell, House, Menu, PersonStanding } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { t } from "@/i18n";
import { useColors } from "@/theme";

/**
 * Barra inferior: las secciones principales y, en el centro, el botón de la cámara para registrar una comida
 * con una foto desde cualquier pantalla. Abre la cámara directamente.
 */
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
      <Tabs.Screen
        name="camara"
        options={{
          title: t("Foto"),
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: t("Hacer una foto de la comida"),
          tabBarButton: () => <CameraButton />,
        }}
      />
      <Tabs.Screen name="nutricion" options={{ title: t("Nutrición"), tabBarIcon: ({ color, size }) => <Apple color={color} size={size} /> }} />
      <Tabs.Screen name="cuerpo" options={{ title: t("Cuerpo"), tabBarIcon: ({ color, size }) => <PersonStanding color={color} size={size} /> }} />
      <Tabs.Screen name="mas" options={{ title: t("Más"), tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
    </Tabs>
  );
}

function CameraButton() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        onPress={() => router.push({ pathname: "/comida/foto", params: { abrir: "camara" } })}
        accessibilityRole="button"
        accessibilityLabel={t("Hacer una foto de la comida")}
        hitSlop={6}
        style={({ pressed }) => ({
          width: 58,
          height: 58,
          borderRadius: 29,
          marginTop: -18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accent,
          borderWidth: 4,
          borderColor: colors.bg,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Camera size={26} color={colors.accentInk} />
      </Pressable>
    </View>
  );
}
