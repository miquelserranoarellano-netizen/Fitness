import type { ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/i18n";
import { space, useColors } from "@/theme";
import { Button, Notice, Txt } from "./ui";

/**
 * Contenedor de cada pantalla: desplazamiento, márgenes seguros y teclado. En las pestañas
 * (sin cabecera nativa) muestra un título grande; en el resto, el título lo pone la cabecera.
 */
export function Screen({
  title,
  eyebrow,
  description,
  children,
  footer,
  tab,
  contentStyle,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  /** Barra fija abajo (botones de un formulario). */
  footer?: ReactNode;
  /** Pantalla de pestaña: sin cabecera nativa, con margen superior seguro y título grande. */
  tab?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={tab ? 0 : 90}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { paddingHorizontal: space.lg, paddingTop: tab ? insets.top + space.lg : space.lg, paddingBottom: footer ? space.xl : space.xxl + insets.bottom, gap: space.lg },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {title || description ? (
          <View style={{ gap: 6, marginBottom: space.xs }}>
            {eyebrow ? <Txt variant="subtle">{eyebrow}</Txt> : null}
            {title ? <Txt variant="title">{title}</Txt> : null}
            {description ? <Txt variant="muted">{description}</Txt> : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: colors.bg,
            paddingHorizontal: space.lg,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.md,
          }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** Estado de carga o error de una pantalla mientras llegan sus datos. */
export function Loading({ error, onRetry }: { error?: Error | null; onRetry?: () => void }) {
  const colors = useColors();
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg, justifyContent: "center", gap: space.md }}>
        <Notice tone="danger" title={t("No se han podido cargar los datos")}>
          {error.message}
        </Notice>
        {onRetry ? (
          <Button variant="secondary" onPress={onRetry}>
            {t("Reintentar")}
          </Button>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.accentFg} />
    </View>
  );
}
