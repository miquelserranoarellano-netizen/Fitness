import { router, type Href } from "expo-router";
import { ArrowRight, Check, ChevronRight, Clock, Flame, Lightbulb, Play } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { LineChart } from "@/components/charts";
import { Loading, Screen } from "@/components/screen";
import { Badge, Button, Card, CardHeader, ProgressBar, ProgressRing, Stat, StatRow, Txt } from "@/components/ui";
import { coachTip, dueTasks } from "@/data/coach";
import { getInsights } from "@/data/insights";
import { useMutation, useQuery } from "@/data/provider";
import { startSession } from "@/data/sessions";
import { FINDING_LABEL } from "@/domain/analysis/weakpoints";
import { smooth, weeklyAverages } from "@/domain/body/trend";
import { exerciseName } from "@/domain/exercises";
import { estimateSessionMinutes } from "@/domain/training/plan";
import { GOAL_LABEL, MEASURES, MEASURE_LABEL, MUSCLE_LABEL, WEEKDAY_LABEL } from "@/domain/types";
import { t, tn } from "@/i18n";
import { getDayIntake } from "@/integrations/nutrition/store";
import { formatWeekdayDate, isoWeekday, relativeDay, weekStart } from "@/lib/dates";
import { formatNumber, formatSigned, lengthUnit, roundDisplay, toDisplayLength, toDisplayWeight, weightUnit } from "@/lib/units";
import { radius, space, useColors } from "@/theme";

export default function Home() {
  const colors = useColors();
  const query = useQuery(async (db) => {
    const insights = await getInsights(db);
    return { insights, intake: await getDayIntake(db, insights.today) };
  });
  const { run, pending } = useMutation();
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;

  const { insights, intake } = query.data;
  const { profile, training, today, weights, trend, nutritionTarget, findings, measures } = insights;
  const { units } = profile;
  const wUnit = weightUnit(units);
  const w = (kg: number) => roundDisplay(toDisplayWeight(kg, units), 1);
  const tasks = dueTasks(insights);
  const tip = coachTip(insights);
  const { block, nextDay, openSession, thisWeek } = training;

  // Peso de la semana: media de las pesadas de esta semana frente a la media de la anterior.
  const byWeek = weeklyAverages(weights);
  const currentWeek = byWeek.find((item) => item.weekStart === weekStart(today)) ?? null;
  const previousWeek = [...byWeek].reverse().find((item) => item.weekStart < weekStart(today)) ?? null;
  const lastWeight = weights[weights.length - 1] ?? null;

  const scheduled = profile.trainingWeekdays.length > 0;
  const isTrainingDay = !scheduled || profile.trainingWeekdays.includes(isoWeekday(today));
  const nextWeekday = scheduled
    ? [1, 2, 3, 4, 5, 6, 7].map((offset) => ((isoWeekday(today) - 1 + offset) % 7) + 1).find((day) => profile.trainingWeekdays.includes(day))
    : undefined;

  const measured = MEASURES.map((measure) => measures[measure]).filter((item) => item.latest !== null);
  const changed = measured.filter((item) => item.vsFirst !== null).slice(0, 4);
  const highlights = findings.filter((finding) => finding.kind === "confirmed" || finding.kind === "strength" || finding.kind === "aesthetic").slice(0, 4);

  const start = async (dayId: string) => {
    const sessionId = await run((db) => startSession(db, dayId));
    if (sessionId) router.push(`/sesion/${sessionId}`);
  };

  const weekdayText = formatWeekdayDate(today);
  const goalText = t("Objetivo: {objetivo}", { objetivo: GOAL_LABEL[profile.primaryGoal].toLowerCase() });
  const blockText = block
    ? t(" · bloque {bloque}, semana {semana} de {semanas}", { bloque: block.number, semana: Math.min(training.week, block.weeksPlanned), semanas: block.weeksPlanned })
    : "";

  return (
    <Screen tab eyebrow={weekdayText.charAt(0).toUpperCase() + weekdayText.slice(1)} title={t("Hola, {nombre}", { nombre: profile.displayName })} description={`${goalText}${blockText}`}>
      {tasks.length > 0 ? (
        <View style={{ gap: space.sm }}>
          {tasks.map((task) => (
            <Pressable
              key={task.id}
              onPress={() => router.push(task.href as Href)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                padding: space.md,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.accentLine,
                backgroundColor: pressed ? colors.accentSoft : colors.accentFaint,
              })}
            >
              <View style={{ flex: 1 }}>
                <Txt variant="label">{task.title}</Txt>
                <Txt variant="tiny" style={{ marginTop: 2, color: colors.muted }}>
                  {task.detail}
                </Txt>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Txt variant="small" style={{ color: colors.accentFg, fontWeight: "600" }}>
                  {task.cta}
                </Txt>
                <ChevronRight size={16} color={colors.accentFg} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Entrenamiento de hoy / próximo entrenamiento */}
      <Card>
        {openSession ? (
          <>
            <CardHeader eyebrow={t("En curso")} title={openSession.name} description={t("Tienes esta sesión abierta. Continúa donde lo dejaste.")} />
            <Button size="lg" full icon={Play} onPress={() => router.push(`/sesion/${openSession.id}`)}>
              {t("Continuar el entrenamiento")}
            </Button>
          </>
        ) : nextDay ? (
          <>
            <CardHeader
              eyebrow={training.trainedToday ? t("Hecho por hoy · siguiente sesión") : isTrainingDay ? t("Rutina de hoy") : t("Hoy descansas · próximo entrenamiento")}
              title={nextDay.name}
              description={nextDay.focus}
              action={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Clock size={14} color={colors.subtle} />
                  <Txt variant="tiny">~{estimateSessionMinutes(nextDay.exercises)} min</Txt>
                </View>
              }
            />
            {training.trainedToday ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space.md }}>
                <Check size={16} color={colors.positive} strokeWidth={3} />
                <Txt variant="small" style={{ color: colors.positive }}>
                  {t("Ya has entrenado hoy.")}
                </Txt>
              </View>
            ) : null}
            {!isTrainingDay && nextWeekday && !training.trainedToday ? (
              <Txt variant="small" style={{ marginBottom: space.md }}>
                {t("Según tus días habituales, te toca el {dia}.", { dia: WEEKDAY_LABEL[nextWeekday - 1]!.toLowerCase() })}
              </Txt>
            ) : null}
            <View style={{ gap: 6, marginBottom: space.lg }}>
              {nextDay.exercises.slice(0, 5).map((exercise) => (
                <View key={exercise.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                  <Txt variant="small" style={{ color: colors.fg, flex: 1 }} numberOfLines={1}>
                    {exerciseName(exercise.exerciseId)}
                  </Txt>
                  <Txt variant="tiny" num>
                    {exercise.sets} × {exercise.repMin}-{exercise.repMax}
                  </Txt>
                </View>
              ))}
              {nextDay.exercises.length > 5 ? <Txt variant="tiny">{t("y {n} más", { n: nextDay.exercises.length - 5 })}</Txt> : null}
            </View>
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Button size="lg" icon={Play} variant={training.trainedToday || !isTrainingDay ? "secondary" : "primary"} loading={pending} onPress={() => start(nextDay.id)}>
                {t("Empezar entrenamiento")}
              </Button>
              <Button size="lg" variant="ghost" onPress={() => router.push("/entrenamiento")}>
                {t("Ver la semana")}
              </Button>
            </View>
          </>
        ) : (
          <>
            <CardHeader title={t("Sin plan de entrenamiento")} description={t("Genera tu rutina desde el perfil.")} />
            <Button onPress={() => router.push("/perfil")}>{t("Ir al perfil")}</Button>
          </>
        )}
      </Card>

      {/* Cumplimiento semanal y racha */}
      <Card>
        <CardHeader title={t("Esta semana")} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
          <ProgressRing value={thisWeek.ratio}>
            <Txt style={{ fontWeight: "600" }} num>
              {Math.round(thisWeek.ratio * 100)} %
            </Txt>
          </ProgressRing>
          <View style={{ flex: 1, gap: space.sm }}>
            <Txt variant="h1" num>
              {thisWeek.completed}
              <Txt variant="muted"> / {thisWeek.planned}</Txt>
            </Txt>
            <Txt variant="tiny">{t("entrenamientos completados")}</Txt>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Flame size={16} color={training.streak > 0 ? colors.accentFg : colors.subtle} />
              <Txt variant="small" style={{ flex: 1 }}>
                {training.streak > 0
                  ? tn(training.streak, "Racha: {n} semana cumpliendo el plan", "Racha: {n} semanas cumpliendo el plan")
                  : t("Completa la semana para empezar una racha")}
              </Txt>
            </View>
          </View>
        </View>
      </Card>

      {/* Recomendación */}
      <Card>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
            <Lightbulb size={20} color={colors.accentFg} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt variant="tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "500" }}>
              {t("Recomendación · reglas sobre tus datos")}
            </Txt>
            <Txt variant="h2">{tip.title}</Txt>
            <Txt variant="muted">{tip.body}</Txt>
            {tip.basis.length > 0 ? <Txt variant="tiny">{t("Se basa en: {datos}", { datos: tip.basis.join(" ") })}</Txt> : null}
            {tip.href && tip.cta ? (
              <Pressable onPress={() => router.push(tip.href as Href)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Txt variant="small" style={{ color: colors.accentFg, fontWeight: "600" }}>
                  {tip.cta}
                </Txt>
                <ArrowRight size={16} color={colors.accentFg} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Peso */}
      <Card>
        <CardHeader
          title={t("Peso")}
          action={
            <Button size="sm" variant="ghost" onPress={() => router.push("/cuerpo")}>
              {currentWeek ? t("Ver detalle") : t("Registrar")}
            </Button>
          }
        />
        <StatRow>
          <Stat
            label={t("Esta semana")}
            value={currentWeek ? formatNumber(w(currentWeek.kg), 1) : "—"}
            unit={currentWeek ? wUnit : undefined}
            hint={
              currentWeek && previousWeek
                ? t("{cambio} {unidad} respecto a la semana anterior", { cambio: formatSigned(toDisplayWeight(currentWeek.kg - previousWeek.kg, units), 1), unidad: wUnit })
                : currentWeek
                  ? t("Primera semana con registro")
                  : lastWeight
                    ? t("Sin pesada esta semana. Última: {peso} {unidad}, {cuando}", { peso: formatNumber(w(lastWeight.kg), 1), unidad: wUnit, cuando: relativeDay(lastWeight.date, today) })
                    : t("Sin pesadas todavía")
            }
          />
          <Stat
            label={t("Tendencia")}
            value={trend.status === "ok" ? formatSigned(toDisplayWeight(trend.kgPerWeek, units), 2) : "—"}
            unit={trend.status === "ok" ? t("{unidad}/sem", { unidad: wUnit }) : undefined}
            hint={
              trend.status === "ok"
                ? t("{pesadas} en {semanas}", {
                    pesadas: tn(trend.entries, "{n} pesada", "{n} pesadas"),
                    semanas: tn(Math.round(trend.spanDays / 7), "{n} semana", "{n} semanas"),
                  })
                : t("Faltan pesadas para calcularla")
            }
          />
        </StatRow>
        <View style={{ marginTop: space.lg }}>
          {weights.length >= 2 ? (
            <LineChart
              unit={wUnit}
              height={170}
              series={[
                { id: "raw", label: t("Pesadas"), mark: "dots", points: weights.slice(-26).map((entry) => ({ date: entry.date, value: w(entry.kg) })) },
                { id: "trend", label: t("Tendencia"), mark: "line", points: smooth(weights).slice(-26).map((entry) => ({ date: entry.date, value: w(entry.kg) })) },
              ]}
            />
          ) : (
            <View style={{ borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineStrong, padding: space.lg }}>
              <Txt variant="small" style={{ textAlign: "center" }}>
                {t("El gráfico aparecerá con tu segunda pesada. Se recomienda una por semana.")}
              </Txt>
            </View>
          )}
        </View>
      </Card>

      {/* Nutrición */}
      {nutritionTarget ? (
        <Card>
          <CardHeader
            title={t("Nutrición de hoy")}
            action={
              <Button size="sm" variant="ghost" onPress={() => router.push("/nutricion")}>
                {t("Ver objetivo")}
              </Button>
            }
          />
          {intake.entries.length > 0 ? (
            <View style={{ gap: space.md }}>
              <Meter label={t("Calorías")} value={intake.calories} target={nutritionTarget.calories} unit="kcal" />
              {intake.proteinG !== null ? <Meter label={t("Proteína")} value={intake.proteinG} target={nutritionTarget.proteinG} unit="g" /> : null}
            </View>
          ) : (
            <>
              <StatRow>
                <Stat label={t("Calorías objetivo")} value={`≈ ${formatNumber(nutritionTarget.calories, 0)}`} unit="kcal" />
                <Stat label={t("Proteína")} value={nutritionTarget.proteinG} unit="g" />
              </StatRow>
              <Txt variant="tiny" style={{ marginTop: space.md }}>
                {t("Cuando se conecte la app de fotos de comida, aquí verás cuánto llevas hoy.")}
              </Txt>
            </>
          )}
        </Card>
      ) : null}

      {/* Medidas */}
      <Card>
        <CardHeader
          title={t("Medidas")}
          action={
            <Button size="sm" variant="ghost" onPress={() => router.push("/cuerpo")}>
              {measured.length > 0 ? t("Ver todas") : t("Añadir")}
            </Button>
          }
        />
        {changed.length > 0 ? (
          <View style={{ gap: space.sm }}>
            {changed.map((item) => (
              <View key={item.measure} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.md }}>
                <Txt variant="small">{MEASURE_LABEL[item.measure]}</Txt>
                <Txt variant="label" num>
                  {formatNumber(toDisplayLength(item.latest!.value, units), 1)} {lengthUnit(units)}
                  <Txt variant="tiny">
                    {"  "}
                    {formatSigned(toDisplayLength(item.vsFirst!.absolute, units), 1)} ({formatSigned(item.vsFirst!.percent, 1)} %)
                  </Txt>
                </Txt>
              </View>
            ))}
            <Txt variant="tiny">{t("Cambio desde tu primera medición.")}</Txt>
          </View>
        ) : (
          <Txt variant="small">
            {measured.length > 0
              ? tn(
                  measured.length,
                  "Tienes {n} medida de partida. La comparación aparecerá con la medición del mes que viene.",
                  "Tienes {n} medidas de partida. La comparación aparecerá con la medición del mes que viene.",
                )
              : t("Aún no hay medidas. Con ellas sabrás qué zonas crecen de verdad.")}
          </Txt>
        )}
      </Card>

      {/* Puntos fuertes y áreas de mejora */}
      <Card>
        <CardHeader
          title={t("Puntos fuertes y áreas de mejora")}
          action={
            <Button size="sm" variant="ghost" onPress={() => router.push("/analisis")}>
              {t("Análisis")}
            </Button>
          }
        />
        {highlights.length > 0 ? (
          <View style={{ gap: space.sm }}>
            {highlights.map((finding) => (
              <View key={finding.muscle} style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, gap: 6 }}>
                <Badge tone={finding.kind === "strength" ? "positive" : finding.kind === "confirmed" ? "warning" : "info"}>{FINDING_LABEL[finding.kind]}</Badge>
                <Txt variant="label">{MUSCLE_LABEL[finding.muscle]}</Txt>
                <Txt variant="tiny">{finding.evidence[0]}</Txt>
              </View>
            ))}
          </View>
        ) : (
          <Txt variant="small">
            {t("Todavía no hay datos suficientes para señalar puntos fuertes o débiles. Hacen falta al menos 3 sesiones registradas por grupo muscular a lo largo de dos semanas.")}
          </Txt>
        )}
      </Card>
    </Screen>
  );
}

function Meter({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt variant="small">{label}</Txt>
        <Txt variant="small" num style={{ color: colors.fg }}>
          <Txt variant="label" num>
            {formatNumber(value, 0)}
          </Txt>{" "}
          / {formatNumber(target, 0)} {unit}
        </Txt>
      </View>
      <ProgressBar value={target > 0 ? value / target : 0} tone="info" />
    </View>
  );
}
