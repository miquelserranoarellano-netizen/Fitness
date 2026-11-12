import { Pencil } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Badge, Button, Card, Collapsible, EmptyState, Notice, Row, Txt } from "@/components/ui";
import { setSteps, setWater } from "@/data/daily";
import { getInsights } from "@/data/insights";
import { getNutritionDay } from "@/data/nutrition-day";
import { useMutation, useQuery } from "@/data/provider";
import { applyCalorieDecision, recalculateTarget, setManualTarget } from "@/data/services";
import { updateSettings } from "@/data/settings";
import { dayStatus } from "@/domain/nutrition/intake";
import { calorieFloor } from "@/domain/nutrition/targets";
import { ALLERGEN_LABEL, DIET_LABEL, GOAL_LABEL } from "@/domain/types";
import { CalorieCalendar } from "@/features/nutrition/CalorieCalendar";
import { CalorieRing, MacroBars } from "@/features/nutrition/CalorieRing";
import { AddMealCard, CameraFab, FirstMealCard, StepsCard, WaterCard } from "@/features/nutrition/DailyCards";
import { TargetEditor } from "@/features/nutrition/TargetEditor";
import { msg, t } from "@/i18n";
import { formatDate } from "@/lib/dates";
import { AI_ENABLED } from "@/lib/features";
import { usePhoneSteps } from "@/lib/pedometer";
import { formatNumber, formatSigned } from "@/lib/units";
import { space, useColors } from "@/theme";

const REASON_LABEL = {
  initial: msg("Cálculo inicial"),
  adjustment: msg("Ajuste por tendencia"),
  profile_change: msg("Recalculado"),
  manual: msg("Puesto por ti"),
} as const;

/**
 * Nutrición: el objetivo del día como un anillo que se llena con lo comido, los macros, el agua, los pasos
 * del móvil y el calendario de días cumplidos. Para registrar comida, con la IA encendida, el botón flotante de la
 * cámara (o las opciones del día de hoy en el calendario); sin IA, la tarjeta «Añadir comida» de arriba (código de
 * barras, favoritas o a mano). Ver docs/INTEGRACION-NUTRICION.md y `lib/features.ts`.
 */
export default function Nutrition() {
  const colors = useColors();
  const query = useQuery(async (db) => {
    const insights = await getInsights(db);
    return { insights, day: await getNutritionDay(db, insights.today) };
  });
  const { run, pending } = useMutation();
  const [message, setMessage] = useState<{ tone: "danger" | "positive"; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const savedSteps = query.data?.day.steps?.steps ?? 0;
  const today = query.data?.insights.today;
  const pedometer = usePhoneSteps({
    saved: savedSteps,
    onSteps: (steps) => {
      if (today) void run((db) => setSteps(db, today, steps, "pedometer"));
    },
  });

  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;

  const { insights, day } = query.data;
  const { profile, nutritionTarget: target, calorieDecision: decision } = insights;
  const { intake, settings } = day;

  const recalculate = async () => {
    const result = await run((db) => recalculateTarget(db));
    if (!result) return;
    setEditing(false);
    setMessage(result.ok ? { tone: "positive", text: t("Objetivo recalculado: unas {kcal} kcal al día.", { kcal: result.data.calories }) } : { tone: "danger", text: result.error });
  };
  const apply = async () => {
    const result = await run((db) => applyCalorieDecision(db));
    if (!result) return;
    setMessage(result.ok ? { tone: "positive", text: t("Nuevo objetivo: unas {kcal} kcal al día.", { kcal: result.data.calories }) } : { tone: "danger", text: result.error });
  };

  const fab = AI_ENABLED ? <CameraFab /> : undefined;
  const addMeal = AI_ENABLED ? (day.hasPhotoMeal ? null : <FirstMealCard />) : <AddMealCard />;

  if (!target) {
    return (
      <Screen tab title={t("Nutrición")} floating={fab}>
        {addMeal}
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
  const status = dayStatus({ ...intake, count: intake.entries.length }, target.calories, { date: insights.today, today: insights.today, start: null });
  const canAdjust = decision.action === "increase" || decision.action === "decrease";

  return (
    <Screen tab title={t("Nutrición")} floating={fab}>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {addMeal}

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.sm }}>
          <View style={{ flex: 1 }}>
            <Txt variant="h2">{t("Objetivo diario")}</Txt>
            <Txt variant="tiny">{`${t(REASON_LABEL[target.reason])} · ${formatDate(target.effectiveFrom)}`}</Txt>
          </View>
          <Button variant="secondary" size="sm" icon={Pencil} onPress={() => setEditing(true)}>
            {t("Editar")}
          </Button>
        </View>
        <CalorieRing consumed={intake.calories} goal={target.calories} status={status} />
        <View style={{ marginTop: space.lg }}>
          <MacroBars consumed={intake} target={target} />
        </View>
      </Card>

      {canAdjust ? (
        <Notice tone="info" title={decision.title}>
          <Txt variant="small">{decision.reason}</Txt>
          <Button size="sm" variant="secondary" onPress={apply} loading={pending} style={{ marginTop: space.sm, alignSelf: "flex-start" }}>
            {t("Aplicar el ajuste ({kcal} kcal)", { kcal: formatSigned(decision.deltaKcal, 0) })}
          </Button>
        </Notice>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.lg }}>
        <WaterCard
          ml={day.waterMl}
          goalMl={settings.waterGoalMl}
          onChange={(ml) => void run((db) => setWater(db, insights.today, ml))}
          onGoal={(waterGoalMl) => void run((db) => updateSettings(db, { waterGoalMl }))}
        />
        <StepsCard
          steps={savedSteps}
          goal={settings.stepGoal}
          status={pedometer}
          onManual={(steps) => void run((db) => setSteps(db, insights.today, steps, "manual"))}
          onGoal={(stepGoal) => void run((db) => updateSettings(db, { stepGoal }))}
        />
      </View>

      <CalorieCalendar today={insights.today} />

      <Card>
        <Collapsible title={t("Cómo se ha calculado tu objetivo")}>
          <View style={{ gap: space.md }}>
            {target.reason === "manual" ? <Txt variant="small">{t("Ahora mismo usas un objetivo puesto por ti. Esta es la estimación de la que partía:")}</Txt> : null}
            <View>
              <Row label={t("Metabolismo basal (Mifflin-St Jeor)")} value={`${formatNumber(method.bmr, 0)} kcal`} />
              <Row label={t("Factor de actividad")} value={`× ${formatNumber(method.activityFactor, 2, 2)}`} />
              <Row
                label={t("Gasto diario estimado")}
                value={`${formatNumber(method.maintenance, 0)} kcal (${formatNumber(method.maintenanceRange[0], 0)}-${formatNumber(method.maintenanceRange[1], 0)})`}
              />
              <Row label={method.adjustment >= 0 ? t("Superávit de partida") : t("Déficit de partida")} value={`${formatSigned(method.adjustment, 0)} kcal`} />
              <Row label={t("Peso usado en el cálculo")} value={`${formatNumber(method.weightKg, 1)} kg`} />
            </View>
            <Txt variant="small">
              {t("Objetivo orientado a {objetivo}. Las fórmulas tienen un margen de error de alrededor del 10 %: por eso el objetivo se revisa con la tendencia de tu peso de varias semanas, nunca con una sola pesada.", {
                objetivo: GOAL_LABEL[profile.primaryGoal].toLowerCase(),
              })}
            </Txt>
            <Button variant="secondary" size="sm" onPress={recalculate} loading={pending}>
              {t("Recalcular con mi perfil y peso actuales")}
            </Button>
          </View>
        </Collapsible>
        <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm }}>
          {AI_ENABLED ? <Txt variant="small">{t("Al analizar una comida, la IA avisa si podría contener algo de lo que evitas (Perfil → Alimentación).")}</Txt> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Badge>{DIET_LABEL[profile.dietPreference]}</Badge>
            {profile.allergies.map((allergen) => (
              <Badge key={allergen} tone="warning">
                {t("Sin {alergeno}", { alergeno: ALLERGEN_LABEL[allergen].toLowerCase() })}
              </Badge>
            ))}
          </View>
        </View>
      </Card>

      {editing ? (
        <TargetEditor
          visible
          target={{ ...target, manual: method.manual }}
          floor={calorieFloor(profile.sex)}
          saving={pending}
          onClose={() => setEditing(false)}
          onAutomatic={recalculate}
          onSave={async (calories, split) => {
            const result = await run((db) => setManualTarget(db, { calories, split }));
            if (!result) return;
            if (!result.ok) return setMessage({ tone: "danger", text: result.error });
            setEditing(false);
            setMessage({ tone: "positive", text: t("Objetivo guardado: {kcal} kcal al día.", { kcal: formatNumber(calories, 0) }) });
          }}
        />
      ) : null}
    </Screen>
  );
}
