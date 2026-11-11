import { Image } from "expo-image";
import { Plus, Trash2, X } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { DateStepper, Field, Input, Toggle, UnitInput } from "@/components/form";
import { Screen } from "@/components/screen";
import { Button, Card, CardHeader, Divider, Notice, Stat, StatRow, Txt } from "@/components/ui";
import { deleteMeal, mealPhotoDisplayUri, releaseMealPhoto, storeMealPhoto } from "@/data/meal-photos";
import { saveMeal } from "@/data/meals";
import { useMutation } from "@/data/provider";
import { msg, t } from "@/i18n";
import type { FoodDataSource } from "@/integrations/nutrition/contract";
import { today } from "@/lib/dates";
import { discardTempFile } from "@/lib/temp-files";
import { formatNumber } from "@/lib/units";
import { radius, space, useColors } from "@/theme";
import {
  draftName,
  draftRange,
  draftTotals,
  draftWarnings,
  eatenAtFor,
  emptyManualItem,
  manualItem,
  withGrams,
  withItem,
  withoutItem,
  type DraftItem,
  type ManualItemForm,
  type MealDraft,
} from "./draft";

/**
 * Revisar una comida antes de guardarla (o corregir una guardada): nombre, alimentos con sus gramos,
 * totales, avisos, día y favorita. Lo usan `comida/nueva` y `comida/[id]`.
 */

const SOURCE_LABEL: Record<FoodDataSource, string> = {
  usda: msg("USDA"),
  off: msg("Open Food Facts"),
  ai: msg("estimación de la IA"),
  manual: msg("a mano"),
};

export type ExistingMeal = { id: string; date: string; eatenAt: string };

export function MealEditor({
  initial,
  existing,
  initialFavoriteId,
  onSaved,
  onDiscard,
  onDeleted,
}: {
  initial: MealDraft;
  /** La comida guardada que se corrige. */
  existing?: ExistingMeal;
  /** La favorita que coincide con esta comida al abrir (la estrella sale marcada). */
  initialFavoriteId: string | null;
  onSaved: () => void;
  onDiscard?: () => void;
  onDeleted?: () => void;
}) {
  const colors = useColors();
  const { run, pending } = useMutation();
  const [draft, setDraft] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [date, setDate] = useState(() => existing?.date ?? today());
  const [favorite, setFavorite] = useState(initialFavoriteId !== null);
  const [adding, setAdding] = useState(initial.items.length === 0);
  const [form, setForm] = useState<ManualItemForm>(emptyManualItem);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totals = draftTotals(draft);
  const range = draftRange(draft);
  const warnings = draftWarnings(draft);
  const photoUri = draft.newPhoto?.uri ?? mealPhotoDisplayUri(draft.photoUri);
  const extras = [
    totals.fiberG !== null ? t("Fibra {n} g", { n: formatNumber(totals.fiberG, 1) }) : null,
    totals.sugarG !== null ? t("Azúcar {n} g", { n: formatNumber(totals.sugarG, 1) }) : null,
    totals.sodiumMg !== null ? t("Sodio {n} mg", { n: formatNumber(totals.sodiumMg, 0) }) : null,
  ].filter((value): value is string => value !== null);

  const addItem = () => {
    const result = manualItem(form);
    if (!result.ok) return setFormError(result.error);
    setDraft((current) => withItem(current, result.item));
    setForm(emptyManualItem());
    setFormError(null);
    setAdding(false);
  };

  const save = async () => {
    setError(null);
    if (draft.items.length === 0) return setError(t("Añade al menos un alimento."));
    const outcome = await run(async (db) => {
      // La foto nueva se guarda reducida en la carpeta de la app. En la web no hay carpeta: sin foto.
      const stored = draft.newPhoto && Platform.OS !== "web" ? await storeMealPhoto(draft.newPhoto.uri, draft.newPhoto) : null;
      const result = await saveMeal(db, draft, {
        name: draftName(draft, name),
        eatenAt: eatenAtFor(date, new Date(), existing),
        photoUri: stored ?? draft.photoUri,
        favorite,
        favoriteIdBefore: initialFavoriteId,
        entryId: existing?.id,
      });
      if (!result.ok && stored) await releaseMealPhoto(db, stored);
      if (result.ok && result.releasedPhotoUri) await releaseMealPhoto(db, result.releasedPhotoUri);
      // Guardada la comida, la foto de la cámara o la galería que quedaba en la caché ya no hace falta.
      if (result.ok) discardTempFile(draft.newPhoto?.uri);
      return result;
    });
    if (!outcome) return;
    if (!outcome.ok) return setError(outcome.error);
    onSaved();
  };

  const remove = async () => {
    if (!existing) return;
    const deleted = await run((db) => deleteMeal(db, existing.id));
    if (deleted !== undefined) onDeleted?.();
  };

  return (
    <Screen
      footer={
        <View style={{ gap: space.sm }}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {onDiscard ? (
              <Button variant="secondary" onPress={onDiscard} disabled={pending} style={{ flex: 1 }}>
                {t("Descartar")}
              </Button>
            ) : null}
            <Button onPress={save} loading={pending} style={{ flex: 2 }}>
              {existing ? t("Guardar cambios") : t("Guardar comida")}
            </Button>
          </View>
        </View>
      }
    >
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: colors.raised }}
          contentFit="cover"
          accessibilityLabel={t("Foto de la comida")}
        />
      ) : null}

      <Field label={t("Nombre")}>
        <Input value={name} onChangeText={setName} placeholder={draft.items[0]?.name ?? t("Por ejemplo: desayuno")} maxLength={120} />
      </Field>

      <Card>
        <Txt variant="tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "500" }}>
          {t("Total")}
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 }}>
          <Txt variant="title" num>
            {formatNumber(totals.calories, 0)}
          </Txt>
          <Txt variant="small">kcal</Txt>
        </View>
        {range ? (
          <Txt variant="small" num style={{ marginTop: 2 }}>
            {t("Margen de la estimación: entre {min} y {max} kcal.", { min: formatNumber(range.min, 0), max: formatNumber(range.max, 0) })}
          </Txt>
        ) : null}
        <View style={{ marginTop: space.md }}>
          <StatRow>
            <Stat label={t("Proteína")} value={totals.proteinG === null ? "—" : formatNumber(totals.proteinG, 0)} unit="g" />
            <Stat label={t("Carbohidratos")} value={totals.carbsG === null ? "—" : formatNumber(totals.carbsG, 0)} unit="g" />
            <Stat label={t("Grasas")} value={totals.fatG === null ? "—" : formatNumber(totals.fatG, 0)} unit="g" />
          </StatRow>
        </View>
        {extras.length > 0 ? (
          <Txt variant="tiny" num style={{ marginTop: space.md }}>
            {extras.join(" · ")}. {t("Solo de los alimentos que traen ese dato.")}
          </Txt>
        ) : null}
      </Card>

      {warnings.length > 0 ? (
        <Notice tone="warning" title={t("Podría contener: {lista}", { lista: warnings.join(", ") })}>
          {t("Lo marca la IA según las alergias y los alimentos que evitas de tu perfil. No es seguro: compruébalo en la etiqueta o pregunta.")}
        </Notice>
      ) : null}

      <Card>
        <CardHeader title={t("Alimentos")} description={draft.items.length > 0 ? t("Corrige los gramos si los sabes: las cifras se recalculan.") : undefined} />
        <View style={{ gap: space.md }}>
          {draft.items.map((item, index) => (
            <View key={item.key} style={{ gap: space.md }}>
              {index > 0 ? <Divider /> : null}
              <ItemRow item={item} onGrams={(grams) => setDraft((current) => withGrams(current, item.key, grams))} onRemove={() => setDraft((current) => withoutItem(current, item.key))} />
            </View>
          ))}
          {draft.items.length === 0 && !adding ? <Txt variant="small">{t("No queda ningún alimento.")}</Txt> : null}
          {adding ? (
            <ManualItemFields
              form={form}
              error={formError}
              onChange={setForm}
              onAdd={addItem}
              onCancel={
                draft.items.length > 0
                  ? () => {
                      setAdding(false);
                      setFormError(null);
                    }
                  : undefined
              }
            />
          ) : (
            <Button variant="secondary" size="sm" icon={Plus} onPress={() => setAdding(true)}>
              {t("Añadir alimento")}
            </Button>
          )}
        </View>
      </Card>

      {draft.notes ? <Notice title={t("Nota de la IA")}>{draft.notes}</Notice> : null}

      <Card>
        <View style={{ gap: space.lg }}>
          <Field label={t("Día")}>
            <DateStepper value={date} onChange={setDate} />
          </Field>
          <Toggle checked={favorite} onChange={setFavorite}>
            {t("Guardar también en favoritas, para repetirla con un toque")}
          </Toggle>
        </View>
      </Card>

      <Txt variant="tiny">
        {t(
          "Las cifras son estimaciones: la IA calcula los gramos a ojo y las bases de datos dan valores medios. Si conoces el peso, corrígelo.",
        )}
      </Txt>

      {existing ? (
        confirmDelete ? (
          <Card style={{ gap: space.md }}>
            <Txt>{t("¿Borrar esta comida? No se puede deshacer.")}</Txt>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button variant="danger" icon={Trash2} onPress={remove} loading={pending}>
                {t("Borrar")}
              </Button>
              <Button variant="secondary" onPress={() => setConfirmDelete(false)} disabled={pending}>
                {t("Cancelar")}
              </Button>
            </View>
          </Card>
        ) : (
          <Button variant="danger" icon={Trash2} onPress={() => setConfirmDelete(true)}>
            {t("Borrar comida")}
          </Button>
        )
      ) : null}
    </Screen>
  );
}

function ItemRow({ item, onGrams, onRemove }: { item: DraftItem; onGrams: (grams: number) => void; onRemove: () => void }) {
  const colors = useColors();
  const [text, setText] = useState(String(item.grams));
  const unsure = item.confidence !== null && item.confidence < 0.5;
  // Con qué alimento de la base de datos coincidió, si no es el mismo nombre.
  const showMatch = item.matchedName && item.dataSource !== "ai" && item.dataSource !== "manual" && item.matchedName.trim().toLowerCase() !== item.name.trim().toLowerCase();
  const matched = showMatch ? ` («${item.matchedName}»)` : "";

  const change = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "").slice(0, 4);
    setText(digits);
    if (digits) onGrams(Math.min(5000, Number(digits)));
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt numberOfLines={2}>{item.name}</Txt>
        <Txt variant="tiny" num numberOfLines={2}>
          {formatNumber(item.calories, 0)} kcal · {t(SOURCE_LABEL[item.dataSource])}
          {matched}
        </Txt>
        {unsure ? (
          <Txt variant="tiny" style={{ color: colors.warning }}>
            {t("Poco seguro: comprueba qué es y cuánto.")}
          </Txt>
        ) : null}
      </View>
      <UnitInput
        value={text}
        onChangeText={change}
        onBlur={() => setText(String(item.grams))}
        unit="g"
        integer
        maxLength={4}
        accessibilityLabel={t("Gramos de {alimento}", { alimento: item.name })}
        style={{ width: 92 }}
      />
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("Quitar {alimento}", { alimento: item.name })} style={{ padding: 4 }}>
        <X size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function ManualItemFields({
  form,
  error,
  onChange,
  onAdd,
  onCancel,
}: {
  form: ManualItemForm;
  error: string | null;
  onChange: (form: ManualItemForm) => void;
  onAdd: () => void;
  onCancel?: () => void;
}) {
  const colors = useColors();
  const set = (key: keyof ManualItemForm) => (value: string) => onChange({ ...form, [key]: value });
  return (
    <View style={{ gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.bg }}>
      <Txt variant="label">{t("Añadir un alimento")}</Txt>
      <Field label={t("Qué es")}>
        <Input value={form.name} onChangeText={set("name")} placeholder={t("Por ejemplo: manzana")} maxLength={120} />
      </Field>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Field label={t("Cantidad")} style={{ flex: 1 }}>
          <UnitInput value={form.grams} onChangeText={set("grams")} unit="g" />
        </Field>
        <Field label={t("Calorías")} style={{ flex: 1 }}>
          <UnitInput value={form.calories} onChangeText={set("calories")} unit="kcal" />
        </Field>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Field label={t("Proteína")} optional style={{ flex: 1 }}>
          <UnitInput value={form.proteinG} onChangeText={set("proteinG")} unit="g" />
        </Field>
        <Field label={t("Hidratos")} optional style={{ flex: 1 }}>
          <UnitInput value={form.carbsG} onChangeText={set("carbsG")} unit="g" />
        </Field>
        <Field label={t("Grasas")} optional style={{ flex: 1 }}>
          <UnitInput value={form.fatG} onChangeText={set("fatG")} unit="g" />
        </Field>
      </View>
      {error ? (
        <Txt variant="small" style={{ color: colors.danger }}>
          {error}
        </Txt>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button size="sm" onPress={onAdd}>
          {t("Añadir")}
        </Button>
        {onCancel ? (
          <Button size="sm" variant="ghost" onPress={onCancel}>
            {t("Cancelar")}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
