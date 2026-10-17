import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeftRight, Check, ChevronDown, Lightbulb, SkipForward, Timer, Trash2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, Text, Vibration, View } from "react-native";
import { Field, Input, NumberStepper, Segmented } from "@/components/form";
import { Loading, Screen } from "@/components/screen";
import { Badge, Button, Card, Notice, ProgressBar, StepDot, Txt } from "@/components/ui";
import { getRecoveryFlags } from "@/data/overview";
import { requireProfile } from "@/data/profile";
import { useMutation, useQuery } from "@/data/provider";
import {
  deleteSession,
  deleteSet,
  finishSession,
  getExerciseLogs,
  getSession,
  groupLogs,
  logSet,
  swapExercise,
  updateSessionExercise,
  type SessionExercise,
  type SessionSet,
  type WorkoutSession,
} from "@/data/sessions";
import { getExercise, type Exercise } from "@/domain/exercises";
import { suggestNext, type PastPerformance, type Suggestion } from "@/domain/training/progression";
import { MUSCLE_LABEL, type Units } from "@/domain/types";
import { msg, t, tn } from "@/i18n";
import { formatClock, formatRange, formatRest } from "@/lib/format";
import { displayLoadStep, formatNumber, fromDisplayWeight, parseDecimal, roundDisplay, toDisplayWeight, weightUnit } from "@/lib/units";
import { radius, space, tabular, useColors } from "@/theme";

type Guidance = { suggestion: Suggestion | null; last: PastPerformance | null };
type Rest = { exerciseName: string; startedAt: number; endsAt: number };

const DISCOMFORT = [
  { value: 0, label: msg("Ninguna") },
  { value: 1, label: msg("Leve") },
  { value: 2, label: msg("Moderada") },
  { value: 3, label: msg("Dolor") },
];

const ENERGY = [
  { value: 1, label: msg("Muy baja") },
  { value: 2, label: msg("Baja") },
  { value: 3, label: msg("Normal") },
  { value: 4, label: msg("Alta") },
  { value: 5, label: msg("Muy alta") },
];

const translated = (options: { value: number; label: string }[]) => options.map((option) => ({ value: option.value, label: t(option.label) }));

const showWeight = (kg: number, units: Units) => formatNumber(roundDisplay(toDisplayWeight(kg, units), 2), 2);

/** Hora actual en ms. Solo se llama desde manejadores de eventos, nunca al pintar. */
const clock = () => Date.now();

/** Modo entrenamiento: registrar series una a una, con sugerencia de carga y temporizador de descanso. */
export default function LiveSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery(
    async (db) => {
      const session = await getSession(db, id);
      if (!session) return { session: null, units: "metric" as Units, guidance: {} as Record<string, Guidance> };
      const profile = await requireProfile(db);
      const history = groupLogs(await getExerciseLogs(db, { exerciseIds: session.exercises.map((exercise) => exercise.exerciseId) }));
      const recovery = await getRecoveryFlags(db);
      // La sugerencia de carga se calcula con el historial real de cada ejercicio.
      const guidance: Record<string, Guidance> = {};
      for (const item of session.exercises) {
        const exercise = getExercise(item.exerciseId);
        const past = history.get(item.exerciseId) ?? [];
        guidance[item.id] = {
          suggestion: exercise
            ? suggestNext(exercise, { sets: item.targetSets, repMin: item.repMin, repMax: item.repMax, rirMin: item.rirMin, rirMax: item.rirMax }, past, recovery)
            : null,
          last: past[0] ?? null,
        };
      }
      return { session, units: profile.units, guidance };
    },
    [id],
  );

  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { session, units, guidance } = query.data;
  if (!session) return <Redirect href="/entrenamiento" />;
  if (session.status === "completed") return <Redirect href={`/historial/${session.id}`} />;
  return <LiveSession session={session} units={units} guidance={guidance} />;
}

function LiveSession({ session, units, guidance }: { session: WorkoutSession; units: Units; guidance: Record<string, Guidance> }) {
  useKeepAwake();
  const colors = useColors();
  const { run } = useMutation();
  const exercises = session.exercises;
  const [openId, setOpenId] = useState<string | null>(
    () => exercises.find((exercise) => exercise.sets.length < exercise.targetSets)?.id ?? exercises[0]?.id ?? null,
  );
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finishing, setFinishing] = useState(false);

  // Reloj de la pantalla: tiempo transcurrido y cuenta atrás del descanso.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = rest ? Math.ceil((rest.endsAt - now) / 1000) : null;
  const restFinished = remaining !== null && remaining <= 0;
  useEffect(() => {
    if (!restFinished) return;
    Vibration.vibrate([0, 180, 90, 180]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [restFinished]);

  const startedAt = new Date(session.startedAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor((now - startedAt) / 60000));
  const done = exercises.reduce((total, exercise) => total + Math.min(exercise.sets.length, exercise.targetSets), 0);
  const planned = exercises.reduce((total, exercise) => total + exercise.targetSets, 0);
  const totalSets = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);

  const onSetSaved = (exercise: SessionExercise, isNew: boolean) => {
    if (!isNew) return;
    const at = clock();
    setRest({ exerciseName: getExercise(exercise.exerciseId)?.name ?? "", startedAt: at, endsAt: at + exercise.restSeconds * 1000 });
    // Al completar las series previstas se abre el siguiente ejercicio pendiente.
    if (exercise.sets.length + 1 >= exercise.targetSets) {
      const next = exercises.find((candidate) => candidate.id !== exercise.id && candidate.sets.length < candidate.targetSets);
      if (next) setOpenId(next.id);
    }
  };

  const discard = () =>
    Alert.alert(t("Descartar esta sesión"), t("Se borrarán la sesión y todas las series registradas en ella. No se puede deshacer."), [
      { text: t("Cancelar"), style: "cancel" },
      {
        text: t("Descartar"),
        style: "destructive",
        onPress: async () => {
          await run((db) => deleteSession(db, session.id));
          router.replace("/entrenamiento");
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: session.name }} />
      <Screen
        footer={
          rest && remaining !== null ? (
            <RestBar
              rest={rest}
              remaining={remaining}
              onAdd={() => setRest((current) => (current ? { ...current, endsAt: Math.max(current.endsAt, Date.now()) + 30_000 } : current))}
              onClose={() => setRest(null)}
            />
          ) : undefined
        }
      >
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Txt variant="h2" num>
                {t("{hechas} de {previstas} series", { hechas: done, previstas: planned })}
              </Txt>
              <Txt variant="tiny" num>
                {t("{minutos} min desde que empezaste", { minutos: elapsedMinutes })}
              </Txt>
            </View>
            <Button size="sm" onPress={() => setFinishing(true)} disabled={totalSets === 0}>
              {t("Terminar")}
            </Button>
          </View>
          <ProgressBar value={planned === 0 ? 0 : done / planned} style={{ marginTop: space.md }} />
        </Card>

        {exercises.map((exercise, index) => (
          <ExerciseCard
            key={`${exercise.id}-${exercise.exerciseId}`}
            index={index}
            exercise={exercise}
            guidance={guidance[exercise.id] ?? { suggestion: null, last: null }}
            units={units}
            open={openId === exercise.id}
            usedExerciseIds={exercises.map((item) => item.exerciseId)}
            onToggle={() => setOpenId((current) => (current === exercise.id ? null : exercise.id))}
            onSetSaved={(isNew) => onSetSaved(exercise, isNew)}
          />
        ))}

        <Pressable onPress={discard} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.md }}>
          <Trash2 size={16} color={colors.danger} />
          <Txt variant="small" style={{ color: colors.danger }}>
            {t("Descartar esta sesión")}
          </Txt>
        </Pressable>
      </Screen>

      <FinishDialog visible={finishing} session={session} onCancel={() => setFinishing(false)} />
    </>
  );
}

/* ───────────────────────────── Ejercicio ───────────────────────────── */

type CardProps = {
  index: number;
  exercise: SessionExercise;
  guidance: Guidance;
  units: Units;
  open: boolean;
  usedExerciseIds: string[];
  onToggle: () => void;
  onSetSaved: (isNew: boolean) => void;
};

function ExerciseCard({ index, exercise, guidance, units, open, usedExerciseIds, onToggle, onSetSaved }: CardProps) {
  const colors = useColors();
  const { run, pending } = useMutation();
  const meta = getExercise(exercise.exerciseId);
  const { suggestion, last } = guidance;
  const lastSet = exercise.sets[exercise.sets.length - 1];
  const complete = exercise.sets.length >= exercise.targetSets;

  const initialWeight = lastSet?.weightKg ?? suggestion?.weightKg ?? null;
  const [weight, setWeight] = useState(initialWeight === null ? "" : showWeight(initialWeight, units));
  const [reps, setReps] = useState(lastSet ? String(lastSet.reps) : "");
  const [rir, setRir] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [panel, setPanel] = useState<"technique" | "swap" | null>(null);
  const [note, setNote] = useState(exercise.note ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!meta) return null;

  const unit = weightUnit(units);
  const step = displayLoadStep(meta.loadStep, units);
  const nextNumber = exercise.sets.reduce((max, set) => Math.max(max, set.setNumber), 0) + 1;
  const targetNumber = editing ?? nextNumber;

  const bump = (value: string, delta: number, min = 0) => formatNumber(Math.max(min, roundDisplay((parseDecimal(value) ?? 0) + delta, 2)), 2);

  const save = async () => {
    const weightValue = weight.trim() === "" && meta.bodyweight ? 0 : parseDecimal(weight);
    const repsValue = parseDecimal(reps);
    if (weightValue === null || weightValue < 0) return setError(t("Indica el peso en {unidad}.", { unidad: unit }));
    if (repsValue === null || !Number.isInteger(repsValue) || repsValue < 1 || repsValue > 100) return setError(t("Indica las repeticiones que has hecho."));
    setError(null);

    const isNew = editing === null;
    const sinceLast = isNew && lastSet ? Math.round((clock() - new Date(lastSet.completedAt).getTime()) / 1000) : null;
    const saved = await run((db) =>
      logSet(db, {
        sessionExerciseId: exercise.id,
        setNumber: targetNumber,
        weightKg: roundDisplay(fromDisplayWeight(weightValue, units), 3),
        reps: repsValue,
        rir,
        restSeconds: sinceLast !== null && sinceLast > 0 && sinceLast < 1500 ? sinceLast : null,
      }),
    );
    if (saved === undefined) return;
    if (saved === null) return setError(t("No se ha podido guardar la serie: la sesión ya no está en curso."));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onSetSaved(isNew);
    setEditing(null);
    setRir(null);
  };

  const remove = async (set: SessionSet) => {
    const ok = await run((db) => deleteSet(db, set.id));
    if (ok === false) setError(t("No se ha podido borrar la serie."));
    if (editing === set.setNumber) setEditing(null);
  };

  const edit = (set: SessionSet) => {
    setEditing(set.setNumber);
    setWeight(showWeight(set.weightKg, units));
    setReps(String(set.reps));
    setRir(set.rir);
  };

  const patch = async (discomfort: number, text: string) => {
    const ok = await run((db) => updateSessionExercise(db, exercise.id, { discomfort, note: text.trim() || null }));
    if (ok === false) setError(t("No se ha podido guardar."));
  };

  const swap = async (exerciseId: string) => {
    const ok = await run((db) => swapExercise(db, exercise.id, exerciseId));
    if (ok === false) setError(t("No se puede cambiar: el ejercicio ya tiene series o ya está en la sesión."));
  };

  const alternatives = meta.alternatives
    .filter((alternativeId) => !usedExerciseIds.includes(alternativeId))
    .map((alternativeId) => getExercise(alternativeId))
    .filter((item): item is Exercise => Boolean(item));

  const setLoad = (kg: number, lower = false) =>
    meta.bodyweight && kg === 0 ? (lower ? t("sin lastre") : t("Sin lastre")) : `${showWeight(kg, units)} ${unit}`;

  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: open ? colors.lineStrong : colors.line, backgroundColor: colors.surface }}>
      <Pressable onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <StepDot done={complete} label={index + 1} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontWeight: "500" }} numberOfLines={2}>
            {meta.name}
          </Txt>
          <Txt variant="tiny" num style={{ marginTop: 2 }}>
            {t("{hechas}/{previstas} series · {reps} reps · RIR {rir}", {
              hechas: exercise.sets.length,
              previstas: exercise.targetSets,
              reps: formatRange(exercise.repMin, exercise.repMax),
              rir: formatRange(exercise.rirMin, exercise.rirMax),
            })}
          </Txt>
        </View>
        {exercise.discomfort >= 2 ? <Badge tone="danger">{t("Molestia")}</Badge> : null}
        <ChevronDown size={18} color={colors.subtle} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>

      {open ? (
        <View style={{ gap: space.lg, borderTopWidth: 1, borderTopColor: colors.line, padding: space.lg }}>
          {suggestion ? (
            <View style={{ flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.raised }}>
              <Lightbulb size={18} color={suggestion.kind === "pain" ? colors.danger : colors.accentFg} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: "600" }}>{suggestion.title}</Txt>
                <Txt variant="small">{suggestion.reason}</Txt>
                {suggestion.kind !== "calibrate" && suggestion.kind !== "pain" ? (
                  <Txt variant="small" num>
                    {t("Objetivo de hoy:")} <Txt variant="label">{t("{reps} repeticiones", { reps: suggestion.repGoal })}</Txt>
                  </Txt>
                ) : null}
              </View>
            </View>
          ) : null}

          {exercise.sets.length > 0 ? (
            <View style={{ gap: 6 }}>
              {exercise.sets.map((set, position) => (
                <View
                  key={set.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                    paddingLeft: space.md,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: editing === set.setNumber ? colors.accentLine : colors.line,
                    backgroundColor: editing === set.setNumber ? colors.accentFaint : colors.bg,
                  }}
                >
                  <Txt variant="tiny" num style={{ width: 18 }}>
                    {position + 1}
                  </Txt>
                  <Pressable onPress={() => edit(set)} style={{ flex: 1, paddingVertical: 10 }} accessibilityLabel={t("Corregir la serie {n}", { n: position + 1 })}>
                    <Text style={[{ color: colors.fg, fontSize: 15 }, tabular]}>
                      <Text style={{ fontWeight: "600" }}>{setLoad(set.weightKg)}</Text>
                      <Text style={{ color: colors.muted }}> × </Text>
                      <Text style={{ fontWeight: "600" }}>{set.reps}</Text>
                      {set.rir !== null ? <Text style={{ color: colors.muted, fontSize: 12 }}>{`  RIR ${formatNumber(set.rir, 1)}`}</Text> : null}
                      {set.restSeconds !== null ? <Text style={{ color: colors.subtle, fontSize: 12 }}>{`  ${t("desc.")} ${formatClock(set.restSeconds)}`}</Text> : null}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => remove(set)} disabled={pending} style={{ padding: 10 }} accessibilityLabel={t("Borrar la serie {n}", { n: position + 1 })}>
                    <X size={18} color={colors.subtle} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Txt variant="tiny" style={{ fontWeight: "500", color: colors.muted }}>
                {editing === null ? t("Serie {n}", { n: exercise.sets.length + 1 }) : t("Corrigiendo una serie")}
              </Txt>
              {editing !== null ? (
                <Pressable onPress={() => setEditing(null)} hitSlop={8}>
                  <Txt variant="tiny" style={{ color: colors.accentFg, fontWeight: "600" }}>
                    {t("Cancelar")}
                  </Txt>
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", gap: space.md }}>
              <NumberStepper
                label={
                  meta.bodyweight
                    ? t("Lastre ({unidad})", { unidad: unit })
                    : meta.perSide
                      ? t("Por lado ({unidad})", { unidad: unit })
                      : t("Peso ({unidad})", { unidad: unit })
                }
                value={weight}
                onChange={setWeight}
                onMinus={() => setWeight(bump(weight, -step))}
                onPlus={() => setWeight(bump(weight, step))}
                placeholder={meta.bodyweight ? "0" : "—"}
              />
              <NumberStepper
                label={t("Repeticiones")}
                value={reps}
                onChange={setReps}
                onMinus={() => setReps(bump(reps, -1, 1))}
                onPlus={() => setReps(bump(reps, 1, 1))}
                placeholder={formatRange(exercise.repMin, exercise.repMax)}
                integer
              />
            </View>
            <View style={{ gap: 6 }}>
              <Txt variant="tiny" style={{ color: colors.muted }}>
                <Txt variant="tiny" style={{ color: colors.muted, fontWeight: "500" }}>
                  {t("Repeticiones en reserva (RIR)")}
                </Txt>{" "}
                · {t("¿cuántas más podrías haber hecho?")}
              </Txt>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[0, 1, 2, 3, 4].map((value) => {
                  const selected = rir === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setRir(selected ? null : value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        borderColor: selected ? colors.accentLine : colors.lineStrong,
                        backgroundColor: selected ? colors.accentSoft : colors.raised,
                      }}
                    >
                      <Text style={[{ color: selected ? colors.accentFg : colors.muted, fontWeight: "600", fontSize: 15 }, tabular]}>{value === 4 ? "4+" : value}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {error ? (
              <Txt variant="small" style={{ color: colors.danger }}>
                {error}
              </Txt>
            ) : null}
            <Button size="lg" full icon={Check} onPress={save} loading={pending}>
              {editing === null ? t("Guardar serie") : t("Guardar corrección")}
            </Button>
          </View>

          {last ? (
            <Txt variant="tiny" num>
              {t("Sesión anterior: {series}", { series: last.sets.map((set) => `${setLoad(set.weightKg, true)} × ${set.reps}`).join(" · ") })}
            </Txt>
          ) : null}

          <Field label={t("¿Molestias en este ejercicio?")}>
            <Segmented options={translated(DISCOMFORT)} value={exercise.discomfort} onChange={(value) => patch(value, note)} />
          </Field>
          {exercise.discomfort >= 2 ? (
            <Notice tone="danger" title={t("No entrenes a través del dolor")}>
              {t(
                "Detén el ejercicio y prueba una alternativa que no moleste. Si el dolor es intenso, persiste tras la sesión o se repite, consulta a un profesional sanitario. La carga de este ejercicio no subirá la próxima vez.",
              )}
            </Notice>
          ) : null}
          <Input
            value={note}
            onChangeText={setNote}
            onBlur={() => {
              if (note.trim() !== (exercise.note ?? "")) patch(exercise.discomfort, note);
            }}
            maxLength={300}
            placeholder={t("Nota (sensaciones, ajustes de la máquina…)")}
            accessibilityLabel={t("Nota del ejercicio")}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
            <Button size="sm" variant="secondary" onPress={() => setPanel(panel === "technique" ? null : "technique")}>
              {t("Técnica")}
            </Button>
            {exercise.sets.length === 0 && alternatives.length > 0 ? (
              <Button size="sm" variant="secondary" icon={ArrowLeftRight} onPress={() => setPanel(panel === "swap" ? null : "swap")}>
                {t("Cambiar ejercicio")}
              </Button>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
              <Timer size={14} color={colors.subtle} />
              <Txt variant="tiny">{t("descanso {tiempo}", { tiempo: formatRest(exercise.restSeconds) })}</Txt>
            </View>
          </View>

          {panel === "technique" ? <Technique exercise={meta} /> : null}
          {panel === "swap" ? (
            <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
              <Txt variant="small">{t("Alternativas que trabajan lo mismo. Se mantiene el objetivo de series y repeticiones.")}</Txt>
              {alternatives.map((alternative) => (
                <Pressable
                  key={alternative.id}
                  disabled={pending}
                  onPress={() => swap(alternative.id)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: space.md,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.lineStrong,
                    backgroundColor: pressed ? colors.hover : colors.raised,
                  })}
                >
                  <Txt style={{ fontWeight: "500", flex: 1 }}>{alternative.name}</Txt>
                  <ArrowLeftRight size={16} color={colors.subtle} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Technique({ exercise }: { exercise: Exercise }) {
  const colors = useColors();
  return (
    <View style={{ gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
      <Txt variant="tiny">
        {MUSCLE_LABEL[exercise.primary]}
        {exercise.secondary.length > 0 ? t(" · secundarios: {musculos}", { musculos: exercise.secondary.map((muscle) => MUSCLE_LABEL[muscle].toLowerCase()).join(", ") }) : ""}
      </Txt>
      <View style={{ gap: 6 }}>
        {exercise.steps.map((step, index) => (
          <Txt key={step} variant="small">
            {index + 1}. {step}
          </Txt>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="label">{t("Errores habituales")}</Txt>
        {exercise.mistakes.map((mistake) => (
          <Txt key={mistake} variant="small">
            • {mistake}
          </Txt>
        ))}
      </View>
      <Pressable onPress={() => router.push(`/ejercicio/${exercise.id}`)}>
        <Txt variant="small" style={{ color: colors.accentFg, fontWeight: "600" }}>
          {t("Ver ficha completa")}
        </Txt>
      </Pressable>
    </View>
  );
}

/* ───────────────────────────── Descanso ───────────────────────────── */

function RestBar({ rest, remaining, onAdd, onClose }: { rest: Rest; remaining: number; onAdd: () => void; onClose: () => void }) {
  const colors = useColors();
  const total = Math.max(1, (rest.endsAt - rest.startedAt) / 1000);
  const finished = remaining <= 0;
  return (
    <View
      style={{
        borderRadius: radius.lg,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: finished ? colors.accentBorder : colors.lineStrong,
        backgroundColor: finished ? colors.accent : colors.raised,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md }}>
        <Timer size={22} color={finished ? colors.accentInk : colors.fg} />
        <View style={{ flex: 1 }}>
          <Text style={[{ fontSize: 26, fontWeight: "600", color: finished ? colors.accentInk : colors.fg }, tabular]}>{finished ? t("¡Vamos!") : formatClock(remaining)}</Text>
          <Text style={{ fontSize: 12, color: finished ? colors.accentInk : colors.muted }} numberOfLines={1}>
            {finished ? t("Descanso completado") : t("Descanso · {ejercicio}", { ejercicio: rest.exerciseName })}
          </Text>
        </View>
        {!finished ? (
          <Pressable onPress={onAdd} style={{ height: 40, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: "center" }}>
            <Text style={[{ color: colors.fg, fontWeight: "600" }, tabular]}>+30 s</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onClose}
          style={{
            height: 40,
            paddingHorizontal: 12,
            borderRadius: radius.sm,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            // Sobre el relleno lima: un velo de `accentInk`, igual en los dos temas.
            backgroundColor: finished ? "rgba(12,18,3,0.1)" : colors.accent,
          }}
        >
          {finished ? <X size={16} color={colors.accentInk} /> : <SkipForward size={16} color={colors.accentInk} />}
          <Text style={{ color: colors.accentInk, fontWeight: "600" }}>{finished ? t("Cerrar") : t("Saltar")}</Text>
        </Pressable>
      </View>
      {!finished ? <View style={{ height: 3, width: `${Math.max(0, Math.min(1, remaining / total)) * 100}%`, backgroundColor: colors.accentFg }} /> : null}
    </View>
  );
}

/* ───────────────────────────── Cierre ───────────────────────────── */

function FinishDialog({ visible, session, onCancel }: { visible: boolean; session: WorkoutSession; onCancel: () => void }) {
  const colors = useColors();
  const { run, pending } = useMutation();
  const [energy, setEnergy] = useState<number | null>(null);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const missing = session.exercises.filter((exercise) => exercise.sets.length < exercise.targetSets).length;
  const pain = session.exercises.some((exercise) => exercise.discomfort >= 2);

  const finish = async () => {
    const ok = await run((db) => finishSession(db, session.id, { energy, notes: notes.trim() || null }));
    if (ok === undefined) return;
    if (!ok) return setError(t("Registra al menos una serie antes de terminar la sesión."));
    onCancel();
    router.replace({ pathname: "/historial/[id]", params: { id: session.id, terminada: "1" } });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end", padding: space.md }}>
        <View style={{ gap: space.lg, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface, marginBottom: space.lg }}>
          <Txt variant="h2">{t("Terminar el entrenamiento")}</Txt>
          {missing > 0 ? (
            <Notice>
              {tn(
                missing,
                "Te quedan series por hacer en {n} ejercicio. Puedes terminar igualmente: se guarda lo que has hecho.",
                "Te quedan series por hacer en {n} ejercicios. Puedes terminar igualmente: se guarda lo que has hecho.",
              )}
            </Notice>
          ) : null}
          {pain ? (
            <Notice tone="warning" title={t("Has anotado molestias")}>
              {t("Lo tendré en cuenta en la próxima sesión. Si el dolor persiste, consulta a un profesional sanitario.")}
            </Notice>
          ) : null}
          <Field label={t("¿Cómo te has encontrado de energía?")}>
            <Segmented columns={3} options={translated(ENERGY)} value={energy} onChange={setEnergy} />
          </Field>
          <Field label={t("Notas")} optional>
            <Input value={notes} onChangeText={setNotes} maxLength={600} multiline />
          </Field>
          {error ? (
            <Txt variant="small" style={{ color: colors.danger }}>
              {error}
            </Txt>
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button variant="secondary" size="lg" onPress={onCancel} disabled={pending} style={{ flex: 1 }}>
              {t("Seguir")}
            </Button>
            <Button size="lg" onPress={finish} loading={pending} style={{ flex: 1 }}>
              {t("Guardar y terminar")}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
