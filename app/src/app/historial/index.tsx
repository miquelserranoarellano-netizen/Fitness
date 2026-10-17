import { router } from "expo-router";
import { CalendarClock } from "lucide-react-native";
import { View } from "react-native";
import { Columns } from "@/components/charts";
import { Loading, Screen } from "@/components/screen";
import { Badge, Button, Card, CardHeader, EmptyState, LinkRow, Stat, StatRow, Txt } from "@/components/ui";
import { getTrainingOverview } from "@/data/overview";
import { requireProfile } from "@/data/profile";
import { useQuery } from "@/data/provider";
import { getExerciseLogs, groupLogs } from "@/data/sessions";
import { exerciseName, getExercise } from "@/domain/exercises";
import { sessionBestE1rm } from "@/domain/training/progression";
import { MUSCLE_LABEL } from "@/domain/types";
import { isSingular, t, tn } from "@/i18n";
import { formatShortDate, formatWeekdayDate } from "@/lib/dates";
import { formatDuration } from "@/lib/format";
import { formatNumber, formatSigned, roundDisplay, toDisplayWeight, weightUnit } from "@/lib/units";
import { space } from "@/theme";

export default function HistoryScreen() {
  const query = useQuery(async (db) => {
    const profile = await requireProfile(db);
    return { profile, overview: await getTrainingOverview(db, profile.daysPerWeek), logs: await getExerciseLogs(db, { sinceDays: 365 }) };
  });
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { profile, overview, logs } = query.data;
  const { sessions } = overview;
  const unit = weightUnit(profile.units);
  const show = (kg: number) => roundDisplay(toDisplayWeight(kg, profile.units), 1);

  if (sessions.length === 0) {
    return (
      <Screen description={t("Tus sesiones, ejercicio a ejercicio.")}>
        <Card>
          <EmptyState icon={CalendarClock} title={t("Aún no hay sesiones registradas")} action={<Button onPress={() => router.push("/entrenamiento")}>{t("Ir a mi entrenamiento")}</Button>}>
            {t("Cuando termines tu primer entrenamiento aparecerá aquí, con todas sus series.")}
          </EmptyState>
        </Card>
      </Screen>
    );
  }

  // Progresión por ejercicio: primera sesión registrada frente a la más reciente.
  const progress = [...groupLogs(logs).entries()]
    .map(([exerciseId, entries]) => ({
      exerciseId,
      sessions: entries.length,
      latest: sessionBestE1rm(entries[0]!.sets),
      first: sessionBestE1rm(entries[entries.length - 1]!.sets),
    }))
    .filter((item) => getExercise(item.exerciseId))
    .sort((a, b) => b.sessions - a.sessions || a.exerciseId.localeCompare(b.exerciseId));

  return (
    <Screen description={t("Tus sesiones y la progresión de cada ejercicio.")}>
      <Card>
        <StatRow>
          <Stat label={t("Sesiones completadas")} value={sessions.length} />
          <Stat label={t("Esta semana")} value={`${overview.thisWeek.completed}/${overview.thisWeek.planned}`} />
          <Stat label={t("Racha")} value={overview.streak} unit={isSingular(overview.streak) ? t("semana") : t("semanas")} hint={t("Semanas seguidas cumpliendo el plan")} />
        </StatRow>
        <View style={{ marginTop: space.xl }}>
          <Columns
            target={profile.daysPerWeek}
            targetLabel={t("objetivo: {n}", { n: profile.daysPerWeek })}
            items={overview.weeks.map((week) => ({
              id: week.weekStart,
              label: formatShortDate(week.weekStart),
              value: week.completed,
              highlight: week.weekStart === overview.thisWeek.weekStart,
            }))}
          />
          <Txt variant="tiny" style={{ marginTop: space.sm }}>
            {t("Sesiones por semana (cada columna empieza en lunes).")}
          </Txt>
        </View>
      </Card>

      <Card>
        <CardHeader title={t("Sesiones")} />
        {sessions.slice(0, 60).map((session) => {
          const day = formatWeekdayDate(session.date);
          return (
            <LinkRow
              key={session.id}
              title={session.name}
              subtitle={`${day.charAt(0).toUpperCase()}${day.slice(1)}${session.durationMinutes !== null ? ` · ${formatDuration(session.durationMinutes)}` : ""} · ${tn(session.sets, "{n} serie", "{n} series")}`}
              right={session.discomfort >= 2 ? <Badge tone="danger">{t("Molestia")}</Badge> : undefined}
              onPress={() => router.push(`/historial/${session.id}`)}
            />
          );
        })}
      </Card>

      <Card>
        <CardHeader title={t("Progresión por ejercicio")} description={t("1RM estimado más reciente y cambio desde la primera sesión registrada.")} />
        {progress.map((item) => {
          const exercise = getExercise(item.exerciseId)!;
          return (
            <LinkRow
              key={item.exerciseId}
              title={exerciseName(item.exerciseId)}
              subtitle={`${MUSCLE_LABEL[exercise.primary]} · ${tn(item.sessions, "{n} sesión", "{n} sesiones")}`}
              right={
                <View style={{ alignItems: "flex-end" }}>
                  <Txt variant="label" num>
                    {formatNumber(show(item.latest), 1)} {unit}
                  </Txt>
                  {item.sessions > 1 ? (
                    <Txt variant="tiny" num>
                      {formatSigned(show(item.latest - item.first), 1)} {unit}
                    </Txt>
                  ) : null}
                </View>
              }
              onPress={() => router.push(`/ejercicio/${item.exerciseId}`)}
            />
          );
        })}
      </Card>
    </Screen>
  );
}
