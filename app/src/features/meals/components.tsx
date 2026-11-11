import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Camera, KeyRound, PencilLine, Plus, ScanBarcode, Star, UtensilsCrossed, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Button, Notice, Txt } from "@/components/ui";
import { mealPhotoDisplayUri } from "@/data/meal-photos";
import { t } from "@/i18n";
import { ApiError, apiErrorMessage, isRetryable } from "@/lib/api";
import { radius, space, useColors } from "@/theme";
import { emptyDraft, setMealDraft } from "./draft";

/** Mientras el servidor trabaja: qué está pasando, cuánto puede tardar y cómo cancelarlo. */
export function WorkingPanel({ title, hint, onCancel }: { title: string; hint?: string; onCancel?: () => void }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", gap: space.sm, paddingVertical: space.lg }} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.accentFg} size="large" />
      <Txt style={{ fontWeight: "600", textAlign: "center" }}>{title}</Txt>
      {hint ? (
        <Txt variant="small" style={{ textAlign: "center" }}>
          {hint}
        </Txt>
      ) : null}
      {onCancel ? (
        <Button variant="ghost" size="sm" onPress={onCancel}>
          {t("Cancelar")}
        </Button>
      ) : null}
    </View>
  );
}

/** Un error del servidor con su explicación, «Reintentar» si tiene sentido y otras salidas. */
export function RequestError({ error, onRetry, children }: { error: unknown; onRetry?: () => void; children?: ReactNode }) {
  const router = useRouter();
  const notConfigured = error instanceof ApiError && error.code === "ai_not_configured";
  const needsCode = error instanceof ApiError && error.code === "unauthorized";
  return (
    <View style={{ gap: space.md }}>
      <Notice tone={notConfigured ? "warning" : "danger"} title={notConfigured ? t("Falta configurar la IA") : needsCode ? t("Falta tu código de acceso") : t("No ha salido bien")}>
        {apiErrorMessage(error)}
      </Notice>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {needsCode ? (
          <Button size="sm" icon={KeyRound} onPress={() => router.push("/servidor")}>
            {t("Poner el código")}
          </Button>
        ) : null}
        {onRetry && isRetryable(error) ? (
          <Button size="sm" onPress={onRetry}>
            {t("Reintentar")}
          </Button>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** Al guardar, vuelve a la pestaña desde la que se empezó (Nutrición, Inicio…). */
export function useFinishMealFlow() {
  const router = useRouter();
  return () => {
    if (router.canDismiss()) router.dismissAll();
    else router.replace("/nutricion");
  };
}

/** Abre la revisión con una comida vacía para escribirla a mano. */
export function useManualMeal() {
  const router = useRouter();
  return () => {
    setMealDraft(emptyDraft());
    router.push("/comida/nueva");
  };
}

/**
 * Los cuatro caminos para registrar una comida (y «a mano»). Se usa en Nutrición y, en la fase 6,
 * en Inicio.
 */
export function AddMealButtons() {
  const router = useRouter();
  const manual = useManualMeal();
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <AddButton icon={Camera} label={t("Foto")} onPress={() => router.push({ pathname: "/comida/foto", params: { abrir: "camara" } })} />
        <AddButton icon={PencilLine} label={t("Escribir")} onPress={() => router.push("/comida/texto")} />
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <AddButton icon={ScanBarcode} label={t("Código")} onPress={() => router.push("/comida/codigo")} />
        <AddButton icon={Star} label={t("Favoritas")} onPress={() => router.push("/comida/favoritas")} />
      </View>
      <Button variant="ghost" size="sm" icon={Plus} onPress={manual}>
        {t("Añadir a mano")}
      </Button>
    </View>
  );
}

function AddButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 64,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.lineStrong,
        backgroundColor: pressed ? colors.hover : colors.raised,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: space.sm,
      })}
    >
      <Icon size={22} color={colors.accentFg} />
      <Txt variant="label">{label}</Txt>
    </Pressable>
  );
}

/** Miniatura de una comida: su foto o un icono. */
export function MealThumb({ uri, size = 48 }: { uri: string | null; size?: number }) {
  const colors = useColors();
  const shown = mealPhotoDisplayUri(uri);
  if (shown) {
    return <Image source={{ uri: shown }} style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: colors.raised }} contentFit="cover" accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }}>
      <UtensilsCrossed size={size / 2.4} color={colors.subtle} />
    </View>
  );
}
