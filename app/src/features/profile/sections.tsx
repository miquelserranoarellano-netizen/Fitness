import { Plus, Trash2 } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ExercisePicker } from "@/components/ExercisePicker";
import { Chips, Field, Input, OptionCards, optionsOf, Segmented, Toggle, UnitInput } from "@/components/form";
import { Button, Notice, Txt } from "@/components/ui";
import { MARK_LIFTS, MARK_LIFT_LABEL } from "@/domain/training/level";
import {
  ALLERGENS,
  ALLERGEN_LABEL,
  APPETITE,
  APPETITE_LABEL,
  BODY_AREAS,
  BODY_AREA_LABEL,
  DIETS,
  DIET_LABEL,
  EQUIPMENT,
  EQUIPMENT_LABEL,
  EXPERIENCE,
  EXPERIENCE_LABEL,
  GOALS,
  GOAL_LABEL,
  JOB_ACTIVITY,
  JOB_ACTIVITY_LABEL,
  LIMITATION_KINDS,
  LIMITATION_KIND_LABEL,
  MEASURES,
  MEASURE_HELP,
  MEASURE_LABEL,
  MUSCLES,
  MUSCLE_LABEL,
  SECONDARY_GOALS,
  SECONDARY_GOAL_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  SEXES,
  SEX_LABEL,
  STRESS,
  STRESS_LABEL,
  WEEKDAY_LABEL,
  type BodyArea,
  type Goal,
  type LimitationKind,
  type Severity,
} from "@/domain/types";
import type { Draft } from "@/features/onboarding/draft";
import { msg, t } from "@/i18n";
import { lengthUnit, weightUnit } from "@/lib/units";
import { radius, space, useColors } from "@/theme";
import { MeasureGuide } from "./MeasureGuide";

/**
 * Secciones del perfil, las mismas que la web. Las usa el cuestionario inicial (un paso cada una) y
 * la pantalla de Perfil (plegadas, con un único «Guardar»).
 */

export type SectionProps = {
  draft: Draft;
  /** Aplica un cambio parcial al borrador. */
  update: (patch: Partial<Draft>) => void;
};

const GOAL_HELP: Record<Goal, string> = {
  muscle_gain: msg("Más volumen y tamaño, con un superávit calórico moderado."),
  fat_loss: msg("Reducir grasa conservando el músculo, con un déficit moderado."),
  recomposition: msg("Perder grasa y ganar músculo a la vez, despacio y sin cambiar mucho de peso."),
  strength: msg("Mover más peso en los ejercicios básicos."),
  maintenance: msg("Conservar lo que tengo con el mínimo esfuerzo necesario."),
};

const Gap = ({ children }: { children: ReactNode }) => <View style={{ gap: space.xl }}>{children}</View>;

/** «p. ej. 25» */
const example = (value: string) => t("p. ej. {ejemplo}", { ejemplo: value });

export function PersonalSection({ draft, update, showWeight = true }: SectionProps & { showWeight?: boolean }) {
  return (
    <Gap>
      <Field label={t("¿Cómo quieres que te llame?")}>
        <Input value={draft.displayName} onChangeText={(displayName) => update({ displayName })} maxLength={40} autoCapitalize="words" />
      </Field>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Field label={t("Edad")} style={{ flex: 1 }}>
          <UnitInput unit={t("años")} integer value={draft.age} onChangeText={(age) => update({ age })} placeholder={example("25")} />
        </Field>
        <Field label={t("Altura")} style={{ flex: 1 }}>
          <UnitInput
            unit={lengthUnit(draft.units)}
            value={draft.height}
            onChangeText={(height) => update({ height })}
            placeholder={draft.units === "metric" ? example("180") : example("71")}
          />
        </Field>
      </View>
      {showWeight ? (
        <Field label={t("Peso actual")} hint={t("Si puedes, pésate por la mañana, después de ir al baño y antes de comer. Será tu punto de partida.")}>
          <UnitInput
            unit={weightUnit(draft.units)}
            value={draft.weight}
            onChangeText={(weight) => update({ weight })}
            placeholder={draft.units === "metric" ? example("68") : example("150")}
          />
        </Field>
      ) : null}
      <Field label={t("Sexo")} hint={t("Solo se usa para estimar tu gasto energético. Si prefieres no indicarlo, la estimación tendrá más margen de error.")}>
        <Segmented options={optionsOf(SEXES, SEX_LABEL)} value={draft.sex} onChange={(sex) => update({ sex })} />
      </Field>
      <Field label={t("Unidades")}>
        <Segmented
          options={[
            { value: "metric" as const, label: t("Métrico (kg, cm)") },
            { value: "imperial" as const, label: t("Imperial (lb, in)") },
          ]}
          value={draft.units}
          onChange={(units) => update({ units })}
        />
      </Field>
      <Field label={t("País")} optional hint={t("Ayuda a la futura parte de alimentación a proponer comidas habituales donde vives.")}>
        <Input value={draft.country} onChangeText={(country) => update({ country })} maxLength={60} autoCapitalize="words" />
      </Field>
    </Gap>
  );
}

export function GoalsSection({ draft, update }: SectionProps) {
  return (
    <Gap>
      <Field label={t("Objetivo principal")}>
        <OptionCards
          options={GOALS.map((goal) => ({ value: goal, label: GOAL_LABEL[goal], description: t(GOAL_HELP[goal]) }))}
          value={draft.primaryGoal}
          onChange={(primaryGoal) => update({ primaryGoal })}
        />
      </Field>
      <Field label={t("Objetivos secundarios")} optional>
        <Chips options={optionsOf(SECONDARY_GOALS, SECONDARY_GOAL_LABEL)} values={draft.secondaryGoals} onChange={(secondaryGoals) => update({ secondaryGoals })} />
      </Field>
      <Field
        label={t("Músculos que quieres priorizar")}
        optional
        hint={t("Recibirán más volumen de trabajo. El resto se sigue entrenando para mantener las proporciones. Si marcas casi todos, la prioridad deja de tener efecto.")}
      >
        <Chips options={optionsOf(MUSCLES, MUSCLE_LABEL)} values={draft.priorityMuscles} onChange={(priorityMuscles) => update({ priorityMuscles })} />
      </Field>
      <Field label={t("Fecha objetivo")} optional hint={t("Si tienes una fecha en mente (un viaje, un evento…). Formato AAAA-MM-DD.")}>
        <Input
          value={draft.targetDate}
          onChangeText={(targetDate) => update({ targetDate })}
          placeholder={example("2027-06-01")}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
        />
      </Field>
    </Gap>
  );
}

/** `brief`: versión del cuestionario inicial, sin marcas ni rutinas anteriores (se completan en Perfil). */
export function ExperienceSection({ draft, update, brief = false }: SectionProps & { brief?: boolean }) {
  const unit = weightUnit(draft.units);
  return (
    <Gap>
      <Field label={t("¿Cuánto tiempo llevas entrenando con pesas de forma constante?")}>
        <OptionCards options={optionsOf(EXPERIENCE, EXPERIENCE_LABEL)} value={draft.experience} onChange={(experience) => update({ experience })} />
      </Field>
      <View style={{ gap: space.md }}>
        <Toggle checked={draft.structuredProgram} onChange={(structuredProgram) => update({ structuredProgram })}>
          {t("He seguido un programa estructurado (con ejercicios, series y progresión definidos), no solo «ir al gimnasio».")}
        </Toggle>
        <Toggle checked={draft.tracksLoads} onChange={(tracksLoads) => update({ tracksLoads })}>
          {t("Suelo apuntar los pesos y las repeticiones que hago.")}
        </Toggle>
      </View>
      {brief ? null : (
        <Field
          label={t("Marcas aproximadas")}
          optional
          hint={t("Un peso y las repeticiones que haces con él con buena técnica. No hace falta que sea tu máximo. Déjalo vacío si no lo sabes.")}
        >
          <View style={{ gap: space.sm }}>
            {MARK_LIFTS.map((lift) => (
              <View key={lift} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Txt variant="small" style={{ flex: 1 }}>
                  {MARK_LIFT_LABEL[lift]}
                </Txt>
                <UnitInput
                  unit={unit}
                  style={{ width: 104 }}
                  accessibilityLabel={t("{ejercicio}: peso", { ejercicio: MARK_LIFT_LABEL[lift] })}
                  value={draft.marks[lift].weight}
                  onChangeText={(weight) => update({ marks: { ...draft.marks, [lift]: { ...draft.marks[lift], weight } } })}
                />
                <UnitInput
                  unit={t("reps")}
                  integer
                  style={{ width: 92 }}
                  accessibilityLabel={t("{ejercicio}: repeticiones", { ejercicio: MARK_LIFT_LABEL[lift] })}
                  value={draft.marks[lift].reps}
                  onChangeText={(reps) => update({ marks: { ...draft.marks, [lift]: { ...draft.marks[lift], reps } } })}
                />
              </View>
            ))}
          </View>
        </Field>
      )}
      <Field
        label={t("¿Qué grupos musculares notas más débiles o atrasados?")}
        optional
        hint={t("Es tu percepción; la contrastaré con tus registros antes de sacar conclusiones.")}
      >
        <Chips options={optionsOf(MUSCLES, MUSCLE_LABEL)} values={draft.weakMuscles} onChange={(weakMuscles) => update({ weakMuscles })} />
      </Field>
      {brief ? null : (
        <Field label={t("Rutinas anteriores")} optional hint={t("Qué has hecho hasta ahora y qué tal te fue.")}>
          <Input value={draft.previousRoutines} onChangeText={(previousRoutines) => update({ previousRoutines })} maxLength={1000} multiline />
        </Field>
      )}
    </Gap>
  );
}

export function ExercisesSection({ draft, update }: SectionProps) {
  return (
    <Gap>
      <Field label={t("Ejercicios que te gustan")} optional hint={t("Tendrán preferencia al montar tu rutina, siempre que encajen.")}>
        <ExercisePicker
          label={t("Ejercicios favoritos")}
          values={draft.favoriteExercises}
          exclude={draft.dislikedExercises}
          onChange={(favoriteExercises) => update({ favoriteExercises })}
        />
      </Field>
      <Field label={t("Ejercicios que prefieres evitar")} optional hint={t("No aparecerán en tu rutina: se usará una alternativa equivalente.")}>
        <ExercisePicker
          label={t("Ejercicios a evitar")}
          values={draft.dislikedExercises}
          exclude={draft.favoriteExercises}
          onChange={(dislikedExercises) => update({ dislikedExercises })}
        />
      </Field>
    </Gap>
  );
}

const MINUTES = [30, 45, 60, 75, 90, 120];

export function AvailabilitySection({ draft, update }: SectionProps) {
  const fullGym = EQUIPMENT.every((item) => draft.equipment.includes(item));
  return (
    <Gap>
      <Field label={t("¿Cuántos días puedes entrenar por semana?")} hint={t("Mejor un número que puedas cumplir siempre que uno ideal que falles a menudo.")}>
        <Segmented options={[2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) }))} value={draft.daysPerWeek} onChange={(daysPerWeek) => update({ daysPerWeek })} />
      </Field>
      <Field label={t("¿Qué días sueles entrenar?")} optional hint={t("Sirve para decirte qué toca cada día. Si tus días cambian cada semana, déjalo sin marcar.")}>
        <Chips options={WEEKDAY_LABEL.map((label, index) => ({ value: index + 1, label }))} values={draft.trainingWeekdays} onChange={(trainingWeekdays) => update({ trainingWeekdays })} />
      </Field>
      <Field label={t("Duración máxima de cada sesión")} hint={t("Contando el calentamiento.")}>
        <Segmented columns={3} options={MINUTES.map((value) => ({ value, label: `${value} min` }))} value={draft.sessionMinutes} onChange={(sessionMinutes) => update({ sessionMinutes })} />
      </Field>
      <Field label={t("Material disponible")}>
        <View style={{ gap: space.md }}>
          <Toggle checked={fullGym} onChange={(checked) => update({ equipment: checked ? [...EQUIPMENT] : [] })}>
            <Txt variant="muted">
              <Txt style={{ fontWeight: "500" }}>{t("Gimnasio completo")}</Txt> {t("(máquinas, poleas, mancuernas, barras y bancos)")}
            </Txt>
          </Toggle>
          <Chips options={optionsOf(EQUIPMENT, EQUIPMENT_LABEL)} values={draft.equipment} onChange={(equipment) => update({ equipment })} />
        </View>
      </Field>
    </Gap>
  );
}

/** Formulario para añadir una limitación (cuestionario y perfil). */
export function LimitationEditor({ onAdd, disabled }: { onAdd: (limitation: { kind: LimitationKind; bodyArea: BodyArea; severity: Severity; description: string }) => void; disabled?: boolean }) {
  const colors = useColors();
  const [kind, setKind] = useState<LimitationKind>("pain");
  const [bodyArea, setBodyArea] = useState<BodyArea>("shoulder");
  const [severity, setSeverity] = useState<Severity>("mild");
  const [description, setDescription] = useState("");
  return (
    <View style={{ gap: space.lg, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <Txt variant="label">{t("Añadir una lesión, molestia o limitación")}</Txt>
      <Field label={t("Tipo")}>
        <Segmented options={optionsOf(LIMITATION_KINDS, LIMITATION_KIND_LABEL)} value={kind} onChange={setKind} />
      </Field>
      <Field label={t("Zona")}>
        <Segmented columns={3} options={optionsOf(BODY_AREAS, BODY_AREA_LABEL)} value={bodyArea} onChange={setBodyArea} />
      </Field>
      <Field label={t("Intensidad")} hint={t("Con «moderada» o «importante» se evitan los ejercicios que cargan esa zona; con «leve» se mantienen con aviso.")}>
        <Segmented options={optionsOf(SEVERITIES, SEVERITY_LABEL)} value={severity} onChange={setSeverity} />
      </Field>
      <Field label={t("Descripción")} optional>
        <Input value={description} onChangeText={setDescription} maxLength={300} placeholder={example(t("molestia en el hombro derecho al hacer press"))} />
      </Field>
      <Button
        variant="secondary"
        icon={Plus}
        disabled={disabled}
        onPress={() => {
          onAdd({ kind, bodyArea, severity, description: description.trim() });
          setDescription("");
        }}
      >
        {t("Añadir")}
      </Button>
    </View>
  );
}

export function LimitationsSection({ draft, update }: SectionProps) {
  const colors = useColors();
  return (
    <Gap>
      <Notice tone="info">
        {t(
          "Esta aplicación no hace diagnósticos médicos. Lo que indiques aquí sirve para evitar ejercicios que carguen esa zona. Si tienes dolor persistente, intenso o que empeora, consulta a un profesional sanitario antes de entrenar.",
        )}
      </Notice>
      {draft.limitations.length > 0 ? (
        <View style={{ gap: space.sm }}>
          {draft.limitations.map((limitation, index) => (
            <View
              key={`${limitation.bodyArea}-${index}`}
              style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start", padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}
            >
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: "500" }}>
                  {BODY_AREA_LABEL[limitation.bodyArea]} · {LIMITATION_KIND_LABEL[limitation.kind].toLowerCase()} · {SEVERITY_LABEL[limitation.severity].toLowerCase()}
                </Txt>
                {limitation.description ? <Txt variant="small">{limitation.description}</Txt> : null}
              </View>
              <Pressable onPress={() => update({ limitations: draft.limitations.filter((_, i) => i !== index) })} accessibilityLabel={t("Quitar")} hitSlop={8}>
                <Trash2 size={18} color={colors.subtle} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <LimitationEditor disabled={draft.limitations.length >= 10} onAdd={(limitation) => update({ limitations: [...draft.limitations, limitation] })} />
      <Field label={t("Otras limitaciones de movilidad")} optional>
        <Input
          value={draft.mobilityNotes}
          onChangeText={(mobilityNotes) => update({ mobilityNotes })}
          maxLength={500}
          multiline
          placeholder={example(t("poca movilidad de tobillo en sentadilla"))}
        />
      </Field>
    </Gap>
  );
}

export function MeasuresSection({ draft, update }: SectionProps) {
  const unit = lengthUnit(draft.units);
  return (
    <Gap>
      <Txt variant="muted">
        {t("Necesitas una cinta métrica flexible.")} <Txt style={{ fontWeight: "500" }}>{t("Deja en blanco las medidas que no sepas")}</Txt>
        {t(": podrás completarlas más adelante en «Cuerpo».")}
      </Txt>
      <MeasureGuide />
      {MEASURES.map((measure, index) => (
        <Field key={measure} label={`${index + 1}. ${MEASURE_LABEL[measure]}`} hint={MEASURE_HELP[measure]}>
          <UnitInput unit={unit} value={draft.measures[measure]} onChangeText={(value) => update({ measures: { ...draft.measures, [measure]: value } })} placeholder={t("No lo sé")} />
        </Field>
      ))}
    </Gap>
  );
}

export function HabitsSection({ draft, update }: SectionProps) {
  return (
    <Gap>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Field label={t("Horas de sueño")} optional hint={t("Media por noche.")} style={{ flex: 1 }}>
          <UnitInput unit="h" value={draft.sleepHours} onChangeText={(sleepHours) => update({ sleepHours })} placeholder={example("7,5")} />
        </Field>
        <Field label={t("Pasos diarios")} optional hint={t("Aproximados.")} style={{ flex: 1 }}>
          <UnitInput unit={t("pasos")} integer value={draft.dailySteps} onChangeText={(dailySteps) => update({ dailySteps })} placeholder={example("7000")} />
        </Field>
      </View>
      <Field label={t("¿Cómo es tu trabajo o tu día a día?")}>
        <OptionCards options={optionsOf(JOB_ACTIVITY, JOB_ACTIVITY_LABEL)} value={draft.jobActivity} onChange={(jobActivity) => update({ jobActivity })} />
      </Field>
      <Field label={t("Nivel de estrés habitual")} hint={t("El estrés alto y mantenido empeora la recuperación; lo tendré en cuenta al revisar tu progreso.")}>
        <Segmented options={optionsOf(STRESS, STRESS_LABEL)} value={draft.stressLevel} onChange={(stressLevel) => update({ stressLevel })} />
      </Field>
    </Gap>
  );
}

/**
 * Preferencias de alimentación. Se guardan aunque la parte de comidas esté pendiente de combinarse
 * con la app de fotos: las necesitará para respetar alergias y gustos.
 */
export function NutritionSection({ draft, update }: SectionProps) {
  return (
    <Gap>
      <Field label={t("¿Cuántas comidas haces al día?")} hint={t("Contando meriendas o tentempiés.")}>
        <Segmented options={[2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) }))} value={draft.mealsPerDay} onChange={(mealsPerDay) => update({ mealsPerDay })} />
      </Field>
      <Field label={t("¿Te resulta fácil comer suficiente?")}>
        <OptionCards options={optionsOf(APPETITE, APPETITE_LABEL)} value={draft.appetite} onChange={(appetite) => update({ appetite })} />
      </Field>
      <Field label={t("Tipo de alimentación")}>
        <OptionCards options={optionsOf(DIETS, DIET_LABEL)} value={draft.dietPreference} onChange={(dietPreference) => update({ dietPreference })} />
      </Field>
      <Field label={t("Alergias e intolerancias")} optional hint={t("Al analizar una comida, la IA te avisará si podría contener alguno.")}>
        <Chips options={optionsOf(ALLERGENS, ALLERGEN_LABEL)} values={draft.allergies} onChange={(allergies) => update({ allergies })} />
      </Field>
      <Field label={t("Otras alergias, intolerancias o restricciones")} optional>
        <Input value={draft.intoleranceNotes} onChangeText={(intoleranceNotes) => update({ intoleranceNotes })} maxLength={300} />
      </Field>
      <Field label={t("Alimentos que no comes")} optional hint={t("Separados por comas: por gusto, por creencias o porque te sientan mal.")}>
        <Input value={draft.excludedFoods} onChangeText={(excludedFoods) => update({ excludedFoods })} maxLength={500} placeholder={example(t("champiñones, hígado"))} />
      </Field>
      <Field label={t("Alimentos favoritos")} optional>
        <Input value={draft.favoriteFoods} onChangeText={(favoriteFoods) => update({ favoriteFoods })} maxLength={500} placeholder={example(t("arroz, pollo, plátano, yogur"))} />
      </Field>
      <Field label={t("Presupuesto semanal de comida")} optional hint={t("En tu moneda.")}>
        <UnitInput unit={t("/sem")} value={draft.weeklyFoodBudget} onChangeText={(weeklyFoodBudget) => update({ weeklyFoodBudget })} placeholder={example("50")} />
      </Field>
      <Field label={t("Suplementos que tomas")} optional>
        <Input value={draft.supplements} onChangeText={(supplements) => update({ supplements })} maxLength={300} placeholder={example(t("creatina, proteína"))} />
      </Field>
    </Gap>
  );
}
