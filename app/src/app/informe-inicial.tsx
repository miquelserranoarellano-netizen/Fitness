import { router } from "expo-router";
import { ArrowRight, Pencil } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { RangeBars } from "@/components/charts";
import { Loading, Screen } from "@/components/screen";
import { Button, Card, CardHeader, Notice, Stat, StatRow, Txt } from "@/components/ui";
import { getActiveBlock, getBlockByNumber } from "@/data/blocks";
import { listMeasurements, listWeights } from "@/data/body";
import { listNutritionTargets } from "@/data/nutrition";
import { getLimitations, requireProfile, type Profile } from "@/data/profile";
import { useMutation, useQuery } from "@/data/provider";
import { updateProfileAndReplan } from "@/data/services";
import { exerciseName } from "@/domain/exercises";
import { SPLIT_LABEL, estimateSessionMinutes } from "@/domain/training/plan";
import { GOAL_LABEL, LEVEL_LABEL, MEASURES, MEASURE_LABEL, MUSCLES, MUSCLE_LABEL } from "@/domain/types";
import { draftFromProfile, profileFromDraft, validateStep, type Draft, type StepId } from "@/features/onboarding/draft";
import { AvailabilitySection, ExperienceSection, GoalsSection, PersonalSection } from "@/features/profile/sections";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { formatRange } from "@/lib/format";
import { formatLength, formatNumber, formatSigned, formatWeight } from "@/lib/units";
import { radius, space, useColors } from "@/theme";

/** Partes del perfil que se pueden cambiar desde el informe. */
type EditPart = "you" | "training";

const PART_STEPS: Record<EditPart, StepId[]> = { you: ["personal", "goals"], training: ["experience", "availability"] };

/**
 * El informe con el que empiezas: tu punto de partida, la rutina y las calorías. Cada parte se puede cambiar
 * («Cambiar»): al guardar se vuelven a calcular la rutina y el objetivo, y el informe enseña lo vigente.
 */
export default function InitialReport() {
  const colors = useColors();
  const { run, pending } = useMutation();
  const [editing, setEditing] = useState<EditPart | null>(null);
  const [message, setMessage] = useState<{ tone: "positive" | "warning" | "danger"; text: string } | null>(null);
  const query = useQuery(async (db) => ({
    profile: await requireProfile(db),
    block: (await getActiveBlock(db)) ?? (await getBlockByNumber(db, 1)),
    targets: await listNutritionTargets(db),
    weights: await listWeights(db),
    measurements: await listMeasurements(db),
    limitations: await getLimitations(db),
  }));
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { profile, block, targets, weights, measurements, limitations } = query.data;
  // Lo vigente: el último objetivo (los cambios hechos aquí lo recalculan).
  const nutrition = targets[0] ?? null;
  const firstWeight = weights[0] ?? null;
  const firstMeasures = measurements[0] ?? null;
  const known = firstMeasures ? MEASURES.filter((measure) => firstMeasures.values[measure] !== null) : [];
  const missing = MEASURES.filter((measure) => !known.includes(measure));
  const { units } = profile;

  return (
    <Screen
      title={t("Tu informe inicial")}
      description={
        block
          ? t("Punto de partida a {fecha}. Todo lo que ves aquí sale de reglas explícitas aplicadas a tus respuestas: ninguna cifra está inventada.", {
              fecha: formatDate(block.startedOn),
            })
          : undefined
      }
      footer={
        <Button size="lg" full onPress={() => router.replace("/inicio")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Txt style={{ color: colors.accentInk, fontWeight: "600" }}>{t("Ir al inicio")}</Txt>
            <ArrowRight size={18} color={colors.accentInk} />
          </View>
        </Button>
      }
    >
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Card>
        <CardHeader title={t("Punto de partida")} action={<EditButton onPress={() => setEditing("you")} />} />
        <StatRow>
          <Stat label={t("Objetivo")} value={<Txt variant="h2">{GOAL_LABEL[profile.primaryGoal]}</Txt>} />
          {firstWeight ? <Stat label={t("Peso inicial")} value={formatWeight(firstWeight.kg, units)} /> : null}
          <Stat label={t("Altura")} value={formatLength(profile.heightCm, units, 0)} />
          {block ? <Stat label={t("Nivel")} value={<Txt variant="h2">{LEVEL_LABEL[block.rationale.level]}</Txt>} /> : null}
        </StatRow>
        {block ? (
          <Txt variant="small" style={{ marginTop: space.md }}>
            {block.rationale.levelReasons.join(" ")}
          </Txt>
        ) : null}
      </Card>

      {block ? (
        <>
          <Card>
            <CardHeader
              action={<EditButton onPress={() => setEditing("training")} />}
              title={t("Tu rutina: {rutina}", { rutina: SPLIT_LABEL[block.split] })}
              description={t("Bloque {n} de {semanas} semanas. {progresion}", { n: block.number, semanas: block.weeksPlanned, progresion: block.rationale.expectedProgression })}
            />
            <View style={{ gap: space.md }}>
              {block.rationale.rationale.map((item) => (
                <View key={item.title}>
                  <Txt variant="label">{item.title}</Txt>
                  <Txt variant="small" style={{ marginTop: 2 }}>
                    {item.detail}
                  </Txt>
                </View>
              ))}
              {block.rationale.warnings.map((warning) => (
                <Notice key={warning} tone="warning">
                  {warning}
                </Notice>
              ))}
            </View>
            <View style={{ gap: space.sm, marginTop: space.lg }}>
              {block.days.map((day) => (
                <View key={day.id} style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                    <Txt style={{ fontWeight: "600" }}>{day.name}</Txt>
                    <Txt variant="tiny">~{estimateSessionMinutes(day.exercises)} min</Txt>
                  </View>
                  {day.exercises.map((exercise) => (
                    <View key={exercise.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                      <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>
                        {exerciseName(exercise.exerciseId)}
                      </Txt>
                      <Txt variant="tiny" num>
                        {exercise.sets} × {formatRange(exercise.repMin, exercise.repMax)}
                      </Txt>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Card>

          <Card>
            <CardHeader
              title={t("Reparto del volumen semanal")}
              description={t("Series por semana y grupo muscular frente al rango recomendado para tu nivel. Tus prioridades reciben más.")}
            />
            <RangeBars
              unit={t("series")}
              items={MUSCLES.map((muscle) => ({
                id: muscle,
                label: MUSCLE_LABEL[muscle],
                value: block.rationale.weeklyVolume[muscle],
                min: block.rationale.volumeTargets[muscle].min,
                max: block.rationale.volumeTargets[muscle].max,
                tag: block.rationale.priorityMuscles.includes(muscle) ? t("prioridad") : undefined,
              }))}
            />
          </Card>
        </>
      ) : null}

      {nutrition ? (
        <Card>
          <CardHeader
            action={<EditButton label={t("Editar")} onPress={() => router.push("/nutricion")} />}
            title={t("Tu objetivo nutricional")}
            description={t("Estimaciones para empezar. Se corrigen con la tendencia real de tu peso a lo largo de varias semanas.")}
          />
          <StatRow>
            <Stat label={t("Calorías diarias")} value={`≈ ${formatNumber(nutrition.calories, 0)}`} unit="kcal" />
            <Stat label={t("Proteína")} value={nutrition.proteinG} unit="g" />
            <Stat label={t("Carbohidratos")} value={nutrition.carbsG} unit="g" />
            <Stat label={t("Grasas")} value={nutrition.fatG} unit="g" />
          </StatRow>
          <Txt variant="small" style={{ marginTop: space.md }}>
            {t(
              "Gasto diario estimado: unas {gasto} kcal (entre {desde} y {hasta}), con un ajuste de {ajuste} kcal por tu objetivo. Ritmo de peso buscado: de {ritmoDesde} a {ritmoHasta} % semanal.",
              {
                gasto: formatNumber(nutrition.method.maintenance, 0),
                desde: formatNumber(nutrition.method.maintenanceRange[0], 0),
                hasta: formatNumber(nutrition.method.maintenanceRange[1], 0),
                ajuste: formatSigned(nutrition.method.adjustment, 0),
                ritmoDesde: formatSigned(nutrition.method.targetRatePct[0], 2),
                ritmoHasta: formatSigned(nutrition.method.targetRatePct[1], 2),
              },
            )}
          </Txt>
          {nutrition.method.notes.map((note) => (
            <Txt key={note} variant="small" style={{ marginTop: space.sm }}>
              {note}
            </Txt>
          ))}
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t("Medidas de partida")} action={<EditButton label={t("Añadir")} onPress={() => router.push("/cuerpo")} />} />
        {known.length > 0 && firstMeasures ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.lg }}>
            {known.map((measure) => (
              <View key={measure} style={{ width: "46%", flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <Txt variant="small">{MEASURE_LABEL[measure]}</Txt>
                <Txt variant="label" num>
                  {formatLength(firstMeasures.values[measure] ?? 0, units)}
                </Txt>
              </View>
            ))}
          </View>
        ) : (
          <Txt variant="small">{t("No has indicado ninguna medida todavía.")}</Txt>
        )}
        {missing.length > 0 ? (
          <Txt variant="tiny" style={{ marginTop: space.md }}>
            {t("Sin medir: {medidas}. Puedes añadirlas en «Cuerpo» cuando quieras; sin ellas no se puede valorar la evolución de esas zonas.", {
              medidas: missing.map((measure) => MEASURE_LABEL[measure].toLowerCase()).join(", "),
            })}
          </Txt>
        ) : null}
      </Card>

      <Card>
        <CardHeader title={t("Qué viene ahora")} />
        <View style={{ gap: space.md }}>
          <Next title={t("Primera semana: calibrar.")}>
            {t("Busca en cada ejercicio un peso con el que termines las series dejando un par de repeticiones en reserva, y regístralo todo.")}
          </Next>
          <Next title={t("Cada semana:")}>{t("una pesada por la mañana y la revisión semanal (dos minutos).")}</Next>
          <Next title={t("Cada mes:")}>{t("medidas corporales e informe mensual.")}</Next>
          <Next title={t("Al acabar el bloque:")}>{t("evaluación y nuevo plan según lo que hayas registrado.")}</Next>
        </View>
        {limitations.some((item) => item.active) ? (
          <Notice tone="info" style={{ marginTop: space.md }}>
            {t(
              "Has indicado lesiones o molestias. La rutina ya las tiene en cuenta, pero si el dolor persiste o empeora, consulta a un profesional sanitario antes de cargar esa zona.",
            )}
          </Notice>
        ) : null}
      </Card>
      {editing ? (
        <EditSheet
          part={editing}
          profile={profile}
          saving={pending}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const result = await run((db) => updateProfileAndReplan(db, profileFromDraft(draft)));
            if (!result) return null;
            if (!result.ok) return result.error;
            setEditing(null);
            setMessage(
              result.data.planRegenerated
                ? { tone: "positive", text: t("Guardado. Tu rutina y tu objetivo de calorías se han vuelto a calcular.") }
                : { tone: "warning", text: t("Guardado y calorías recalculadas. La rutina no ha cambiado porque tienes una sesión en curso: termínala y genera la rutina de nuevo en Perfil.") },
            );
            return null;
          }}
        />
      ) : null}
    </Screen>
  );
}

function EditButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Pencil size={14} color={colors.accentFg} />
      <Txt variant="small" style={{ color: colors.accentFg, fontWeight: "600" }}>
        {label ?? t("Cambiar")}
      </Txt>
    </Pressable>
  );
}

/** Hoja con las secciones del perfil de esa parte del informe. Devuelve el error al guardar, si lo hay. */
function EditSheet({
  part,
  profile,
  saving,
  onClose,
  onSave,
}: {
  part: EditPart;
  profile: Profile;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: Draft) => Promise<string | null>;
}) {
  const colors = useColors();
  const [draft, setDraft] = useState<Draft>(() => draftFromProfile(profile));
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const save = async () => {
    for (const step of PART_STEPS[part]) {
      const problem = validateStep(step, draft, { requireWeight: false });
      if (problem) return setError(t(problem));
    }
    setError(await onSave(draft));
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel={t("Cerrar")} />
      <View style={{ maxHeight: "90%", backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1, borderColor: colors.line }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <Txt variant="h2">{part === "you" ? t("Tus datos y tu objetivo") : t("Tu experiencia, tus días y tu material")}</Txt>
          {part === "you" ? (
            <>
              <PersonalSection draft={draft} update={update} showWeight={false} />
              <GoalsSection draft={draft} update={update} brief />
            </>
          ) : (
            <>
              <ExperienceSection draft={draft} update={update} brief />
              <AvailabilitySection draft={draft} update={update} />
            </>
          )}
          <Txt variant="small">{t("Al guardar se vuelven a calcular tu rutina y tus calorías. Tu historial de entrenamientos y comidas se conserva.")}</Txt>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button size="lg" full onPress={save} loading={saving}>
            {t("Guardar y recalcular")}
          </Button>
          <Button variant="ghost" full onPress={onClose} disabled={saving}>
            {t("Cancelar")}
          </Button>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Next({ title, children }: { title: string; children: string }) {
  const colors = useColors();
  return (
    <Txt variant="small">
      <Txt variant="small" style={{ color: colors.fg, fontWeight: "600" }}>
        {title}
      </Txt>{" "}
      {children}
    </Txt>
  );
}
