import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/i18n";
import { radius, space, tabular, useColors } from "@/theme";
import type { Option } from "./form";
import { Button } from "./ui";

/**
 * Campo de selección: se toca y sube una tarjeta de cristal (fondo desenfocado y translúcido) para elegir sin
 * teclado (edad, altura, peso, país…). Con una columna se cierra al elegir; con varias (kilos y decimales) se
 * cierra con «Listo». Funciona igual en el móvil y en la web (en Android, sin desenfoque: translúcida).
 */

export type PickerColumn<T extends string | number> = {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Dónde abrir la lista si aún no hay nada elegido (p. ej. 25 años, 170 cm). */
  initial?: T;
  /** Ancho relativo de la columna (por defecto 1). */
  flex?: number;
  accessibilityLabel?: string;
};

const ROW = 50;
const VISIBLE_ROWS = 5;

export function PickerField<T extends string | number>({
  title,
  display,
  placeholder,
  columns,
  accessibilityLabel,
}: {
  /** Título de la lista (suele ser la etiqueta del campo). */
  title: string;
  /** Lo que se enseña en el campo; null si aún no hay nada elegido. */
  display: string | null;
  placeholder?: string;
  columns: PickerColumn<T>[];
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const single = columns.length === 1;
  const dark = colors.scheme === "dark";

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityValue={{ text: display ?? t("Sin elegir") }}
        style={({ pressed }) => [styles.field, { borderColor: colors.lineStrong, backgroundColor: colors.raised, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={[{ flex: 1, fontSize: 16, color: display ? colors.fg : colors.subtle }, tabular]} numberOfLines={1}>
          {display ?? placeholder ?? t("Elegir")}
        </Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.modal}>
          {/* Fondo: lo de detrás, desenfocado y algo oscurecido. Tocarlo cierra. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel={t("Cerrar")}>
            <BlurView intensity={dark ? 30 : 18} tint={dark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(0,0,0,0.45)" : "rgba(18,21,19,0.22)" }]} />
          </Pressable>

          <View
            style={[
              styles.sheet,
              {
                marginBottom: insets.bottom + space.md,
                borderColor: dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.75)",
                shadowColor: "#000",
              },
            ]}
          >
            <BlurView intensity={80} tint={dark ? "systemThickMaterialDark" : "systemThickMaterialLight"} style={StyleSheet.absoluteFill} />
            {/* Capa de color sobre el cristal: legible aunque el sistema no desenfoque (Android). */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(23,24,27,0.72)" : "rgba(255,255,255,0.74)" }]} />

            <View style={styles.content}>
              <View style={[styles.handle, { backgroundColor: dark ? "rgba(255,255,255,0.25)" : "rgba(18,21,19,0.18)" }]} />
              <Text style={[styles.title, { color: colors.fg }]}>{title}</Text>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {columns.map((column, index) => (
                  <PickerList
                    key={index}
                    column={column}
                    onPick={(value) => {
                      if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => undefined);
                      column.onChange(value);
                      if (single) setOpen(false);
                    }}
                  />
                ))}
              </View>
              {single ? null : (
                <Button size="lg" full onPress={() => setOpen(false)}>
                  {t("Listo")}
                </Button>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function PickerList<T extends string | number>({ column, onPick }: { column: PickerColumn<T>; onPick: (value: T) => void }) {
  const colors = useColors();
  const target = column.value ?? column.initial ?? null;
  const found = target === null ? -1 : column.options.findIndex((option) => option.value === target);
  // La elegida (o la inicial) queda en el centro de la lista.
  const start = Math.max(0, Math.min(found - Math.floor(VISIBLE_ROWS / 2), column.options.length - VISIBLE_ROWS));

  return (
    <View style={{ flex: column.flex ?? 1, height: ROW * VISIBLE_ROWS }}>
      <FlatList
        data={column.options}
        keyExtractor={(option) => String(option.value)}
        initialScrollIndex={found >= 0 ? start : 0}
        getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
        initialNumToRender={VISIBLE_ROWS + 4}
        showsVerticalScrollIndicator={false}
        accessibilityLabel={column.accessibilityLabel}
        renderItem={({ item }) => {
          const selected = item.value === column.value;
          return (
            <Pressable
              onPress={() => onPick(item.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.row,
                selected && { backgroundColor: colors.accentSoft },
                pressed && !selected && { backgroundColor: colors.trackFaint },
              ]}
            >
              <Text
                style={[{ fontSize: 18, color: selected ? colors.accentFg : colors.fg, fontWeight: selected ? "600" : "400", letterSpacing: -0.2 }, tabular]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {selected ? <Check size={18} color={colors.accentFg} strokeWidth={2.5} style={styles.check} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

/** Números de `from` a `to` como opciones, con la unidad en la etiqueta («25 años»). */
export function rangeOptions(from: number, to: number, label: (value: number) => string = String): Option<number>[] {
  const out: Option<number>[] = [];
  for (let value = from; value <= to; value++) out.push({ value, label: label(value) });
  return out;
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  modal: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 10 },
  sheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: space.md,
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 12,
  },
  content: { gap: space.md, paddingHorizontal: space.sm, paddingTop: space.sm, paddingBottom: space.lg },
  handle: { alignSelf: "center", width: 38, height: 5, borderRadius: 3, marginBottom: 2 },
  title: { fontSize: 17, fontWeight: "600", textAlign: "center", letterSpacing: -0.2 },
  row: { height: ROW, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  check: { position: "absolute", right: space.md },
});
