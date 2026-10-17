import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { Alert, Pressable, View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Badge, Card, EmptyState, Notice, Stat, StatRow, Txt } from "@/components/ui";
import { requireProfile } from "@/data/profile";
import { useMutation, useQuery } from "@/data/provider";
import { deleteSession, getSession } from "@/data/sessions";
import { exerciseName, getExercise } from "@/domain/exercises";
import { msg, t, tn } from "@/i18n";
import { dateOf, formatWeekdayDate } from "@/lib/dates";
import { formatClock, formatDuration, formatRange } from "@/lib/format";
import { formatNumber, roundDisplay, toDisplayWeight, weightUnit } from "@/lib/units";
import { space, useColors } from "@/theme";

const DISCOMFORT_LABEL = ["", msg("Molestia leve"), msg("Molestia moderada"), msg("Dolor")];
const ENERGY_LABEL = ["", msg("Muy baja"), msg("Baja"), msg("Normal"), msg("Alta"), msg("Muy alta")];

export default function SessionDetail() {
  const colors = useColors();
  const { id, terminada } = useLocalSearchParams<{ id: string; terminada?: string }>();
  const query = useQuery(async (db) => ({ session: await getSession(db, id), profile: await requireProfile(db) }), [id]);
  const { run } = useMutation();
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { session, profile } = query.data;
  if (!session) {
    return (
      <Screen>
        <EmptyState title={t("Sesión no encontrada")}>{t("Puede que se haya borrado.")}</EmptyState>
      </Screen>
    );
  }
  if (session.status === "in_progress") return <Redirect href={`/sesion/${session.id}`} />;

  const unit = weightUnit(profile.units);
  const show = (kg: number) => formatNumber(roundDisplay(toDisplayWeight(kg, profile.units), 2), 2);
  const done = session.exercises.filter((exercise) => exercise.sets.length > 0);
  const sets = done.reduce((total, exercise) => total + exercise.sets.length, 0);
  const volume = done.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0), 0);
  const minutes = session.finishedAt ? Math.max(1, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)) : null;
  const skipped = session.exercises.length - done.length;
  const day = formatWeekdayDate(dateOf(session.startedAt));

  const remove = () =>
    Alert.alert(t("Borrar esta sesión"), t("Se borrará la sesión con todas sus series y dejará de contar en tu progresión. No se puede deshacer."), [
      { text: t("Cancelar"), style: "cancel" },
      {
        text: t("Borrar"),
        style: "destructive",
        onPress: async () => {
          await run((db) => deleteSession(db, session.id));
          router.back();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: session.name }} />
      <Screen title={session.name} description={`${day.charAt(0).toUpperCase()}${day.slice(1)}`}>
        {terminada ? (
          <Notice tone="positive" title={t("Sesión guardada")}>
            {t("Buen trabajo. Lo que has registrado hoy decide las cargas que te propondré la próxima vez que hagas esta sesión.")}
          </Notice>
        ) : null}

        <Card>
          <StatRow>
            {minutes !== null ? <Stat label={t("Duración")} value={formatDuration(minutes)} /> : null}
            <Stat label={t("Series")} value={sets} />
            <Stat label={t("Volumen")} value={formatNumber(Math.round(toDisplayWeight(volume, profile.units)), 0)} unit={unit} hint={t("Suma de peso × repeticiones")} />
            {session.energy !== null ? <Stat label={t("Energía")} value={ENERGY_LABEL[session.energy] ? t(ENERGY_LABEL[session.energy]!) : "—"} /> : null}
          </StatRow>
          {session.notes ? (
            <Txt variant="small" style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line }}>
              {session.notes}
            </Txt>
          ) : null}
        </Card>

        {done.map((exercise) => {
          const meta = getExercise(exercise.exerciseId);
          return (
            <Card key={exercise.id}>
              <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start", marginBottom: space.md }}>
                <Pressable onPress={() => router.push(`/ejercicio/${exercise.exerciseId}`)} style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: "600" }}>{exerciseName(exercise.exerciseId)}</Txt>
                  <Txt variant="tiny" num style={{ marginTop: 2 }}>
                    {t("Objetivo: {series} × {reps} · RIR {rir}", {
                      series: exercise.targetSets,
                      reps: formatRange(exercise.repMin, exercise.repMax),
                      rir: formatRange(exercise.rirMin, exercise.rirMax),
                    })}
                    {exercise.plannedExerciseId ? t(" · sustituye a {ejercicio}", { ejercicio: exerciseName(exercise.plannedExerciseId).toLowerCase() }) : ""}
                  </Txt>
                </Pressable>
                {exercise.discomfort > 0 ? <Badge tone={exercise.discomfort >= 2 ? "danger" : "warning"}>{t(DISCOMFORT_LABEL[exercise.discomfort] ?? "")}</Badge> : null}
              </View>
              <View style={{ flexDirection: "row", paddingBottom: 6 }}>
                <Txt variant="tiny" style={{ width: 44 }}>
                  {t("Serie")}
                </Txt>
                <Txt variant="tiny" style={{ flex: 1.4 }}>
                  {meta?.bodyweight ? t("Lastre") : meta?.perSide ? t("Por lado") : t("Peso")}
                </Txt>
                <Txt variant="tiny" style={{ flex: 1 }}>
                  {t("Reps")}
                </Txt>
                <Txt variant="tiny" style={{ flex: 1 }}>
                  RIR
                </Txt>
                <Txt variant="tiny" style={{ flex: 1, textAlign: "right" }}>
                  {t("Descanso")}
                </Txt>
              </View>
              {exercise.sets.map((set, index) => (
                <View key={set.id} style={{ flexDirection: "row", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <Txt variant="small" num style={{ width: 44 }}>
                    {index + 1}
                  </Txt>
                  <Txt variant="label" num style={{ flex: 1.4 }}>
                    {show(set.weightKg)} {unit}
                  </Txt>
                  <Txt variant="label" num style={{ flex: 1 }}>
                    {set.reps}
                  </Txt>
                  <Txt variant="small" num style={{ flex: 1 }}>
                    {set.rir === null ? "—" : formatNumber(set.rir, 1)}
                  </Txt>
                  <Txt variant="small" num style={{ flex: 1, textAlign: "right" }}>
                    {set.restSeconds === null ? "—" : formatClock(set.restSeconds)}
                  </Txt>
                </View>
              ))}
              {exercise.note ? (
                <Txt variant="small" style={{ marginTop: space.sm }}>
                  {exercise.note}
                </Txt>
              ) : null}
            </Card>
          );
        })}

        {skipped > 0 ? (
          <Txt variant="subtle">{tn(skipped, "Quedó {n} ejercicio del plan sin hacer.", "Quedaron {n} ejercicios del plan sin hacer.")}</Txt>
        ) : null}

        <Pressable onPress={remove} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.md }}>
          <Trash2 size={16} color={colors.danger} />
          <Txt variant="small" style={{ color: colors.danger }}>
            {t("Borrar esta sesión")}
          </Txt>
        </Pressable>
      </Screen>
    </>
  );
}
