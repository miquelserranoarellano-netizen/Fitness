import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Badge, Bullets, Card, CardHeader, EmptyState, Notice, Stat, StatRow, Txt } from "@/components/ui";
import { requireProfile } from "@/data/profile";
import { useQuery } from "@/data/provider";
import { getMonthlyReport } from "@/data/reviews";
import { MEASURE_LABEL } from "@/domain/types";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { formatLength, formatSigned, formatWeight, toDisplayLength, toDisplayWeight, weightUnit } from "@/lib/units";
import { space, useColors } from "@/theme";

const KIND_TONE = { confirmed: "warning", aesthetic: "info", strength: "positive", on_track: "neutral", insufficient: "neutral" } as const;

export default function MonthlyReport() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery(async (db) => ({ stored: await getMonthlyReport(db, id), profile: await requireProfile(db) }), [id]);
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { stored, profile } = query.data;
  if (!stored) {
    return (
      <Screen>
        <EmptyState title={t("Informe no encontrado")} />
      </Screen>
    );
  }
  const { report } = stored;
  const { units } = profile;

  return (
    <Screen title={t("Informe mensual")} description={t("Del {desde} al {hasta}", { desde: formatDate(report.periodStart), hasta: formatDate(report.periodEnd) })}>
      <Card>
        <StatRow>
          <Stat
            label={t("Peso")}
            value={report.weight.endKg !== null ? formatWeight(report.weight.endKg, units) : "—"}
            hint={
              report.weight.change && report.weight.startKg !== null
                ? t("{cambio} {unidad} ({porcentaje} %) desde {inicio}", {
                    cambio: formatSigned(toDisplayWeight(report.weight.change.absolute, units), 1),
                    unidad: weightUnit(units),
                    porcentaje: formatSigned(report.weight.change.percent, 1),
                    inicio: formatWeight(report.weight.startKg, units),
                  })
                : t("Sin dos pesadas que comparar en el periodo")
            }
          />
          <Stat
            label={t("Sesiones completadas")}
            value={`${report.adherence.completed}/${report.adherence.planned}`}
            hint={t("{porcentaje} % de lo previsto", { porcentaje: report.adherence.pct })}
          />
          <Stat label={t("Medidas comparadas")} value={report.measures.length} />
        </StatRow>
      </Card>

      {report.measures.length > 0 ? (
        <Card>
          <CardHeader title={t("Medidas: esta medición frente a la anterior")} />
          {report.measures.map((item) => (
            <View key={item.measure} style={{ flexDirection: "row", gap: space.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <Txt variant="small" style={{ flex: 1, color: colors.fg }}>
                {MEASURE_LABEL[item.measure]}
              </Txt>
              <Txt variant="small" num>
                {formatLength(item.fromCm, units)} → <Txt variant="label">{formatLength(item.toCm, units)}</Txt>
              </Txt>
              <Txt variant="tiny" num style={{ width: 92, textAlign: "right" }}>
                {formatSigned(toDisplayLength(item.change.absolute, units), 1)} ({formatSigned(item.change.percent, 1)} %)
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}

      <ListCard title={t("Qué está mejorando")} items={report.improving} empty={t("Todavía no hay mejoras medibles en este periodo.")} color={colors.positive} />
      <ListCard title={t("Qué está estancado")} items={report.stalled} empty={t("Nada estancado según los datos registrados.")} color={colors.warning} />
      <ListCard title={t("Qué conviene cambiar")} items={report.changes} empty="" color={colors.accentFg} />

      {report.findings.length > 0 ? (
        <Card>
          <CardHeader title={t("Grupos musculares")} />
          <View style={{ gap: space.md }}>
            {report.findings.map((finding) => (
              <View key={finding.muscle} style={{ gap: 4 }}>
                <Badge tone={KIND_TONE[finding.kind]}>{finding.label}</Badge>
                <Txt variant="small" style={{ color: colors.fg }}>
                  {finding.title}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {report.missing.length > 0 ? (
        <Notice title={t("Datos que faltan para un informe más completo")}>
          <Bullets items={report.missing} />
        </Notice>
      ) : null}
    </Screen>
  );
}

function ListCard({ title, items, empty, color }: { title: string; items: string[]; empty: string; color: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      {items.length === 0 ? <Txt variant="muted">{empty}</Txt> : <Bullets items={items} color={color} textVariant="muted" />}
    </Card>
  );
}
