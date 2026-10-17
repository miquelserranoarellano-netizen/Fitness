import { router, Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ExternalLink, TrendingUp } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { LineChart } from "@/components/charts";
import { Loading, Screen } from "@/components/screen";
import { Badge, Bullets, Card, CardHeader, EmptyState, Stat, StatRow, Txt } from "@/components/ui";
import { requireProfile } from "@/data/profile";
import { useQuery } from "@/data/provider";
import { getExerciseLogs } from "@/data/sessions";
import { getExercise, videoSearchUrl } from "@/domain/exercises";
import { sessionBestE1rm, workingWeight } from "@/domain/training/progression";
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from "@/domain/types";
import { t } from "@/i18n";
import { formatDate, formatShortDate } from "@/lib/dates";
import { formatNumber, formatSigned, roundDisplay, toDisplayWeight, weightUnit } from "@/lib/units";
import { radius, space, useColors } from "@/theme";

export default function ExerciseScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = getExercise(id);
  const query = useQuery(
    async (db) => ({ profile: await requireProfile(db), logs: exercise ? await getExerciseLogs(db, { exerciseIds: [exercise.id], sinceDays: 730 }) : [] }),
    [id],
  );

  if (!exercise) {
    return (
      <Screen>
        <EmptyState title={t("Ejercicio no encontrado")}>{t("Puede que se haya retirado del catálogo.")}</EmptyState>
      </Screen>
    );
  }
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;

  const { profile, logs } = query.data;
  const unit = weightUnit(profile.units);
  const show = (kg: number) => roundDisplay(toDisplayWeight(kg, profile.units), 1);
  // De más antiguo a más reciente para el gráfico.
  const points = [...logs]
    .reverse()
    .map((log) => ({ date: log.date, value: show(sessionBestE1rm(log.sets)) }))
    .filter((point) => point.value > 0);
  const first = points[0];
  const latest = points[points.length - 1];

  return (
    <>
      <Stack.Screen options={{ title: exercise.name }} />
      <Screen title={exercise.name}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Badge tone="accent">{MUSCLE_LABEL[exercise.primary]}</Badge>
          {exercise.secondary.map((muscle) => (
            <Badge key={muscle}>{MUSCLE_LABEL[muscle]}</Badge>
          ))}
          <Badge>{exercise.kind === "compound" ? t("Multiarticular") : t("Aislamiento")}</Badge>
          {exercise.equipment.map((item) => (
            <Badge key={item}>{EQUIPMENT_LABEL[item]}</Badge>
          ))}
          {exercise.equipment.length === 0 ? <Badge>{t("Sin material")}</Badge> : null}
        </View>

        <Card>
          <CardHeader title={t("Técnica paso a paso")} />
          <View style={{ gap: space.md }}>
            {exercise.steps.map((step, index) => (
              <View key={step} style={{ flexDirection: "row", gap: space.md }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }}>
                  <Txt variant="tiny" num style={{ color: colors.fg, fontWeight: "600" }}>
                    {index + 1}
                  </Txt>
                </View>
                <Txt variant="muted" style={{ flex: 1 }}>
                  {step}
                </Txt>
              </View>
            ))}
          </View>
          <Pressable onPress={() => WebBrowser.openBrowserAsync(videoSearchUrl(exercise))} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.lg }}>
            <Txt variant="small" style={{ color: colors.accentFg, fontWeight: "600" }}>
              {t("Buscar una demostración en vídeo")}
            </Txt>
            <ExternalLink size={14} color={colors.accentFg} />
          </Pressable>
          <Txt variant="tiny" style={{ marginTop: 4 }}>
            {t("Abre una búsqueda en YouTube; los resultados no están revisados por esta aplicación.")}
          </Txt>
        </Card>

        <Card>
          <CardHeader title={t("Errores habituales")} />
          <Bullets items={exercise.mistakes} textVariant="muted" />
        </Card>
        <Card>
          <CardHeader title={t("Consejos de ejecución")} />
          <Bullets items={exercise.cues} textVariant="muted" />
        </Card>
        <Card>
          <CardHeader title={t("Alternativas equivalentes")} description={t("Por si la máquina está ocupada, no la hay o el ejercicio te molesta.")} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {exercise.alternatives.map((alternativeId) => {
              const alternative = getExercise(alternativeId);
              return alternative ? (
                <Pressable
                  key={alternativeId}
                  onPress={() => router.push(`/ejercicio/${alternativeId}`)}
                  style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.raised, justifyContent: "center" }}
                >
                  <Txt variant="small" style={{ color: colors.fg, fontWeight: "500" }}>
                    {alternative.name}
                  </Txt>
                </Pressable>
              ) : null;
            })}
          </View>
        </Card>

        <Card>
          <CardHeader
            title={t("Tu progresión")}
            description={points.length > 0 ? t("Mejor 1RM estimado de cada sesión (fórmula de Epley). Es una estimación: sirve para ver la tendencia, no como marca real.") : undefined}
          />
          {logs.length === 0 ? (
            <EmptyState icon={TrendingUp} title={t("Todavía no has registrado este ejercicio")}>
              {t("Cuando lo hagas en una sesión, aquí verás tus cargas y repeticiones y cómo evolucionan.")}
            </EmptyState>
          ) : (
            <View style={{ gap: space.lg }}>
              {first && latest && points.length >= 2 ? (
                <>
                  <StatRow>
                    <Stat label={t("1RM estimado actual")} value={formatNumber(latest.value, 1)} unit={unit} />
                    <Stat
                      label={t("Desde el {fecha}", { fecha: formatShortDate(first.date) })}
                      value={formatSigned(latest.value - first.value, 1)}
                      unit={unit}
                      hint={`${formatSigned(((latest.value - first.value) / first.value) * 100, 1)} %`}
                    />
                    <Stat label={t("Sesiones")} value={logs.length} />
                  </StatRow>
                  <LineChart unit={unit} series={[{ id: "e1rm", label: t("1RM estimado"), mark: "line", points }]} />
                </>
              ) : null}
              <View>
                {logs.slice(0, 12).map((log) => (
                  <Pressable
                    key={log.sessionId}
                    onPress={() => router.push(`/historial/${log.sessionId}`)}
                    style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 2 }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                      <Txt variant="small">{formatDate(log.date)}</Txt>
                      <Txt variant="small" num>
                        {formatNumber(show(workingWeight(log.sets)), 1)} {unit}
                      </Txt>
                    </View>
                    <Txt variant="small" num style={{ color: colors.fg }}>
                      {log.sets.map((set) => `${formatNumber(show(set.weightKg), 1)} × ${set.reps}`).join(" · ")}
                    </Txt>
                    {log.discomfort >= 2 ? <Badge tone="danger">{t("Molestia")}</Badge> : null}
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </Card>
      </Screen>
    </>
  );
}
