import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "@/i18n";
import { radius, space, tabular, useColors } from "@/theme";
import type { Option } from "./form";
import { Button, Txt } from "./ui";

/**
 * Campo de selección: se toca y sale una lista desde abajo para elegir sin teclado (edad, altura,
 * peso, país…). Con una columna se cierra al elegir; con varias (kilos y decimales) se cierra con
 * «Listo». Funciona igual en el móvil y en la web.
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

const ROW = 48;
const VISIBLE_ROWS = 6;

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
  const [open, setOpen] = useState(false);
  const single = columns.length === 1;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityValue={{ text: display ?? t("Sin elegir") }}
        style={[styles.field, { borderColor: colors.lineStrong, backgroundColor: colors.raised }]}
      >
        <Text style={[{ flex: 1, fontSize: 16, color: display ? colors.fg : colors.subtle }, tabular]} numberOfLines={1}>
          {display ?? placeholder ?? t("Elegir")}
        </Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)} accessibilityLabel={t("Cerrar")} />
        <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.line }]}>
          <Txt variant="label" style={{ textAlign: "center" }}>
            {title}
          </Txt>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {columns.map((column, index) => (
              <PickerList
                key={index}
                column={column}
                onPick={(value) => {
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
      </Modal>
    </>
  );
}

function PickerList<T extends string | number>({ column, onPick }: { column: PickerColumn<T>; onPick: (value: T) => void }) {
  const colors = useColors();
  const target = column.value ?? column.initial ?? null;
  const found = target === null ? -1 : column.options.findIndex((option) => option.value === target);
  // La elegida (o la inicial) queda hacia el centro de la lista.
  const start = Math.max(0, Math.min(found - Math.floor(VISIBLE_ROWS / 2) + 1, column.options.length - VISIBLE_ROWS));

  return (
    <View style={{ flex: column.flex ?? 1, height: ROW * VISIBLE_ROWS, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
      <FlatList
        data={column.options}
        keyExtractor={(option) => String(option.value)}
        initialScrollIndex={found >= 0 ? start : 0}
        getItemLayout={(_, index) => ({ length: ROW, offset: ROW * index, index })}
        initialNumToRender={VISIBLE_ROWS + 4}
        accessibilityLabel={column.accessibilityLabel}
        renderItem={({ item }) => {
          const selected = item.value === column.value;
          return (
            <Pressable
              onPress={() => onPick(item.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.row, selected && { backgroundColor: colors.accentSoft }]}
            >
              <Text style={[{ fontSize: 17, color: selected ? colors.accentFg : colors.fg, fontWeight: selected ? "700" : "400" }, tabular]} numberOfLines={1}>
                {item.label}
              </Text>
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
  backdrop: { flex: 1 },
  sheet: {
    gap: space.lg,
    padding: space.lg,
    paddingBottom: space.xxl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
  },
  row: { height: ROW, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm },
});
