import { Minus, Plus } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Field } from "@/components/form";
import { PickerField } from "@/components/Picker";
import { Button, Notice, Txt } from "@/components/ui";
import { CALORIE_MAX, SPLIT_LIMITS, checkManualTarget, gramsFromSplit, splitFromGrams, type MacroSplit } from "@/domain/nutrition/macros";
import { t } from "@/i18n";
import { formatNumber } from "@/lib/units";
import { radius, space, tabular, useColors } from "@/theme";

type Target = { calories: number; proteinG: number; carbsG: number; fatG: number; manual?: MacroSplit };

/**
 * Hoja para cambiar el objetivo diario: calorías (de 50 en 50) y reparto de macros en porcentajes (de 5 en
 * 5). Los gramos salen del reparto, así que siempre cuadran con las calorías.
 */
export function TargetEditor({
  visible,
  target,
  floor,
  saving,
  onClose,
  onSave,
  onAutomatic,
}: {
  visible: boolean;
  target: Target;
  /** Mínimo de seguridad según el sexo (`calorieFloor`). */
  floor: number;
  saving: boolean;
  onClose: () => void;
  onSave: (calories: number, split: MacroSplit) => void;
  /** Volver al objetivo calculado con el perfil. */
  onAutomatic: () => void;
}) {
  const colors = useColors();
  const [calories, setCalories] = useState(target.calories);
  const [split, setSplit] = useState<MacroSplit>(target.manual ?? splitFromGrams(target.calories, target));
  const grams = gramsFromSplit(calories, split);
  const total = split.protein + split.carbs + split.fat;
  const problem = checkManualTarget(calories, split, floor);

  const options = [];
  for (let value = Math.ceil(floor / 50) * 50; value <= CALORIE_MAX; value += 50) options.push({ value, label: `${formatNumber(value, 0)} kcal` });

  const rows: { key: keyof MacroSplit; label: string; grams: number }[] = [
    { key: "protein", label: t("Proteína"), grams: grams.proteinG },
    { key: "carbs", label: t("Carbohidratos"), grams: grams.carbsG },
    { key: "fat", label: t("Grasas"), grams: grams.fatG },
  ];
  const change = (key: keyof MacroSplit, delta: number) => {
    const [min, max] = SPLIT_LIMITS[key];
    setSplit((current) => ({ ...current, [key]: Math.min(max, Math.max(min, current[key] + delta)) }));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel={t("Cerrar")} />
      <View style={{ maxHeight: "88%", backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1, borderColor: colors.line }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.lg }}>
          <Txt variant="h2">{t("Tu objetivo diario")}</Txt>
          <Field label={t("Calorías al día")} hint={t("El mínimo de seguridad para ti es {kcal} kcal.", { kcal: formatNumber(floor, 0) })}>
            <PickerField
              title={t("Calorías al día")}
              display={`${formatNumber(calories, 0)} kcal`}
              columns={[{ options, value: calories, onChange: setCalories }]}
            />
          </Field>
          <Field label={t("Reparto de macronutrientes")} hint={t("En % de las calorías. Los gramos se calculan solos.")}>
            <View style={{ gap: space.sm }}>
              {rows.map((row) => (
                <View key={row.key} style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: "600" }}>{row.label}</Txt>
                    <Txt variant="tiny" style={tabular}>
                      {formatNumber(row.grams, 0)} g
                    </Txt>
                  </View>
                  <StepButton icon="minus" label={t("Menos: {campo}", { campo: row.label })} onPress={() => change(row.key, -5)} />
                  <Txt style={[{ width: 52, textAlign: "center", fontSize: 18, fontWeight: "700" }, tabular]}>{split[row.key]} %</Txt>
                  <StepButton icon="plus" label={t("Más: {campo}", { campo: row.label })} onPress={() => change(row.key, 5)} />
                </View>
              ))}
            </View>
          </Field>
          <Txt variant="small" style={[{ color: total === 100 ? colors.muted : colors.tone.danger }, tabular]}>
            {t("Suma: {total} %", { total })}
          </Txt>
          {problem && total === 100 ? <Notice tone="warning">{t(problem)}</Notice> : null}
          <Button size="lg" full onPress={() => onSave(calories, split)} disabled={problem !== null} loading={saving}>
            {t("Guardar objetivo")}
          </Button>
          <Button variant="ghost" full onPress={onAutomatic} disabled={saving}>
            {t("Volver al cálculo automático")}
          </Button>
        </ScrollView>
      </View>
    </Modal>
  );
}

function StepButton({ icon, label, onPress }: { icon: "minus" | "plus"; label: string; onPress: () => void }) {
  const colors = useColors();
  const Icon = icon === "minus" ? Minus : Plus;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.hover : colors.raised, borderWidth: 1, borderColor: colors.lineStrong })}
    >
      <Icon size={18} color={colors.fg} />
    </Pressable>
  );
}
