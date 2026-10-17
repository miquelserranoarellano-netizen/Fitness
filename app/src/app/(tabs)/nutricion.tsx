import { Camera, Plug } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Badge, Button, Card, CardHeader, Collapsible, EmptyState, Notice, ProgressBar, Row, Stat, StatRow, Txt } from "@/components/ui";
import { getInsights } from "@/data/insights";
import { listNutritionTargets } from "@/data/nutrition";
import { useMutation, useQuery } from "@/data/provider";
import { applyCalorieDecision, recalculateTarget } from "@/data/services";
import { ALLERGEN_LABEL, DIET_LABEL, GOAL_LABEL } from "@/domain/types";
import { msg, t } from "@/i18n";
import { connectedSources } from "@/integrations/nutrition/sources";
import { getDayIntake } from "@/integrations/nutrition/store";
import { formatDate, formatTime } from "@/lib/dates";
import { formatNumber, formatSigned } from "@/lib/units";
import { radius, space, useColors } from "@/theme";

const REASON_LABEL = { initial: msg("Cálculo inicial"), adjustment: msg("Ajuste por tendencia"), profile_change: msg("Recalculado") } as const;

/**
 * Nutrición «a medias», a propósito: esta app calcula CUÁNTO comer (calorías y macros, y si hay que
 * ajustarlo según la tendencia del peso). QUÉ se come lo aportará la app de fotos de comida cuando se
 * combinen; su hueco está en «Lo que comes hoy» (ver docs/INTEGRACION-NUTRICION.md).
 */
export default function Nutrition() {
  const colors = useColors();
  const query = useQuery(async (db) => {
    const insights = await getInsights(db);
    return { insights, history: await listNutritionTargets(db), intake: await getDayIntake(db, insights.today) };
  });
  const { run, pending } = useMutation();
  const [message, setMessage] = useState<{ tone: "danger" | "positive"; text: string } | null>(null);
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;

  const { insights, history, intake } = query.data;
  const { profile, nutritionTarget: target, calorieDecision: decision } = insights;
  const sources = connectedSources();

  const recalculate = async () => {
    const result = await run((db) => recalculateTarget(db));
    if (!result) return;
    setMessage(result.ok ? { tone: "positive", text: t("Objetivo recalculado: unas {kcal} kcal al día.", { kcal: result.data.calories }) } : { tone: "danger", text: result.error });
  };
  const apply = async () => {
    const result = await run((db) => applyCalorieDecision(db));
    if (!result) return;
    setMessage(result.ok ? { tone: "positive", text: t("Nuevo objetivo: unas {kcal} kcal al día.", { kcal: result.data.calories }) } : { tone: "danger", text: result.error });
  };

  if (!target) {
    return (
      <Screen tab title={t("Nutrición")}>
        <Card>
          <EmptyState title={t("Aún no hay objetivo nutricional")} action={<Button onPress={recalculate} loading={pending}>{t("Calcular ahora")}</Button>}>
            {t("Se calcula a partir de tu perfil y de tu último peso.")}
          </EmptyState>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        </Card>
      </Screen>
    );
  }

  const method = target.method;
  const canAdjust = decision.action === "increase" || decision.action === "decrease";

  return (
    <Screen
      tab
      title={t("Nutrición")}
      description={t("Objetivo orientado a {objetivo}. Las cifras son estimaciones de partida que se corrigen con la evolución real de tu peso.", {
        objetivo: GOAL_LABEL[profile.primaryGoal].toLowerCase(),
      })}
    >
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Card>
        <CardHeader title={t("Objetivo diario")} eyebrow={`${t(REASON_LABEL[target.reason])} · ${formatDate(target.effectiveFrom)}`} />
        <StatRow>
          <Stat label={t("Calorías")} value={`≈ ${formatNumber(target.calories, 0)}`} unit="kcal" />
          <Stat
            label={t("Proteína")}
            value={target.proteinG}
            unit="g"
            hint={method.weightKg ? t("{gramos} g por kg de peso", { gramos: formatNumber(target.proteinG / method.weightKg, 1) }) : undefined}
          />
          <Stat label={t("Carbohidratos")} value={target.carbsG} unit="g" />
          <Stat label={t("Grasas")} value={target.fatG} unit="g" />
        </StatRow>
        <View style={{ marginTop: space.lg, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Collapsible title={t("Cómo se ha calculado")}>
            <View style={{ gap: space.md }}>
              <View>
                <Row label={t("Metabolismo basal (Mifflin-St Jeor)")} value={`${formatNumber(method.bmr, 0)} kcal`} />
                <Row label={t("Factor de actividad")} value={`× ${formatNumber(method.activityFactor, 2, 2)}`} />
                <Row
                  label={t("Gasto diario estimado")}
                  value={`${formatNumber(method.maintenance, 0)} kcal (${formatNumber(method.maintenanceRange[0], 0)}-${formatNumber(method.maintenanceRange[1], 0)})`}
                />
                <Row label={method.adjustment >= 0 ? t("Superávit de partida") : t("Déficit de partida")} value={`${formatSigned(method.adjustment, 0)} kcal`} />
                <Row label={t("Peso usado en el cálculo")} value={`${formatNumber(method.weightKg, 1)} kg`} />
                <Row
                  label={t("Ritmo de peso buscado")}
                  value={t("{desde} a {hasta} % semanal", { desde: formatSigned(method.targetRatePct[0], 2), hasta: formatSigned(method.targetRatePct[1], 2) })}
                />
              </View>
              {method.decision ? (
                <Txt variant="small">
                  {t("Último ajuste ({kcal} kcal): {motivo}", { kcal: formatSigned(method.decision.deltaKcal, 0), motivo: method.decision.reason })}
                </Txt>
              ) : null}
              {method.notes.map((note) => (
                <Txt key={note} variant="small">
                  {note}
                </Txt>
              ))}
              <Txt variant="small">
                {t(
                  "Las fórmulas de gasto energético tienen un margen de error individual de alrededor del 10 %. Por eso el objetivo se revisa con la tendencia de varias semanas y nunca con una sola pesada. No se puede prometer una cantidad concreta de músculo ganado.",
                )}
              </Txt>
              <Button variant="secondary" size="sm" onPress={recalculate} loading={pending}>
                {t("Recalcular con mi perfil y peso actuales")}
              </Button>
            </View>
          </Collapsible>
        </View>
      </Card>

      <Card>
        <CardHeader title={t("¿Hay que ajustar las calorías?")} eyebrow={t("Según tu tendencia de peso")} />
        <Txt style={{ fontWeight: "600" }}>{decision.title}</Txt>
        <Txt variant="small" style={{ marginTop: 4 }}>
          {decision.reason}
        </Txt>
        {canAdjust ? (
          <Button onPress={apply} loading={pending} style={{ marginTop: space.md }}>
            {t("Aplicar el ajuste ({kcal} kcal)", { kcal: formatSigned(decision.deltaKcal, 0) })}
          </Button>
        ) : null}
      </Card>

      {/* El hueco para la app de fotos de comida. */}
      <Card style={{ borderStyle: "dashed", borderColor: colors.lineStrong }}>
        <CardHeader
          title={t("Lo que comes hoy")}
          eyebrow={sources.length > 0 ? sources.map((source) => source.label).join(" · ") : t("Pendiente de conectar")}
          action={<Camera size={22} color={colors.subtle} />}
        />
        {intake.entries.length > 0 ? (
          <View style={{ gap: space.lg }}>
            <Meter label={t("Calorías")} value={intake.calories} target={target.calories} unit="kcal" />
            {intake.proteinG !== null ? <Meter label={t("Proteína")} value={intake.proteinG} target={target.proteinG} unit="g" /> : null}
            {intake.carbsG !== null ? <Meter label={t("Carbohidratos")} value={intake.carbsG} target={target.carbsG} unit="g" /> : null}
            {intake.fatG !== null ? <Meter label={t("Grasas")} value={intake.fatG} target={target.fatG} unit="g" /> : null}
            <View>
              {intake.entries.map((entry) => (
                <View key={entry.id} style={{ flexDirection: "row", gap: space.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <Txt variant="tiny" num style={{ width: 40 }}>
                    {formatTime(entry.eatenAt)}
                  </Txt>
                  <Txt variant="small" style={{ flex: 1, color: colors.fg }} numberOfLines={1}>
                    {entry.name}
                  </Txt>
                  <Txt variant="small" num>
                    {formatNumber(entry.calories, 0)} kcal
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.bg }}>
              <Plug size={18} color={colors.muted} style={{ marginTop: 2 }} />
              <Txt variant="small" style={{ flex: 1 }}>
                {t(
                  "Aquí aparecerán las comidas que registres haciéndoles una foto con la app de alimentación, y cuánto llevas del objetivo de hoy. Esa parte se conectará más adelante: por ahora no hay nada que registrar aquí.",
                )}
              </Txt>
            </View>
            <Meter label={t("Calorías")} value={0} target={target.calories} unit="kcal" muted />
            <Meter label={t("Proteína")} value={0} target={target.proteinG} unit="g" muted />
          </View>
        )}
      </Card>

      <Card>
        <CardHeader title={t("Tus preferencias")} description={t("Guardadas para cuando se conecte la parte de comidas. Puedes cambiarlas en Perfil → Alimentación.")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Badge>{DIET_LABEL[profile.dietPreference]}</Badge>
          <Badge>{t("{n} comidas al día", { n: profile.mealsPerDay })}</Badge>
          {profile.allergies.map((allergen) => (
            <Badge key={allergen} tone="warning">
              {t("Sin {alergeno}", { alergeno: ALLERGEN_LABEL[allergen].toLowerCase() })}
            </Badge>
          ))}
        </View>
      </Card>

      {history.length > 1 ? (
        <Card>
          <CardHeader title={t("Historial de objetivos")} />
          {history.map((item) => (
            <View key={item.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 2 }}>
              <Txt variant="tiny">
                {formatDate(item.effectiveFrom)} · {t(REASON_LABEL[item.reason])}
              </Txt>
              <Txt variant="small" num style={{ color: colors.fg }}>
                {t("{kcal} kcal · {p} g P · {h} g H · {g} g G", { kcal: item.calories, p: item.proteinG, h: item.carbsG, g: item.fatG })}
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function Meter({ label, value, target, unit, muted }: { label: string; value: number; target: number; unit: string; muted?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6, opacity: muted ? 0.5 : 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt variant="small">{label}</Txt>
        <Txt variant="small" num style={{ color: colors.fg }}>
          {muted ? "—" : formatNumber(value, 0)} / {formatNumber(target, 0)} {unit}
        </Txt>
      </View>
      <ProgressBar value={target > 0 ? value / target : 0} tone="info" />
    </View>
  );
}
