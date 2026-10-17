import { Check, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { EXERCISES } from "@/domain/exercises";
import { MUSCLES, MUSCLE_LABEL } from "@/domain/types";
import { t } from "@/i18n";
import { normalizeText } from "@/lib/text";
import { radius, space, useColors } from "@/theme";
import { Input } from "./form";
import { Txt } from "./ui";

/** Buscador de ejercicios del catálogo con selección múltiple. */
export function ExercisePicker({ label, values, onChange, exclude = [] }: { label: string; values: string[]; onChange: (values: string[]) => void; exclude?: string[] }) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const needle = normalizeText(query.trim());
    return MUSCLES.map((muscle) => ({
      muscle,
      items: EXERCISES.filter((exercise) => exercise.primary === muscle && (needle === "" || normalizeText(exercise.name).includes(needle))),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  const toggle = (id: string) => onChange(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);

  return (
    <View style={{ gap: space.sm }}>
      {values.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {values.map((id) => {
            const exercise = EXERCISES.find((candidate) => candidate.id === id);
            if (!exercise) return null;
            return (
              <Pressable
                key={id}
                onPress={() => toggle(id)}
                accessibilityLabel={t("Quitar {nombre}", { nombre: exercise.name })}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accentSoft, borderRadius: radius.full, paddingLeft: 12, paddingRight: 8, height: 32 }}
              >
                <Text style={{ color: colors.accentFg, fontSize: 13, fontWeight: "500" }}>{exercise.name}</Text>
                <X size={14} color={colors.accentFg} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Input value={query} onChangeText={setQuery} placeholder={t("Buscar ejercicio…")} autoCapitalize="none" accessibilityLabel={t("{campo}: buscar", { campo: label })} />
      <View style={{ maxHeight: 260, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 6 }}>
          {groups.length === 0 ? (
            <Txt variant="small" style={{ padding: space.md }}>
              {t("Ningún ejercicio coincide con la búsqueda.")}
            </Txt>
          ) : null}
          {groups.map((group) => (
            <View key={group.muscle}>
              <Txt variant="tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 }}>
                {MUSCLE_LABEL[group.muscle]}
              </Txt>
              {group.items.map((exercise) => {
                const selected = values.includes(exercise.id);
                const disabled = exclude.includes(exercise.id);
                return (
                  <Pressable
                    key={exercise.id}
                    disabled={disabled}
                    onPress={() => toggle(exercise.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: space.sm,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      borderRadius: radius.sm,
                      backgroundColor: selected ? colors.accentFaint : "transparent",
                      opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    <Text style={{ color: selected ? colors.fg : colors.muted, fontSize: 14, flex: 1 }}>{exercise.name}</Text>
                    {selected ? <Check size={16} color={colors.accentFg} strokeWidth={3} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
