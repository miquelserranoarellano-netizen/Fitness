import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Txt } from "@/components/ui";
import type { DayStatus } from "@/domain/nutrition/intake";
import { t } from "@/i18n";
import { formatNumber } from "@/lib/units";
import { space, tabular, useColors } from "@/theme";

const DOTS = 56;

/**
 * Objetivo diario como un anillo de puntos que se va llenando con lo comido. En el centro, lo que queda
 * (o cuánto te has pasado). Color: el del tema mientras se avanza, verde al llegar al margen bueno
 * (90-105 %) y rojo si te pasas.
 */
export function CalorieRing({ consumed, goal, status, size = 236 }: { consumed: number; goal: number; status: DayStatus; size?: number }) {
  const colors = useColors();
  const fill = status === "good" ? colors.tone.positive : status === "bad" ? colors.tone.danger : colors.accentFg;
  const ratio = goal > 0 ? consumed / goal : 0;
  const filled = Math.min(DOTS, Math.round(Math.min(1, ratio) * DOTS));
  const center = size / 2;
  const dot = size * 0.028;
  const radius = center - dot * 2;
  const remaining = Math.round(goal - consumed);
  const over = remaining < 0;

  return (
    <View
      style={{ width: size, height: size, alignSelf: "center", alignItems: "center", justifyContent: "center" }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("Calorías de hoy")}
      accessibilityValue={{ min: 0, max: Math.round(goal), now: Math.round(consumed), text: over ? t("Te has pasado {kcal} kcal", { kcal: formatNumber(-remaining, 0) }) : t("Te quedan {kcal} kcal", { kcal: formatNumber(remaining, 0) }) }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {Array.from({ length: DOTS }, (_, index) => {
          // Desde arriba, en el sentido de las agujas del reloj.
          const angle = (index / DOTS) * 2 * Math.PI - Math.PI / 2;
          const on = index < filled;
          return (
            <Circle
              key={index}
              cx={center + radius * Math.cos(angle)}
              cy={center + radius * Math.sin(angle)}
              r={on ? dot : dot * 0.7}
              fill={on ? fill : colors.ringTrack}
            />
          );
        })}
      </Svg>
      <View style={{ alignItems: "center", gap: 2, paddingHorizontal: space.xl }}>
        <Txt variant="small">{over ? t("Te has pasado") : t("Te quedan")}</Txt>
        <Txt style={[{ fontSize: 44, lineHeight: 50, fontWeight: "700", color: over ? colors.tone.danger : colors.fg }, tabular]}>
          {formatNumber(Math.abs(remaining), 0)}
        </Txt>
        <Txt variant="small">kcal</Txt>
        <Txt variant="tiny" style={[{ marginTop: space.xs }, tabular]}>
          {t("{comido} de {objetivo} kcal", { comido: formatNumber(consumed, 0), objetivo: formatNumber(goal, 0) })}
        </Txt>
      </View>
    </View>
  );
}

/** Proteína, carbohidratos y grasas de hoy frente a su objetivo. */
export function MacroBars({ consumed, target }: { consumed: { proteinG: number | null; carbsG: number | null; fatG: number | null }; target: { proteinG: number; carbsG: number; fatG: number } }) {
  const rows = [
    { label: t("Proteína"), value: consumed.proteinG ?? 0, goal: target.proteinG, tone: "info" as const },
    { label: t("Carbohidratos"), value: consumed.carbsG ?? 0, goal: target.carbsG, tone: "warning" as const },
    { label: t("Grasas"), value: consumed.fatG ?? 0, goal: target.fatG, tone: "accent" as const },
  ];
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      {rows.map((row) => (
        <MacroBar key={row.label} {...row} />
      ))}
    </View>
  );
}

function MacroBar({ label, value, goal, tone }: { label: string; value: number; goal: number; tone: "info" | "warning" | "accent" }) {
  const colors = useColors();
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const over = value > goal * 1.1;
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Txt variant="tiny" style={{ fontWeight: "500" }}>
        {label}
      </Txt>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 3, backgroundColor: over ? colors.tone.danger : colors.tone[tone] }} />
      </View>
      <Txt variant="small" style={[{ color: colors.fg }, tabular]}>
        {formatNumber(value, 0)}
        <Txt variant="tiny">{` / ${formatNumber(goal, 0)} g`}</Txt>
      </Txt>
    </View>
  );
}
