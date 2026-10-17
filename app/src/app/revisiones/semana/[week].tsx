import { router, useLocalSearchParams } from "expo-router";
import { Check, Minus, TrendingDown, TrendingUp, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Badge, Bullets, Button, Card, CardHeader, EmptyState, Notice, Txt } from "@/components/ui";
import { useMutation, useQuery } from "@/data/provider";
import { getCheckin } from "@/data/reviews";
import { applyCalorieDecision } from "@/data/services";
import type { MuscleWeek } from "@/domain/review/weekly";
import { MUSCLE_LABEL } from "@/domain/types";
import { msg, t } from "@/i18n";
import { formatShortDate } from "@/lib/dates";
import { formatNumber } from "@/lib/units";
import { radius, space, useColors } from "@/theme";

const AREA_LABEL = { training: msg("Entrenamiento"), nutrition: msg("Nutrición"), recovery: msg("Recuperación"), tracking: msg("Seguimiento") } as const;
const VOLUME_LABEL: Record<MuscleWeek["volume"], string> = { none: msg("sin trabajo"), below: msg("por debajo"), in_range: msg("en rango"), above: msg("por encima") };

export default function WeeklyReport() {
  const colors = useColors();
  const { week } = useLocalSearchParams<{ week: string }>();
  const query = useQuery((db) => getCheckin(db, week), [week]);
  const { run, pending } = useMutation();
  const [message, setMessage] = useState<{ tone: "danger" | "positive"; text: string } | null>(null);
  if (query.data === undefined) return <Loading error={query.error} onRetry={query.reload} />;
  const checkin = query.data;
  if (!checkin) {
    return (
      <Screen>
        <EmptyState title={t("Revisión no encontrada")}>{t("No hay ninguna revisión de esa semana.")}</EmptyState>
      </Screen>
    );
  }
  const { report } = checkin;
  const trained = report.muscles.filter((item) => item.volume !== "none");

  const apply = async () => {
    const result = await run((db) => applyCalorieDecision(db));
    if (!result) return;
    setMessage(result.ok ? { tone: "positive", text: t("Nuevo objetivo: unas {kcal} kcal al día.", { kcal: result.data.calories }) } : { tone: "danger", text: result.error });
  };

  return (
    <Screen title={t("Informe de la semana")} description={t("Del {desde} al {hasta}", { desde: formatShortDate(report.weekStart), hasta: formatShortDate(report.weekEnd) })}>
      <Button size="sm" variant="secondary" onPress={() => router.push({ pathname: "/revisiones/semanal", params: { semana: report.weekStart } })}>
        {t("Corregir respuestas")}
      </Button>

      <Card>
        <CardHeader title={t("1. Resumen de la semana")} />
        <Bullets items={report.summary} textVariant="muted" />
      </Card>
      <Card>
        <CardHeader title={t("2. Evolución del peso")} />
        <Txt variant="muted">{report.weight.text}</Txt>
      </Card>

      <Card>
        <CardHeader
          title={t("3. Rendimiento por grupos musculares")}
          description={t("Series de la semana frente al rango recomendado y comparación con la sesión anterior de los mismos ejercicios.")}
        />
        {trained.length === 0 ? (
          <Notice>{t("No hay series registradas esta semana, así que no se puede valorar el rendimiento.")}</Notice>
        ) : (
          trained.map((item) => (
            <View key={item.muscle} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <View style={{ flex: 1 }}>
                <Txt variant="small" style={{ color: colors.fg }}>
                  {MUSCLE_LABEL[item.muscle]}
                </Txt>
                <Txt variant="tiny" num>
                  {t("{series} series · rango {min}-{max} · {volumen}", {
                    series: formatNumber(item.sets, 1),
                    min: item.target.min,
                    max: item.target.max,
                    volumen: t(VOLUME_LABEL[item.volume]),
                  })}
                </Txt>
              </View>
              <Performance value={item.performance} />
            </View>
          ))
        )}
      </Card>

      <Card>
        <CardHeader title={t("4. Cumplimiento de objetivos")} />
        <View style={{ gap: space.md }}>
          {report.goals.map((goal) => (
            <View key={goal.label} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: goal.met ? colors.toneBg.positive : colors.track,
                }}
              >
                {goal.met ? <Check size={14} color={colors.positive} strokeWidth={3} /> : <X size={14} color={colors.subtle} strokeWidth={3} />}
              </View>
              <Txt style={{ flex: 1 }}>{goal.label}</Txt>
              <Txt variant="small" num>
                {goal.detail}
              </Txt>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <CardHeader title={t("5. Problemas detectados")} />
        {report.problems.length === 0 ? <Txt variant="muted">{t("Ninguno. Buena semana.")}</Txt> : <Bullets items={report.problems} color={colors.warning} textVariant="muted" />}
      </Card>

      <Card>
        <CardHeader title={t("6. Cambios recomendados")} description={t("Solo lo que tus datos justifican. La rutina no se rehace por una semana.")} />
        {message ? <Notice tone={message.tone} style={{ marginBottom: space.md }}>{message.text}</Notice> : null}
        {report.changes.length === 0 ? (
          <Notice tone="positive" title={t("Mantén el plan tal como está")}>
            {t("No hay ningún motivo para cambiar nada: sigue con los mismos ejercicios y deja que la progresión de cargas haga su trabajo.")}
          </Notice>
        ) : (
          <View style={{ gap: space.md }}>
            {report.changes.map((change) => (
              <View key={change.title} style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, gap: 6 }}>
                <Badge>{t(AREA_LABEL[change.area])}</Badge>
                <Txt style={{ fontWeight: "500" }}>{change.title}</Txt>
                <Txt variant="small">{change.detail}</Txt>
                <Txt variant="tiny">{t("Se basa en: {datos}", { datos: change.evidence.join(" ") })}</Txt>
                {change.calorieDelta !== undefined ? (
                  <Button size="sm" variant="secondary" onPress={apply} loading={pending}>
                    {t("Aplicar el ajuste de calorías")}
                  </Button>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <CardHeader title={t("7. Objetivos para la semana siguiente")} />
        <View style={{ gap: space.md }}>
          {report.nextGoals.map((goal, index) => (
            <View key={goal} style={{ flexDirection: "row", gap: space.md }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Txt variant="tiny" num style={{ color: colors.accentFg, fontWeight: "700" }}>
                  {index + 1}
                </Txt>
              </View>
              <Txt style={{ flex: 1 }}>{goal}</Txt>
            </View>
          ))}
        </View>
      </Card>

      <Button variant="ghost" onPress={() => router.push("/analisis")}>
        {t("Ver el detalle de cada grupo muscular")}
      </Button>
    </Screen>
  );
}

function Performance({ value }: { value: MuscleWeek["performance"] }) {
  const colors = useColors();
  if (value === "up") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <TrendingUp size={16} color={colors.positive} />
        <Txt variant="small" style={{ color: colors.positive }}>
          {t("mejora")}
        </Txt>
      </View>
    );
  }
  if (value === "down") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <TrendingDown size={16} color={colors.warning} />
        <Txt variant="small" style={{ color: colors.warning }}>
          {t("baja")}
        </Txt>
      </View>
    );
  }
  if (value === "flat") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Minus size={16} color={colors.muted} />
        <Txt variant="small">{t("igual")}</Txt>
      </View>
    );
  }
  return <Txt variant="tiny">{t("sin referencia")}</Txt>;
}
