import { Check, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from "react-native";
import { t } from "@/i18n";
import { addDays, daysBetween, formatDate, today } from "@/lib/dates";
import { radius, space, tabular, useColors, type Palette } from "@/theme";
import { Txt } from "./ui";

export type Option<T> = { value: T; label: string; description?: string };

/** Caja de campo: borde y fondo del tema. */
const box = (colors: Palette) => ({ borderColor: colors.lineStrong, backgroundColor: colors.raised });

export function Field({ label, hint, optional, children, style }: { label: string; hint?: string; optional?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View style={[{ gap: 6 }, style]}>
      <Txt variant="label">
        {label}
        {optional ? <Text style={{ color: colors.subtle, fontWeight: "400" }}> · {t("opcional")}</Text> : null}
      </Txt>
      {children}
      {hint ? <Txt variant="tiny">{hint}</Txt> : null}
    </View>
  );
}

type InputProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  multiline?: boolean;
  onBlur?: () => void;
  autoCapitalize?: "none" | "sentences" | "words";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Input({ value, onChangeText, placeholder, keyboardType, maxLength, multiline, onBlur, autoCapitalize = "sentences", style, accessibilityLabel }: InputProps) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      placeholder={placeholder}
      placeholderTextColor={colors.subtle}
      keyboardType={keyboardType}
      maxLength={maxLength}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      accessibilityLabel={accessibilityLabel}
      style={[styles.input, box(colors), { color: colors.fg }, multiline && { minHeight: 84, paddingTop: 12, textAlignVertical: "top" }, style as object]}
    />
  );
}

/** Campo numérico con la unidad al final («kg», «cm», «años»…). */
export function UnitInput({ unit, integer, style, ...props }: Omit<InputProps, "keyboardType" | "multiline"> & { unit: string; integer?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.input, box(colors), { flexDirection: "row", alignItems: "center", paddingRight: 12 }, style]}>
      <TextInput
        {...props}
        placeholderTextColor={colors.subtle}
        keyboardType={integer ? "number-pad" : "decimal-pad"}
        style={[{ flex: 1, minWidth: 0, width: "100%", color: colors.fg, fontSize: 16, height: "100%" }, tabular]}
      />
      <Txt variant="small" style={{ flexShrink: 0, marginLeft: 6 }}>
        {unit}
      </Txt>
    </View>
  );
}

/** Una opción entre pocas, en fila. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  columns,
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Reparte las opciones en una rejilla de N columnas en vez de una sola fila. */
  columns?: number;
}) {
  const colors = useColors();
  // Con muchas opciones en una sola fila, letra algo menor para que ninguna palabra se parta.
  const dense = !columns && options.length >= 4;
  return (
    <View style={[styles.segmented, columns ? { flexWrap: "wrap" } : null]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              box(colors),
              columns ? { flexBasis: `${100 / columns - 2}%`, flexGrow: 1 } : { flex: 1 },
              dense && { paddingHorizontal: 2 },
              selected && { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
            ]}
          >
            <Text
              style={[{ color: selected ? colors.accentFg : colors.muted, fontSize: dense ? 13 : 14, fontWeight: "600", textAlign: "center" }, tabular]}
              numberOfLines={2}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Varias opciones a la vez, como etiquetas. */
export function Chips<T extends string | number>({ options, values, onChange }: { options: Option<T>[]; values: T[]; onChange: (values: T[]) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(selected ? values.filter((value) => value !== option.value) : [...values, option.value])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            style={[styles.chip, box(colors), selected && { backgroundColor: colors.accentSoft, borderColor: colors.accentLine }]}
          >
            {selected ? <Check size={14} color={colors.accentFg} strokeWidth={3} /> : null}
            <Text style={{ color: selected ? colors.accentFg : colors.muted, fontSize: 14, fontWeight: "500" }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Una opción entre varias, con explicación. */
export function OptionCards<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T | null; onChange: (value: T) => void }) {
  const colors = useColors();
  return (
    <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.optionCard, box(colors), selected && { borderColor: colors.accentLine, backgroundColor: colors.accentFaint }]}
          >
            <View style={[styles.radio, { borderColor: selected ? colors.accentFg : colors.subtle }]}>
              {selected ? <View style={[styles.radioDot, { backgroundColor: colors.accentFg }]} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: "500" }}>{option.label}</Txt>
              {option.description ? (
                <Txt variant="small" style={{ marginTop: 2 }}>
                  {option.description}
                </Txt>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Casilla con texto (sí/no). */
export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  const colors = useColors();
  return (
    <Pressable onPress={() => onChange(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }} style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
      <View style={[styles.checkbox, { borderColor: colors.subtle }, checked && { backgroundColor: colors.accent, borderColor: colors.accentBorder }]}>
        {checked ? <Check size={14} color={colors.accentInk} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Txt variant="muted">{children}</Txt> : children}</View>
    </Pressable>
  );
}

/** Selector de fecha por días (hoy y hacia atrás), sin calendario nativo. */
export function DateStepper({ value, onChange, min }: { value: string; onChange: (date: string) => void; min?: string }) {
  const colors = useColors();
  const max = today();
  const canNext = value < max;
  const canPrev = !min || value > min;
  const label = value === max ? t("Hoy") : daysBetween(value, max) === 1 ? t("Ayer") : formatDate(value);
  return (
    <View style={[styles.input, box(colors), { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 }]}>
      <Pressable onPress={() => canPrev && onChange(addDays(value, -1))} style={styles.stepperButton} accessibilityLabel={t("Día anterior")}>
        <ChevronLeft size={18} color={canPrev ? colors.fg : colors.subtle} />
      </Pressable>
      <View style={{ flex: 1, alignItems: "center" }}>
        <Txt style={{ fontWeight: "500" }}>{label}</Txt>
      </View>
      <Pressable onPress={() => canNext && onChange(addDays(value, 1))} style={styles.stepperButton} accessibilityLabel={t("Día siguiente")}>
        <ChevronRight size={18} color={canNext ? colors.fg : colors.subtle} />
      </Pressable>
    </View>
  );
}

/** Número con botones − y + (modo entrenamiento). */
export function NumberStepper({
  label,
  value,
  onChange,
  onMinus,
  onPlus,
  placeholder,
  integer,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  placeholder?: string;
  integer?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Txt variant="tiny" style={{ fontWeight: "500", color: colors.muted }}>
        {label}
      </Txt>
      <View style={[styles.numberStepper, box(colors)]}>
        <Pressable onPress={onMinus} style={styles.stepperSide} accessibilityLabel={t("Menos: {campo}", { campo: label })}>
          <Minus size={18} color={colors.muted} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.subtle}
          keyboardType={integer ? "number-pad" : "decimal-pad"}
          accessibilityLabel={label}
          style={[{ flex: 1, minWidth: 0, width: "100%", textAlign: "center", color: colors.fg, fontSize: 20, fontWeight: "600" }, tabular]}
        />
        <Pressable onPress={onPlus} style={styles.stepperSide} accessibilityLabel={t("Más: {campo}", { campo: label })}>
          <Plus size={18} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

export const optionsOf = <T extends string>(values: readonly T[], labels: Record<T, string>): Option<T>[] => values.map((value) => ({ value, label: labels[value] }));

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  segmented: {
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  optionCard: {
    flexDirection: "row",
    gap: space.md,
    alignItems: "flex-start",
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepperButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  numberStepper: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  stepperSide: { width: 44, alignItems: "center", justifyContent: "center" },
});
