import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Field, Input, Segmented, UnitInput } from "@/components/form";
import { Loading, Screen } from "@/components/screen";
import { Button, Card, Notice, Txt } from "@/components/ui";
import { reviewWeekFor } from "@/data/coach";
import { getInsights, type Insights } from "@/data/insights";
import { useMutation, useQuery } from "@/data/provider";
import { submitCheckin } from "@/data/services";
import type { CheckinAnswers } from "@/domain/review/weekly";
import { msg, t, tn } from "@/i18n";
import { addDays, formatShortDate, isIsoDate, weekStart as weekStartOf } from "@/lib/dates";
import { formatNumber, fromDisplayWeight, parseDecimal, toDisplayWeight, weightUnit } from "@/lib/units";
import { space } from "@/theme";

const SCALE = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }));

type RatingKey = "nutritionAdherence" | "sleepQuality" | "energy" | "appetite" | "performance";

const RATINGS: { key: RatingKey; label: string; low: string; high: string }[] = [
  { key: "nutritionAdherence", label: msg("¿Has cumplido con la alimentación?"), low: msg("Casi nada"), high: msg("Todos los días") },
  { key: "sleepQuality", label: msg("¿Cómo ha sido tu sueño?"), low: msg("Muy malo"), high: msg("Muy bueno") },
  { key: "energy", label: msg("¿Cómo has estado de energía?"), low: msg("Sin fuerzas"), high: msg("Con mucha energía") },
  { key: "appetite", label: msg("¿Y de apetito?"), low: msg("Me ha costado comer"), high: msg("Con mucha hambre") },
  { key: "performance", label: msg("¿Cómo ha sido tu rendimiento entrenando?"), low: msg("Peor que nunca"), high: msg("Mejor que nunca") },
];

export default function WeeklyCheckin() {
  const { semana } = useLocalSearchParams<{ semana?: string }>();
  const query = useQuery(getInsights);
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const insights = query.data;
  const { today } = insights;
  // Por defecto se revisa la semana que toca; con ?semana= se puede elegir la actual o la anterior.
  const allowed = [weekStartOf(today), addDays(weekStartOf(today), -7)];
  const week = semana && isIsoDate(semana) && allowed.includes(semana) ? semana : reviewWeekFor(today, insights.training.block?.startedOn);
  return <CheckinForm key={week} week={week} insights={insights} />;
}

function CheckinForm({ week, insights }: { week: string; insights: Insights }) {
  const { run, pending } = useMutation();
  const weekEnd = addDays(week, 6);
  const { units } = insights.profile;
  const previous: CheckinAnswers | null = insights.checkins.find((checkin) => checkin.weekStart === week)?.answers ?? null;
  const loggedSessions = insights.training.sessions.filter((session) => session.date >= week && session.date <= weekEnd).length;
  const weighed = insights.weights.filter((entry) => entry.date >= week && entry.date <= weekEnd).pop();

  const [workouts, setWorkouts] = useState(String(previous?.workoutsCompleted ?? loggedSessions));
  const [ratings, setRatings] = useState<Record<RatingKey, number | null>>({
    nutritionAdherence: previous?.nutritionAdherence ?? null,
    sleepQuality: previous?.sleepQuality ?? null,
    energy: previous?.energy ?? null,
    appetite: previous?.appetite ?? null,
    performance: previous?.performance ?? null,
  });
  const [pain, setPain] = useState<"yes" | "no" | null>(previous ? (previous.pain ? "yes" : "no") : null);
  const [painNotes, setPainNotes] = useState(previous?.painNotes ?? "");
  const [improved, setImproved] = useState(previous?.improvedExercises ?? "");
  const [difficulties, setDifficulties] = useState(previous?.difficulties ?? "");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const workoutsCompleted = parseDecimal(workouts);
    if (workoutsCompleted === null || !Number.isInteger(workoutsCompleted)) return setError(t("Indica cuántos entrenamientos has completado."));
    if (RATINGS.some((rating) => ratings[rating.key] === null) || pain === null) {
      return setError(t("Responde a todas las preguntas de valoración (incluida la de dolor o molestias) antes de enviar."));
    }
    let weightKg: number | null = null;
    if (weight.trim() !== "") {
      const value = parseDecimal(weight);
      if (value === null) return setError(t("Revisa el peso."));
      weightKg = fromDisplayWeight(value, units);
    }
    const result = await run((db) =>
      submitCheckin(db, {
        weekStart: week,
        workoutsCompleted,
        nutritionAdherence: ratings.nutritionAdherence!,
        sleepQuality: ratings.sleepQuality!,
        energy: ratings.energy!,
        appetite: ratings.appetite!,
        performance: ratings.performance!,
        pain: pain === "yes",
        painNotes,
        improvedExercises: improved,
        difficulties,
        weightKg,
      }),
    );
    if (!result) return;
    if (!result.ok) return setError(result.error);
    router.replace(`/revisiones/semana/${result.data.weekStart}`);
  };

  return (
    <Screen
      description={t("Semana del {desde} al {hasta}. Dos minutos para repasar cómo ha ido y decidir si hay que ajustar algo.", {
        desde: formatShortDate(week),
        hasta: formatShortDate(weekEnd),
      })}
      footer={
        <Button size="lg" full onPress={submit} loading={pending}>
          {pending ? t("Preparando tu informe…") : t("Enviar y ver el informe")}
        </Button>
      }
    >
      <Card>
        <View style={{ gap: space.xl }}>
          <Field
            label={t("¿Cuántos entrenamientos has completado?")}
            hint={tn(loggedSessions, "En la aplicación hay {n} sesión registrada esa semana.", "En la aplicación hay {n} sesiones registradas esa semana.")}
          >
            <UnitInput unit={t("sesiones")} integer value={workouts} onChangeText={setWorkouts} style={{ width: 160 }} />
          </Field>

          {RATINGS.map((rating) => (
            <Field key={rating.key} label={t(rating.label)}>
              <Segmented options={SCALE} value={ratings[rating.key]} onChange={(value) => setRatings((current) => ({ ...current, [rating.key]: value }))} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Txt variant="tiny">{t(rating.low)}</Txt>
                <Txt variant="tiny">{t(rating.high)}</Txt>
              </View>
            </Field>
          ))}

          <Field label={t("¿Has notado dolor o molestias?")}>
            <Segmented
              options={[
                { value: "no" as const, label: t("No") },
                { value: "yes" as const, label: t("Sí") },
              ]}
              value={pain}
              onChange={setPain}
            />
          </Field>
          {pain === "yes" ? (
            <Field
              label={t("¿Dónde y con qué ejercicios?")}
              hint={t("No es un diagnóstico: sirve para adaptar los ejercicios. Si el dolor es intenso o persiste, consulta a un profesional sanitario.")}
            >
              <Input value={painNotes} onChangeText={setPainNotes} maxLength={400} multiline />
            </Field>
          ) : null}

          <Field label={t("¿Qué ejercicios han mejorado?")} optional>
            <Input value={improved} onChangeText={setImproved} maxLength={400} />
          </Field>
          <Field label={t("¿Qué ha sido lo más difícil?")} optional>
            <Input value={difficulties} onChangeText={setDifficulties} maxLength={400} multiline />
          </Field>
          <Field
            label={t("¿Cuál es tu peso actual?")}
            optional
            hint={
              weighed
                ? t("Ya tienes una pesada esa semana ({peso} {unidad}). Rellénalo solo si te has pesado hoy.", {
                    peso: formatNumber(toDisplayWeight(weighed.kg, units), 1),
                    unidad: weightUnit(units),
                  })
                : t("Por la mañana, después de ir al baño y antes de comer. Se guardará como la pesada de hoy.")
            }
          >
            <UnitInput unit={weightUnit(units)} value={weight} onChangeText={setWeight} style={{ width: 160 }} />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </View>
      </Card>
    </Screen>
  );
}
