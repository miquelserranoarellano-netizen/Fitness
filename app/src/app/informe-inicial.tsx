import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { View } from "react-native";
import { RangeBars } from "@/components/charts";
import { Loading, Screen } from "@/components/screen";
import { Button, Card, CardHeader, Notice, Stat, StatRow, Txt } from "@/components/ui";
import { getBlockByNumber } from "@/data/blocks";
import { listMeasurements, listWeights } from "@/data/body";
import { listNutritionTargets } from "@/data/nutrition";
import { getLimitations, requireProfile } from "@/data/profile";
import { useQuery } from "@/data/provider";
import { exerciseName } from "@/domain/exercises";
import { SPLIT_LABEL, estimateSessionMinutes } from "@/domain/training/plan";
import { GOAL_LABEL, LEVEL_LABEL, MEASURES, MEASURE_LABEL, MUSCLES, MUSCLE_LABEL } from "@/domain/types";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { formatRange } from "@/lib/format";
import { formatLength, formatNumber, formatSigned, formatWeight } from "@/lib/units";
import { radius, space, useColors } from "@/theme";

/** El punto de partida tal como quedó al terminar el cuestionario. */
export default function InitialReport() {
  const colors = useColors();
  const query = useQuery(async (db) => ({
    profile: await requireProfile(db),
    block: await getBlockByNumber(db, 1),
    targets: await listNutritionTargets(db),
    weights: await listWeights(db),
    measurements: await listMeasurements(db),
    limitations: await getLimitations(db),
  }));
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { profile, block, targets, weights, measurements, limitations } = query.data;
  const nutrition = targets.find((target) => target.reason === "initial") ?? targets[targets.length - 1] ?? null;
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
      <Card>
        <CardHeader title={t("Punto de partida")} />
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
              title={t("Tu rutina: {rutina}", { rutina: SPLIT_LABEL[block.split] })}
              description={t("Primer bloque de {semanas} semanas. {progresion}", { semanas: block.weeksPlanned, progresion: block.rationale.expectedProgression })}
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
            title={t("Tu punto de partida nutricional")}
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
        <CardHeader title={t("Medidas de partida")} />
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
    </Screen>
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
