import { router } from "expo-router";
import { ArrowLeft, ArrowRight, Lock, Sparkles } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Button, Card, Notice, ProgressBar, Txt } from "@/components/ui";
import { clearState, getState, setState } from "@/data/profile";
import { useData, useMutation, useQuery } from "@/data/provider";
import { completeOnboarding } from "@/data/services";
import { DIET_LABEL, EQUIPMENT_LABEL, GOAL_LABEL, MUSCLE_LABEL } from "@/domain/types";
import { emptyDraft, onboardingFromDraft, validateStep, type Draft, type StepId } from "@/features/onboarding/draft";
import { AvailabilitySection, ExperienceSection, GoalsSection, HabitsSection, NutritionSection, PersonalSection } from "@/features/profile/sections";
import { msg, t, tn } from "@/i18n";
import { lengthUnit, weightUnit } from "@/lib/units";
import { radius, space, useColors } from "@/theme";

type Step = { id: StepId | "intro" | "summary"; title: string; lead: string };

const STEPS: Step[] = [
  { id: "intro", title: msg("Tu entrenador personal"), lead: msg("Un plan de hipertrofia hecho para ti a partir de tus datos, que se ajusta con lo que registras.") },
  { id: "personal", title: msg("Empecemos por ti"), lead: msg("Unos datos básicos para calcular tus necesidades. Podrás cambiarlos cuando quieras.") },
  { id: "goals", title: msg("¿Qué quieres conseguir?"), lead: msg("Tu objetivo decide cómo reparto el entrenamiento y la alimentación.") },
  { id: "experience", title: msg("Tu experiencia"), lead: msg("Para ajustar el volumen, la intensidad y la dificultad técnica de los ejercicios.") },
  // Solo lo que hace falta para la rutina y las calorías, y todo se elige sin escribir. El nombre, las medidas,
  // las marcas, las lesiones, el sueño, el estrés y los gustos de comida se añaden después, en Perfil y Cuerpo.
  { id: "availability", title: msg("Tiempo y material"), lead: msg("La distribución de la rutina depende de los días y el tiempo que tengas de verdad.") },
  { id: "habits", title: msg("Tu día a día"), lead: msg("Tu actividad diaria cambia las calorías que gastas.") },
  { id: "nutrition", title: msg("Alimentación"), lead: msg("Sirve para tus objetivos y para avisarte al registrar comidas.") },
  { id: "summary", title: msg("Todo listo"), lead: msg("Revisa el resumen. Con estos datos prepararé tu informe inicial, tu rutina y tus objetivos nutricionales.") },
];

const DRAFT_KEY = "onboarding:draft";

type Saved = { draft: Draft; index: number };

export default function Welcome() {
  const saved = useQuery((db) => getState<Saved>(db, DRAFT_KEY));
  if (saved.loading && saved.data === undefined) return <Loading />;
  return <Wizard initial={saved.data ?? null} />;
}

function Wizard({ initial }: { initial: Saved | null }) {
  const colors = useColors();
  const { db } = useData();
  const { run, pending } = useMutation();
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), ...(initial?.draft ?? {}) }));
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initial?.index ?? 0), STEPS.length - 1));
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El borrador se guarda en el teléfono para no perderlo si se cierra la app a medias.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState(db, DRAFT_KEY, { draft, index }).catch(() => undefined);
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [db, draft, index]);

  const step = STEPS[index]!;
  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const go = (next: number) => {
    setIndex(next);
    setError(null);
  };

  const next = () => {
    if (step.id !== "summary" && step.id !== "intro") {
      const problem = validateStep(step.id, draft);
      if (problem) return setError(t(problem));
    }
    go(index + 1);
  };

  const submit = async () => {
    for (const [stepIndex, candidate] of STEPS.entries()) {
      if (candidate.id === "summary" || candidate.id === "intro") continue;
      const problem = validateStep(candidate.id, draft);
      if (problem) {
        go(stepIndex);
        return setError(t(problem));
      }
    }
    const result = await run((database) => completeOnboarding(database, onboardingFromDraft(draft)));
    if (!result) return;
    if (!result.ok) return setError(result.error);
    await clearState(db, DRAFT_KEY).catch(() => undefined);
    router.replace("/informe-inicial");
  };

  const section = { draft, update };
  const counted = STEPS.length - 1;

  return (
    <Screen
      key={step.id}
      tab
      eyebrow={index === 0 ? undefined : t("Paso {paso} de {total}", { paso: index, total: counted })}
      title={t(step.title)}
      description={t(step.lead)}
      footer={
        <View style={{ flexDirection: "row", gap: space.md }}>
          {index > 0 ? <Button variant="secondary" size="lg" icon={ArrowLeft} onPress={() => go(index - 1)} disabled={pending} accessibilityLabel={t("Paso anterior")} /> : null}
          {step.id === "summary" ? (
            <Button size="lg" icon={Sparkles} onPress={submit} loading={pending} style={{ flex: 1 }} full>
              {pending ? t("Preparando tu plan…") : t("Generar mi plan")}
            </Button>
          ) : (
            <Button size="lg" onPress={next} style={{ flex: 1 }} full>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Txt style={{ color: colors.accentInk, fontWeight: "600" }}>{index === 0 ? t("Empezar") : t("Continuar")}</Txt>
                <ArrowRight size={18} color={colors.accentInk} />
              </View>
            </Button>
          )}
        </View>
      }
    >
      {index > 0 ? <ProgressBar value={index / counted} /> : null}

      {step.id === "intro" && <Intro />}
      {step.id === "personal" && <PersonalSection {...section} brief />}
      {step.id === "goals" && <GoalsSection {...section} brief />}
      {step.id === "experience" && <ExperienceSection {...section} brief />}
      {step.id === "availability" && <AvailabilitySection {...section} />}
      {step.id === "habits" && <HabitsSection {...section} brief />}
      {step.id === "nutrition" && <NutritionSection {...section} brief />}
      {step.id === "summary" && <Summary draft={draft} onEdit={go} />}

      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Screen>
  );
}

function Intro() {
  const colors = useColors();
  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <View style={{ gap: space.md }}>
          <Point title={t("Rutina por reglas, no inventada")}>
            {t("Elijo la distribución, los ejercicios y el volumen según tus días, tu nivel y tus prioridades, y te explico el porqué.")}
          </Point>
          <Point title={t("Modo entrenamiento")}>{t("Registras cada serie en el gimnasio y te sugiero la carga de la próxima vez.")}</Point>
          <Point title={t("Seguimiento con tendencias")}>{t("Peso semanal, medidas mensuales, revisiones y puntos fuertes y débiles con datos reales.")}</Point>
        </View>
      </Card>
      <View style={{ flexDirection: "row", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
        <Lock size={20} color={colors.muted} />
        <View style={{ flex: 1, gap: 6 }}>
          <Txt style={{ fontWeight: "600" }}>{t("Tus datos se quedan en este teléfono")}</Txt>
          <Txt variant="small">
            {t(
              "Vas a indicar datos de salud (peso y medidas). Se guardan solo en este dispositivo: no hay cuenta. Lo único que sale del teléfono son las comidas que decidas analizar (su foto o su texto, con las alergias que hayas indicado), que van a tu servidor para reconocer los alimentos. Puedes exportar o borrar tus datos desde Perfil cuando quieras. Al continuar aceptas guardarlos aquí con ese fin.",
            )}
          </Txt>
          <Txt variant="small">{t("Esta aplicación no hace diagnósticos médicos. Si tienes dolor o una lesión, consulta a un profesional sanitario.")}</Txt>
        </View>
      </View>
    </View>
  );
}

function Point({ title, children }: { title: string; children: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentFg, marginTop: 7 }} />
      <View style={{ flex: 1 }}>
        <Txt style={{ fontWeight: "600" }}>{title}</Txt>
        <Txt variant="small">{children}</Txt>
      </View>
    </View>
  );
}

function Summary({ draft, onEdit }: { draft: Draft; onEdit: (index: number) => void }) {
  const colors = useColors();
  const at = (id: StepId) => STEPS.findIndex((step) => step.id === id);
  const rows: { label: string; value: string; step: number }[] = [
    {
      label: t("Tú"),
      value: t("{edad} años · {altura} {unidadAltura} · {peso} {unidadPeso}", {
        edad: draft.age,
        altura: draft.height,
        unidadAltura: lengthUnit(draft.units),
        peso: draft.weight,
        unidadPeso: weightUnit(draft.units),
      }),
      step: at("personal"),
    },
    {
      label: t("Objetivo"),
      value: [
        draft.primaryGoal ? GOAL_LABEL[draft.primaryGoal] : "",
        draft.priorityMuscles.length > 0
          ? t("prioridad: {musculos}", { musculos: draft.priorityMuscles.map((muscle) => MUSCLE_LABEL[muscle].toLowerCase()).join(", ") })
          : t("sin prioridades musculares"),
      ].join(" · "),
      step: at("goals"),
    },
    {
      label: t("Entrenamiento"),
      value: t("{dias} días por semana · {minutos} min por sesión", { dias: draft.daysPerWeek ?? "", minutos: draft.sessionMinutes ?? "" }),
      step: at("availability"),
    },
    { label: t("Material"), value: draft.equipment.map((item) => EQUIPMENT_LABEL[item].toLowerCase()).join(", "), step: at("availability") },
    {
      label: t("Alimentación"),
      value: `${draft.dietPreference ? DIET_LABEL[draft.dietPreference] : ""}${
        draft.allergies.length > 0 ? ` · ${tn(draft.allergies.length, "{n} alergia indicada", "{n} alergias indicadas")}` : ""
      }`,
      step: at("nutrition"),
    },
  ];

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
        {rows.map((row, position) => (
          <View
            key={row.label}
            style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start", padding: space.md, borderTopWidth: position === 0 ? 0 : 1, borderTopColor: colors.line }}
          >
            <View style={{ flex: 1 }}>
              <Txt variant="tiny" style={{ fontWeight: "500" }}>
                {row.label}
              </Txt>
              <Txt variant="small" style={{ color: colors.fg, marginTop: 2 }}>
                {row.value}
              </Txt>
            </View>
            <Pressable onPress={() => onEdit(row.step)} hitSlop={8}>
              <Txt variant="small" style={{ color: colors.accentFg, fontWeight: "500" }}>
                {t("Cambiar")}
              </Txt>
            </Pressable>
          </View>
        ))}
      </View>
      <Notice tone="warning" title={t("Si tienes alguna lesión o molestia")}>
        {t(
          "Añádela en Más → Perfil, en «Lesiones, molestias y limitaciones», antes de entrenar y genera la rutina de nuevo, para que evite los ejercicios que cargan esa zona. En Perfil también puedes poner tu nombre, tus marcas, los ejercicios que te gustan o prefieres evitar y tus gustos de comida; las medidas, en «Cuerpo».",
        )}
      </Notice>
      <Notice title={t("Qué voy a hacer con estos datos")}>
        {t(
          "Calcular tu nivel, elegir la distribución de entrenamiento que mejor encaja con tus días, repartir el volumen según tus prioridades y estimar tus calorías y macronutrientes. Son cálculos con reglas explícitas: en el informe verás el porqué de cada decisión.",
        )}
      </Notice>
    </View>
  );
}
