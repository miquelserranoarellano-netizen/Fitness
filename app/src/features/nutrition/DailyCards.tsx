import { router } from "expo-router";
import { Camera, Droplet, Footprints, Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { PickerField, rangeOptions } from "@/components/Picker";
import { Button, Card, CardHeader, ProgressBar, Txt } from "@/components/ui";
import { AddMealButtons } from "@/features/meals/components";
import { t } from "@/i18n";
import type { PedometerStatus } from "@/lib/pedometer";
import { formatNumber } from "@/lib/units";
import { radius, space, tabular, useColors } from "@/theme";

/** Mientras no haya ninguna comida hecha con la cámara: una invitación clara a probarla. */
export function FirstMealCard() {
  const colors = useColors();
  return (
    <Card highlight>
      <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.sm }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Camera size={30} color={colors.accentFg} />
        </View>
        <Txt variant="h2" style={{ textAlign: "center" }}>
          {t("Escanea tu primera comida")}
        </Txt>
        <Txt variant="small" style={{ textAlign: "center", maxWidth: 300 }}>
          {t("Haz una foto del plato y la IA reconocerá los alimentos y calculará las calorías y los macros. Tú solo revisas y guardas.")}
        </Txt>
        <Button size="lg" icon={Camera} full onPress={() => router.push({ pathname: "/comida/foto", params: { abrir: "camara" } })}>
          {t("Hacer la foto")}
        </Button>
      </View>
    </Card>
  );
}

/** Sin IA (`AI_ENABLED`): los caminos para añadir una comida, arriba del todo en Nutrición. */
export function AddMealCard() {
  return (
    <Card>
      <CardHeader title={t("Añadir comida")} />
      <AddMealButtons />
    </Card>
  );
}

const GLASS_ML = 250;

/** Agua de hoy: vasos de 250 ml que se tocan para sumar o quitar. */
export function WaterCard({ ml, goalMl, onChange, onGoal }: { ml: number; goalMl: number; onChange: (ml: number) => void; onGoal: (ml: number) => void }) {
  const colors = useColors();
  const glasses = Math.max(1, Math.round(goalMl / GLASS_ML));
  const full = Math.floor(ml / GLASS_ML);
  return (
    <Card style={{ flex: 1, minWidth: 260 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md }}>
        <Droplet size={18} color={colors.tone.info} />
        <Txt style={{ flex: 1, fontWeight: "600" }}>{t("Agua")}</Txt>
        <Txt variant="small" style={tabular}>
          {formatNumber(ml / 1000, 2)} / {formatNumber(goalMl / 1000, 1)} l
        </Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityRole="adjustable" accessibilityLabel={t("Vasos de agua")}>
        {Array.from({ length: Math.max(glasses, full) }, (_, index) => {
          const filled = index < full;
          return (
            <Pressable
              key={index}
              onPress={() => onChange(filled && index === full - 1 ? (full - 1) * GLASS_ML : (index + 1) * GLASS_ML)}
              accessibilityRole="button"
              accessibilityLabel={t("{n} vasos", { n: index + 1 })}
              hitSlop={4}
              style={{ width: 30, height: 36, borderRadius: radius.sm, borderWidth: 1.5, borderColor: filled ? colors.tone.info : colors.lineStrong, backgroundColor: filled ? colors.toneBg.info : "transparent", alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}
            >
              {filled ? <View style={{ width: "100%", height: "70%", backgroundColor: colors.tone.info, opacity: 0.55 }} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
        <Button variant="secondary" size="sm" icon={Minus} onPress={() => onChange(Math.max(0, ml - GLASS_ML))} disabled={ml === 0} accessibilityLabel={t("Quitar un vaso")} />
        <Button variant="secondary" size="sm" icon={Plus} onPress={() => onChange(ml + GLASS_ML)} style={{ flex: 1 }}>
          {t("Un vaso (250 ml)")}
        </Button>
      </View>
      <View style={{ marginTop: space.md }}>
        <PickerField
          title={t("Objetivo de agua")}
          display={t("Objetivo: {litros} l al día", { litros: formatNumber(goalMl / 1000, 1) })}
          columns={[{ options: rangeOptions(2, 24, (n) => `${formatNumber((n * GLASS_ML) / 1000, 2)} l`).map((option) => ({ ...option, value: option.value * GLASS_ML })), value: goalMl, onChange: onGoal }]}
        />
      </View>
    </Card>
  );
}

/** Pasos de hoy: del podómetro del móvil si se puede; si no, se eligen a mano. */
export function StepsCard({
  steps,
  goal,
  status,
  onManual,
  onGoal,
}: {
  steps: number;
  goal: number;
  status: PedometerStatus;
  onManual: (steps: number) => void;
  onGoal: (steps: number) => void;
}) {
  const colors = useColors();
  const fromPhone = status === "ready";
  return (
    <Card style={{ flex: 1, minWidth: 260 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md }}>
        <Footprints size={18} color={colors.tone.positive} />
        <Txt style={{ flex: 1, fontWeight: "600" }}>{t("Pasos")}</Txt>
        <Txt variant="small" style={tabular}>
          {formatNumber(steps, 0)} / {formatNumber(goal, 0)}
        </Txt>
      </View>
      <ProgressBar value={goal > 0 ? steps / goal : 0} tone="positive" />
      <Txt variant="tiny" style={{ marginTop: space.sm }}>
        {fromPhone
          ? t("Del podómetro de tu móvil. Se actualiza solo.")
          : status === "denied"
            ? t("Sin permiso para leer los pasos del móvil. Actívalo en Ajustes → Privacidad → Movimiento y forma física, o ponlos a mano.")
            : status === "checking"
              ? t("Conectando con el podómetro del móvil…")
              : t("Este dispositivo no da los pasos: ponlos a mano.")}
      </Txt>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        {fromPhone ? null : (
          <PickerField
            title={t("Pasos de hoy")}
            display={t("Pasos de hoy: {n}", { n: formatNumber(steps, 0) })}
            columns={[{ options: rangeOptions(0, 80, (n) => formatNumber(n * 500, 0)).map((option) => ({ ...option, value: option.value * 500 })), value: Math.round(steps / 500) * 500, initial: 6000, onChange: onManual }]}
          />
        )}
        <PickerField
          title={t("Objetivo de pasos")}
          display={t("Objetivo: {n} pasos", { n: formatNumber(goal, 0) })}
          columns={[{ options: rangeOptions(2, 50, (n) => formatNumber(n * 1000, 0)).map((option) => ({ ...option, value: option.value * 1000 })), value: goal, onChange: onGoal }]}
        />
      </View>
    </Card>
  );
}

/**
 * Botón redondo de la cámara que flota abajo en Nutrición, justo encima del icono de la pestaña, y se queda
 * fijo al desplazar: abre la cámara para registrar una comida con una foto.
 */
export function CameraFab() {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/comida/foto", params: { abrir: "camara" } })}
      accessibilityRole="button"
      accessibilityLabel={t("Hacer una foto de la comida")}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.accent,
        borderWidth: 4,
        borderColor: colors.bg,
        opacity: pressed ? 0.85 : 1,
        elevation: 6,
      })}
    >
      <Camera size={28} color={colors.accentInk} />
    </Pressable>
  );
}
