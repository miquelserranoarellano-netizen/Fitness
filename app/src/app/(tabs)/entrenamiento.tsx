import { router } from "expo-router";
import { Clock, Dumbbell, Play } from "lucide-react-native";
import { View } from "react-native";
import { RangeBars } from "@/components/charts";
import { Loading, Screen } from "@/components/screen";
import { Badge, Bullets, Button, Card, CardHeader, Collapsible, EmptyState, LinkRow, Notice, Txt } from "@/components/ui";
import { getTrainingOverview } from "@/data/overview";
import { requireProfile } from "@/data/profile";
import { useMutation, useQuery } from "@/data/provider";
import { startSession } from "@/data/sessions";
import { exerciseName } from "@/domain/exercises";
import { SPLIT_LABEL, estimateSessionMinutes } from "@/domain/training/plan";
import { LEVEL_LABEL, MUSCLES, MUSCLE_LABEL } from "@/domain/types";
import { t } from "@/i18n";
import { formatDate, relativeDay } from "@/lib/dates";
import { formatRange, formatRest } from "@/lib/format";
import { space, useColors } from "@/theme";

export default function Training() {
  const colors = useColors();
  const query = useQuery(async (db) => {
    const profile = await requireProfile(db);
    return { profile, overview: await getTrainingOverview(db, profile.daysPerWeek) };
  });
  const { run, pending } = useMutation();
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { overview } = query.data;
  const { block } = overview;

  if (!block) {
    return (
      <Screen tab title={t("Mi entrenamiento")}>
        <Card>
          <EmptyState icon={Dumbbell} title={t("Todavía no tienes un plan")} action={<Button onPress={() => router.push("/perfil")}>{t("Ir al perfil")}</Button>}>
            {t("Genera tu rutina desde el perfil, en «Plan de entrenamiento».")}
          </EmptyState>
        </Card>
      </Screen>
    );
  }

  const { rationale } = block;
  const blockEnded = overview.week > block.weeksPlanned;

  const start = async (dayId: string) => {
    const sessionId = await run((db) => startSession(db, dayId));
    if (sessionId) router.push(`/sesion/${sessionId}`);
  };

  return (
    <Screen
      tab
      title={t("Mi entrenamiento")}
      description={t("Bloque {bloque} · semana {semana} de {semanas} · {rutina} · nivel {nivel}", {
        bloque: block.number,
        semana: Math.min(overview.week, block.weeksPlanned),
        semanas: block.weeksPlanned,
        rutina: SPLIT_LABEL[block.split],
        nivel: LEVEL_LABEL[rationale.level].toLowerCase(),
      })}
    >
      {overview.openSession ? (
        <Notice tone="info" title={t("Tienes una sesión en curso: {nombre}", { nombre: overview.openSession.name })}>
          <Button size="sm" variant="secondary" icon={Play} onPress={() => router.push(`/sesion/${overview.openSession!.id}`)} style={{ marginTop: space.sm }}>
            {t("Continuar donde lo dejaste")}
          </Button>
        </Notice>
      ) : null}
      {blockEnded ? (
        <Notice tone="positive" title={t("Has completado las semanas previstas de este bloque")}>
          <Txt variant="small">{t("Toca evaluar los resultados y preparar el siguiente.")}</Txt>
          <Button size="sm" variant="secondary" onPress={() => router.push("/revisiones")} style={{ marginTop: space.sm }}>
            {t("Ir a revisiones")}
          </Button>
        </Notice>
      ) : null}
      {rationale.warnings.map((warning) => (
        <Notice key={warning} tone="warning">
          {warning}
        </Notice>
      ))}

      {block.days.map((day) => {
        const isNext = overview.nextDay?.id === day.id;
        const last = overview.lastDone[day.id];
        return (
          <Card key={day.id} highlight={isNext}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.sm }}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
                  <Txt variant="h2">{day.name}</Txt>
                  {isNext ? <Badge tone="accent">{t("Siguiente")}</Badge> : null}
                </View>
                <Txt variant="small">{day.focus}</Txt>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Clock size={14} color={colors.subtle} />
                <Txt variant="tiny">~{estimateSessionMinutes(day.exercises)} min</Txt>
              </View>
            </View>

            {day.exercises.map((exercise, index) => (
              <LinkRow
                key={exercise.id}
                title={`${index + 1}. ${exerciseName(exercise.exerciseId)}`}
                subtitle={t("{series} × {reps} · RIR {rir} · descanso {descanso}", {
                  series: exercise.sets,
                  reps: formatRange(exercise.repMin, exercise.repMax),
                  rir: formatRange(exercise.rirMin, exercise.rirMax),
                  descanso: formatRest(exercise.restSeconds),
                })}
                onPress={() => router.push(`/ejercicio/${exercise.exerciseId}`)}
              />
            ))}

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.md }}>
              <Txt variant="tiny" style={{ flex: 1 }}>
                {last ? t("Último: {cuando}", { cuando: relativeDay(last, overview.today) }) : t("Aún sin registrar")}
              </Txt>
              {!overview.openSession ? (
                <Button icon={Play} variant={isNext ? "primary" : "secondary"} loading={pending} onPress={() => start(day.id)}>
                  {t("Empezar")}
                </Button>
              ) : null}
            </View>
          </Card>
        );
      })}

      <Card>
        <CardHeader
          title={t("Volumen semanal por grupo muscular")}
          description={t("Series por semana: cada serie cuenta entera para el músculo principal del ejercicio y media para los secundarios. La banda marca el rango recomendado para tu nivel.")}
        />
        <RangeBars
          unit={t("series")}
          items={MUSCLES.map((muscle) => ({
            id: muscle,
            label: MUSCLE_LABEL[muscle],
            value: rationale.weeklyVolume[muscle],
            min: rationale.volumeTargets[muscle].min,
            max: rationale.volumeTargets[muscle].max,
            tag: rationale.priorityMuscles.includes(muscle) ? t("prioridad") : undefined,
          }))}
        />
      </Card>

      <Card>
        <CardHeader title={t("Por qué esta rutina")} description={t("Generada el {fecha} con reglas de programación a partir de tu perfil.", { fecha: formatDate(block.startedOn) })} />
        <View style={{ gap: space.md }}>
          <Explained title={t("Tu nivel: {nivel}", { nivel: LEVEL_LABEL[rationale.level].toLowerCase() })} detail={rationale.levelReasons.join(" ")} />
          {rationale.rationale.map((item) => (
            <Explained key={item.title} title={item.title} detail={item.detail} />
          ))}
          {rationale.changes?.map((item) => <Explained key={item.title} title={item.title} detail={item.detail} />)}
        </View>
      </Card>

      <Card>
        <CardHeader title={t("Plan del bloque")} description={t("{semanas} semanas. {progresion}", { semanas: block.weeksPlanned, progresion: rationale.expectedProgression })} />
        <View style={{ gap: space.sm }}>
          <Collapsible title={t("Objetivos")} defaultOpen>
            <Bullets items={rationale.objectives} />
          </Collapsible>
          <Collapsible title={t("Cuándo subir el volumen")}>
            <Bullets items={rationale.volumeCriteria.increase} />
          </Collapsible>
          <Collapsible title={t("Cuándo bajarlo")}>
            <Bullets items={rationale.volumeCriteria.decrease} />
          </Collapsible>
          <Collapsible title={t("Semana de descarga")}>
            <Bullets items={rationale.volumeCriteria.deload} />
          </Collapsible>
        </View>
      </Card>

    </Screen>
  );
}

function Explained({ title, detail }: { title: string; detail: string }) {
  return (
    <View>
      <Txt variant="label">{title}</Txt>
      <Txt variant="small" style={{ marginTop: 2 }}>
        {detail}
      </Txt>
    </View>
  );
}
