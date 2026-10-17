import { View } from "react-native";
import { RangeBars } from "@/components/charts";
import { Loading, Screen } from "@/components/screen";
import { Badge, Bullets, Card, CardHeader, Notice, Stat, StatRow, Txt } from "@/components/ui";
import { getInsights } from "@/data/insights";
import { useQuery } from "@/data/provider";
import { FINDING_LABEL, type Finding, type FindingKind } from "@/domain/analysis/weakpoints";
import { MUSCLES, MUSCLE_LABEL } from "@/domain/types";
import { msg, t } from "@/i18n";
import { space, useColors } from "@/theme";

const TONE: Record<FindingKind, "warning" | "info" | "positive" | "neutral"> = {
  confirmed: "warning",
  aesthetic: "info",
  strength: "positive",
  on_track: "neutral",
  insufficient: "neutral",
};

const GROUPS: { kind: FindingKind; title: string; description: string }[] = [
  {
    kind: "confirmed",
    title: msg("Debilidades confirmadas por datos de rendimiento"),
    description: msg("Grupos cuya progresión se ha detenido mientras otros avanzan, con sesiones suficientes para afirmarlo."),
  },
  {
    kind: "aesthetic",
    title: msg("Posibles áreas de mejora estética"),
    description: msg("Lo que tú percibes o lo que apuntan las medidas, todavía sin evidencia de rendimiento que lo confirme."),
  },
  { kind: "strength", title: msg("Puntos fuertes"), description: msg("Grupos con una progresión clara y sostenida.") },
  { kind: "on_track", title: msg("Evolucionan con normalidad"), description: msg("Sin nada que cambiar.") },
  {
    kind: "insufficient",
    title: msg("Información insuficiente"),
    description: msg("Faltan registros para sacar una conclusión. No se valora ningún músculo por una medida aislada ni por una fotografía."),
  },
];

export default function Analysis() {
  const colors = useColors();
  const query = useQuery(getInsights);
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { findings, stats, targets, profile, training, adherence } = query.data;
  const count = (kind: FindingKind) => findings.filter((finding) => finding.kind === kind).length;
  const hasSessions = training.sessions.length > 0;

  return (
    <Screen description={t("Puntos fuertes y débiles a partir de tus registros: rendimiento por ejercicio, volumen semanal, medidas, adherencia y recuperación.")}>
      <Card>
        <StatRow>
          <Stat label={t("Debilidades confirmadas")} value={count("confirmed")} />
          <Stat label={t("Posibles áreas de mejora")} value={count("aesthetic")} />
          <Stat label={t("Puntos fuertes")} value={count("strength")} />
          <Stat label={t("Sin datos suficientes")} value={count("insufficient")} hint={t("de {n} grupos", { n: MUSCLES.length })} />
          <Stat
            label={t("Adherencia reciente")}
            value={adherence === null ? "—" : `${Math.round(adherence * 100)} %`}
            hint={adherence === null ? t("Aún sin semanas completas") : t("Últimas 4 semanas cerradas")}
          />
        </StatRow>
      </Card>

      {!hasSessions ? (
        <Notice tone="info" title={t("El análisis empieza con tus primeras sesiones")}>
          {t(
            "Hacen falta al menos 3 sesiones registradas de un grupo muscular, repartidas en dos semanas o más, para valorar su progresión. Hasta entonces verás casi todo como «información insuficiente»: es lo correcto, no un error.",
          )}
        </Notice>
      ) : null}

      {GROUPS.map((group) => {
        const items = findings.filter((finding) => finding.kind === group.kind);
        if (items.length === 0) return null;
        const compact = group.kind === "on_track" || group.kind === "insufficient";
        return (
          <View key={group.kind} style={{ gap: space.md }}>
            <View style={{ gap: 4, marginTop: space.sm }}>
              <Txt variant="h2">{t(group.title)}</Txt>
              <Txt variant="small">{t(group.description)}</Txt>
            </View>
            {compact ? (
              <Card>
                {items.map((finding, index) => (
                  <View key={finding.muscle} style={{ paddingVertical: space.md, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line, gap: 4 }}>
                    <Txt variant="label">{finding.title}</Txt>
                    <Txt variant="small">{finding.evidence.join(" ")}</Txt>
                    {finding.kind === "insufficient" ? <Txt variant="tiny">{finding.proposal}</Txt> : null}
                  </View>
                ))}
              </Card>
            ) : (
              items.map((finding) => <FindingCard key={finding.muscle} finding={finding} priority={profile.priorityMuscles.includes(finding.muscle)} />)
            )}
          </View>
        );
      })}

      {hasSessions ? (
        <Card>
          <CardHeader title={t("Volumen real por grupo muscular")} description={t("Series semanales medias que has registrado en las últimas 4 semanas, frente al rango de tu plan.")} />
          <RangeBars
            unit={t("series")}
            items={MUSCLES.map((muscle) => ({
              id: muscle,
              label: MUSCLE_LABEL[muscle],
              value: stats[muscle].weeklySets,
              min: targets[muscle].min,
              max: targets[muscle].max,
              tag: profile.priorityMuscles.includes(muscle) ? t("prioridad") : undefined,
            }))}
          />
        </Card>
      ) : null}

      <Txt variant="tiny">
        {t(
          "En la versión web, una IA opcional puede explicar este análisis en lenguaje llano. En la app no está disponible: necesitaría un servidor para proteger la clave. Todo lo que ves aquí sale de reglas sobre tus datos.",
        )}
      </Txt>
    </Screen>
  );
}

function FindingCard({ finding, priority }: { finding: Finding; priority: boolean }) {
  return (
    <Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Badge tone={TONE[finding.kind]}>{FINDING_LABEL[finding.kind]}</Badge>
        {priority ? <Badge tone="accent">{t("Prioritario")}</Badge> : null}
      </View>
      <Txt variant="h2" style={{ marginTop: space.md }}>
        {finding.title}
      </Txt>
      <View style={{ gap: space.md, marginTop: space.md }}>
        <View style={{ gap: 6 }}>
          <Txt variant="label">{t("Evidencia")}</Txt>
          <Bullets items={finding.evidence} />
        </View>
        {finding.causes.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Txt variant="label">{t("Posibles causas")}</Txt>
            <Bullets items={finding.causes} />
          </View>
        ) : null}
        <View style={{ gap: 4 }}>
          <Txt variant="label">{t("Propuesta")}</Txt>
          <Txt variant="small">{finding.proposal}</Txt>
        </View>
        <View style={{ gap: 4 }}>
          <Txt variant="label">{t("Indicador de éxito")}</Txt>
          <Txt variant="small">{finding.successIndicator}</Txt>
        </View>
      </View>
    </Card>
  );
}
