import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Badge, Button, Card, CardHeader, Collapsible, EmptyState, Notice, ProgressBar, Row, Stat, StatRow, Txt } from "@/components/ui";
import { getInsights } from "@/data/insights";
import { listNutritionTargets } from "@/data/nutrition";
import { useMutation, useQuery } from "@/data/provider";
import { applyCalorieDecision, recalculateTarget } from "@/data/services";
import { ALLERGEN_LABEL, DIET_LABEL, GOAL_LABEL } from "@/domain/types";
import { AddMealButtons, MealThumb } from "@/features/meals/components";
import { msg, t } from "@/i18n";
import { getDayIntake } from "@/integrations/nutrition/store";
import { formatDate, formatTime } from "@/lib/dates";
import { formatNumber, formatSigned } from "@/lib/units";
import { space, useColors } from "@/theme";

const REASON_LABEL = { initial: msg("Cálculo inicial"), adjustment: msg("Ajuste por tendencia"), profile_change: msg("Recalculado") } as const;

/**
 * Nutrición: CUÁNTO comer (calorías y macros, y si hay que ajustarlo según la tendencia del peso) y
 * QUÉ se ha comido hoy, con los botones para registrarlo (pantallas de `comida/`). Ver
 * docs/INTEGRACION-NUTRICION.md.
 */
export default function Nutrition() {
  const colors = useColors();
  const router = useRouter();
  const query = useQuery(async (db) => {
    const insights = await getInsights(db);
    return { insights, history: await listNutritionTargets(db), intake: await getDayIntake(db, insights.today) };
  });
  const { run, pending } = useMutation();
  const [message, setMessage] = useState<{ tone: "danger" | "positive"; text: string } | null>(null);
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;

  const { insights, history, intake } = query.data;
  const { profile, nutritionTarget: target, calorieDecision: decision } = insights;

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

      {/* Lo comido hoy y cómo registrarlo. La pantalla completa (tira semanal, agua, pasos) llega en la fase 6. */}
      <Card>
        <CardHeader title={t("Lo que comes hoy")} eyebrow={formatDate(insights.today)} />
        <View style={{ gap: space.lg }}>
          <Meter label={t("Calorías")} value={intake.calories} target={target.calories} unit="kcal" />
          <Meter label={t("Proteína")} value={intake.proteinG ?? 0} target={target.proteinG} unit="g" />
          {intake.carbsG !== null ? <Meter label={t("Carbohidratos")} value={intake.carbsG} target={target.carbsG} unit="g" /> : null}
          {intake.fatG !== null ? <Meter label={t("Grasas")} value={intake.fatG} target={target.fatG} unit="g" /> : null}
          {intake.entries.length > 0 ? (
            <View>
              {intake.entries.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => router.push({ pathname: "/comida/[id]", params: { id: entry.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={t("Corregir {comida}", { comida: entry.name })}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, opacity: pressed ? 0.7 : 1 })}
                >
                  <MealThumb uri={entry.photoUri} size={36} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="small" style={{ color: colors.fg }} numberOfLines={1}>
                      {entry.name}
                    </Txt>
                    <Txt variant="tiny" num>
                      {formatTime(entry.eatenAt)}
                    </Txt>
                  </View>
                  <Txt variant="small" num>
                    {formatNumber(entry.calories, 0)} kcal
                  </Txt>
                  <ChevronRight size={16} color={colors.subtle} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Txt variant="small">{t("Aún no has registrado nada hoy. Haz una foto del plato, escríbelo o escanea el código de barras.")}</Txt>
          )}
          <AddMealButtons />
        </View>
      </Card>

      <Card>
        <CardHeader title={t("Tus preferencias")} description={t("Al analizar una comida, la IA avisa si podría contener algo de lo que evitas. Puedes cambiarlas en Perfil → Alimentación.")} />
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

function Meter({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt variant="small">{label}</Txt>
        <Txt variant="small" num style={{ color: colors.fg }}>
          {formatNumber(value, 0)} / {formatNumber(target, 0)} {unit}
        </Txt>
      </View>
      <ProgressBar value={target > 0 ? value / target : 0} tone="info" />
    </View>
  );
}
