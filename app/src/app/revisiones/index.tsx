import { router } from "expo-router";
import { ClipboardCheck } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Badge, Button, Card, CardHeader, EmptyState, LinkRow, Notice, Txt } from "@/components/ui";
import { listBlocks } from "@/data/blocks";
import { reviewWeekFor } from "@/data/coach";
import { getInsights } from "@/data/insights";
import { useMutation, useQuery } from "@/data/provider";
import { decideRecommendation, listMonthlyReports, listRecommendations } from "@/data/reviews";
import { generateMonthlyReport, startNextBlock } from "@/data/services";
import { SPLIT_LABEL } from "@/domain/training/plan";
import { msg, t, tn } from "@/i18n";
import { appAlert } from "@/lib/alert";
import { addDays, daysBetween, formatDate, formatShortDate } from "@/lib/dates";
import { radius, space, useColors } from "@/theme";

const STATUS_LABEL = { proposed: msg("Pendiente"), accepted: msg("Aceptada"), dismissed: msg("Descartada"), applied: msg("Aplicada") } as const;
const STATUS_TONE = { proposed: "accent", accepted: "positive", dismissed: "neutral", applied: "positive" } as const;
const AREA_LABEL = { training: msg("Entrenamiento"), nutrition: msg("Nutrición"), recovery: msg("Recuperación"), tracking: msg("Seguimiento") } as const;

export default function Reviews() {
  const colors = useColors();
  const query = useQuery(async (db) => ({
    insights: await getInsights(db),
    monthly: await listMonthlyReports(db),
    recommendations: await listRecommendations(db),
    blocks: await listBlocks(db),
  }));
  const { run, pending } = useMutation();
  const [message, setMessage] = useState<string | null>(null);
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;

  const { insights, monthly, recommendations, blocks } = query.data;
  const { today, checkins, training } = insights;
  const block = training.block;
  const week = reviewWeekFor(today, block?.startedOn);
  const done = checkins.some((checkin) => checkin.weekStart === week);
  const blockDays = block ? daysBetween(block.startedOn, today) : 0;
  const blockFinished = block ? training.week > block.weeksPlanned : false;

  const monthlyReport = async () => {
    const result = await run((db) => generateMonthlyReport(db));
    if (!result) return;
    if (!result.ok) return setMessage(result.error);
    setMessage(null);
    router.push(`/revisiones/mes/${result.data.id}`);
  };

  const nextBlock = () =>
    appAlert(
      t("Evaluar el bloque"),
      t("Se cierra el bloque actual con su evaluación y se genera el siguiente a partir de lo que has registrado. Tu historial se conserva."),
      [
        { text: t("Cancelar"), style: "cancel" },
        {
          text: t("Evaluar y generar"),
          onPress: async () => {
            const result = await run((db) => startNextBlock(db));
            if (!result) return;
            if (!result.ok) return setMessage(result.error);
            setMessage(null);
            router.push("/entrenamiento");
          },
        },
      ],
    );

  return (
    <Screen description={t("Cada semana, un repaso rápido. Cada mes, un informe. Al final de cada bloque, el siguiente plan.")}>
      {message ? <Notice tone="danger">{message}</Notice> : null}

      <Card highlight={!done}>
        <CardHeader
          title={t("Revisión semanal")}
          description={t("Semana del {desde} al {hasta}.", { desde: formatShortDate(week), hasta: formatShortDate(addDays(week, 6)) })}
          action={
            done ? (
              <Button size="sm" variant="secondary" onPress={() => router.push(`/revisiones/semana/${week}`)}>
                {t("Ver informe")}
              </Button>
            ) : (
              <Button size="sm" onPress={() => router.push({ pathname: "/revisiones/semanal", params: { semana: week } })}>
                {t("Empezar")}
              </Button>
            )
          }
        />
        <Txt variant="small">
          {done ? t("Ya has hecho la revisión de esta semana.") : t("Siete preguntas breves: entrenamientos, alimentación, sueño, molestias, mejoras, dificultades y peso.")}
        </Txt>
      </Card>

      {block ? (
        <Card>
          <CardHeader
            title={t("Bloque {bloque} · {rutina}", { bloque: block.number, rutina: SPLIT_LABEL[block.split] })}
            description={t("Empezó el {fecha}. Semana {semana} de {semanas}.", {
              fecha: formatDate(block.startedOn),
              semana: Math.min(training.week, block.weeksPlanned),
              semanas: block.weeksPlanned,
            })}
          />
          {blockFinished ? (
            <Notice tone="positive" title={t("Bloque completado")} style={{ marginBottom: space.md }}>
              {t(
                "Al generar el siguiente, se evalúa este con tus registros: se mantiene lo que funciona y solo cambia lo que los datos justifican (más series donde hay un estancamiento confirmado, sustitución de ejercicios con molestias, descarga si hay fatiga acumulada).",
              )}
            </Notice>
          ) : (
            <Txt variant="small" style={{ marginBottom: space.md }}>
              {t("Lo recomendable es completar las {semanas} semanas antes de pasar al siguiente bloque.", { semanas: block.weeksPlanned })}
              {blockDays >= 14
                ? t(" Si necesitas adelantarlo, puedes hacerlo: se evaluará con los datos que haya.")
                : t(" Con menos de dos semanas no hay datos suficientes para evaluarlo.")}
            </Txt>
          )}
          {blockDays >= 14 ? (
            <Button variant={blockFinished ? "primary" : "secondary"} onPress={nextBlock} loading={pending}>
              {t("Evaluar este bloque y generar el siguiente")}
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t("Informes semanales")} />
        {checkins.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t("Aún no hay revisiones")}>
            {t("Tu primera revisión estará aquí cuando la completes.")}
          </EmptyState>
        ) : (
          checkins.slice(0, 16).map((checkin) => (
            <LinkRow
              key={checkin.id}
              title={t("Semana del {fecha}", { fecha: formatShortDate(checkin.weekStart) })}
              subtitle={`${t("{hechos} entrenamientos", { hechos: checkin.report.goals[0]?.detail ?? "" })} · ${tn(checkin.report.changes.length, "{n} cambio recomendado", "{n} cambios recomendados")}`}
              onPress={() => router.push(`/revisiones/semana/${checkin.weekStart}`)}
            />
          ))
        )}
      </Card>

      <Card>
        <CardHeader title={t("Informes mensuales")} description={t("Comparan peso, medidas y rendimiento del periodo: qué mejora, qué se estanca y qué cambiar.")} />
        <Button variant="secondary" onPress={monthlyReport} loading={pending}>
          {t("Generar informe del periodo actual")}
        </Button>
        {monthly.length > 0 ? (
          <View style={{ marginTop: space.md }}>
            {monthly.map((item) => (
              <LinkRow key={item.id} title={`${formatDate(item.periodStart)} – ${formatDate(item.periodEnd)}`} onPress={() => router.push(`/revisiones/mes/${item.id}`)} />
            ))}
          </View>
        ) : null}
        <Button variant="ghost" size="sm" onPress={() => router.push("/informe-inicial")} style={{ marginTop: space.sm }}>
          {t("Ver el informe inicial")}
        </Button>
      </Card>

      <Card>
        <CardHeader title={t("Cambios recomendados y su resultado")} description={t("La memoria de decisiones: qué se propuso, con qué datos y qué hiciste.")} />
        {recommendations.length === 0 ? (
          <Txt variant="small">{t("Todavía no hay recomendaciones. Aparecen al hacer las revisiones semanales.")}</Txt>
        ) : (
          <View style={{ gap: space.md }}>
            {recommendations.map((item) => (
              <View key={item.id} style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, gap: 6 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <Badge tone={STATUS_TONE[item.status]}>{t(STATUS_LABEL[item.status])}</Badge>
                  <Badge>{t(AREA_LABEL[item.area])}</Badge>
                  <Txt variant="tiny">{formatDate(item.createdOn)}</Txt>
                </View>
                <Txt style={{ fontWeight: "500" }}>{item.title}</Txt>
                <Txt variant="small">{item.detail}</Txt>
                {item.outcome ? <Txt variant="tiny">{t("Resultado: {resultado}", { resultado: item.outcome })}</Txt> : null}
                {item.status === "proposed" && item.calorieDelta === null ? (
                  <View style={{ flexDirection: "row", gap: space.sm, marginTop: 4 }}>
                    <Button size="sm" variant="secondary" onPress={() => run((db) => decideRecommendation(db, item.id, "accepted"))}>
                      {t("Lo voy a hacer")}
                    </Button>
                    <Button size="sm" variant="ghost" onPress={() => run((db) => decideRecommendation(db, item.id, "dismissed"))}>
                      {t("Descartar")}
                    </Button>
                  </View>
                ) : null}
                {item.status === "proposed" && item.calorieDelta !== null ? (
                  <Button size="sm" variant="ghost" onPress={() => router.push("/nutricion")}>
                    {t("Aplicarlo desde Nutrición")}
                  </Button>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Card>

      {blocks.filter((item) => item.status === "completed").length > 0 ? (
        <Card>
          <CardHeader title={t("Bloques anteriores")} />
          {blocks
            .filter((item) => item.status === "completed")
            .map((item) => (
              <View key={item.id} style={{ paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line, gap: 4 }}>
                <Txt variant="label">{t("Bloque {bloque} · {rutina}", { bloque: item.number, rutina: SPLIT_LABEL[item.split] })}</Txt>
                <Txt variant="tiny">
                  {formatDate(item.startedOn)}
                  {item.endedOn ? ` – ${formatDate(item.endedOn)}` : ""}
                </Txt>
                {item.evaluation?.summary.map((line) => (
                  <Txt key={line} variant="small">
                    {line}
                  </Txt>
                ))}
              </View>
            ))}
        </Card>
      ) : null}
    </Screen>
  );
}
