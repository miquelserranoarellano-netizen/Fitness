import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { ChevronDown, Download, Trash2 } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Alert, Pressable, View } from "react-native";
import { Field, Segmented, Toggle } from "@/components/form";
import { Loading, Screen } from "@/components/screen";
import { Badge, Button, Card, CardHeader, Collapsible, Notice, Txt } from "@/components/ui";
import { getActiveBlock } from "@/data/blocks";
import { exportAllData } from "@/data/export";
import { deleteAllMealPhotos } from "@/data/meal-photos";
import { deleteAllPhotos } from "@/data/photos";
import { getLimitations, requireProfile, resolveLimitation, updateReminders, type Limitation, type Profile } from "@/data/profile";
import { useMutation, useQuery } from "@/data/provider";
import { addLimitation, deleteAllData, regeneratePlan, updateProfile, type ProfileSaveResult } from "@/data/services";
import { SPLIT_LABEL } from "@/domain/training/plan";
import { BODY_AREA_LABEL, LEVEL_LABEL, LIMITATION_KIND_LABEL, SEVERITY_LABEL, WEEKDAY_LABEL } from "@/domain/types";
import { draftFromProfile, profileFromDraft, validateStep, type Draft, type StepId } from "@/features/onboarding/draft";
import {
  AvailabilitySection,
  ExercisesSection,
  ExperienceSection,
  GoalsSection,
  HabitsSection,
  LimitationEditor,
  NutritionSection,
  PersonalSection,
  type SectionProps,
} from "@/features/profile/sections";
import { msg, t } from "@/i18n";
import { formatDate, today } from "@/lib/dates";
import { radius, space, useColors } from "@/theme";

const SECTIONS: { id: StepId; title: string; summary: string; render: (props: SectionProps) => ReactNode }[] = [
  { id: "personal", title: msg("Datos personales"), summary: msg("Nombre, edad, altura, sexo y unidades"), render: (props) => <PersonalSection {...props} showWeight={false} /> },
  { id: "goals", title: msg("Objetivos"), summary: msg("Objetivo principal, secundarios y músculos prioritarios"), render: (props) => <GoalsSection {...props} /> },
  { id: "experience", title: msg("Experiencia"), summary: msg("Tiempo entrenando, marcas y grupos débiles"), render: (props) => <ExperienceSection {...props} /> },
  { id: "exercises", title: msg("Preferencias de ejercicios"), summary: msg("Favoritos y ejercicios a evitar"), render: (props) => <ExercisesSection {...props} /> },
  { id: "availability", title: msg("Disponibilidad y material"), summary: msg("Días, duración de la sesión y equipamiento"), render: (props) => <AvailabilitySection {...props} /> },
  { id: "habits", title: msg("Hábitos"), summary: msg("Sueño, pasos, trabajo y estrés"), render: (props) => <HabitsSection {...props} /> },
  { id: "nutrition", title: msg("Alimentación"), summary: msg("Comidas, dieta, alergias y presupuesto"), render: (props) => <NutritionSection {...props} /> },
];

export default function ProfileScreen() {
  const query = useQuery(async (db) => ({ profile: await requireProfile(db), limitations: await getLimitations(db), block: await getActiveBlock(db) }));
  const { run, pending } = useMutation();
  const [planMessage, setPlanMessage] = useState<{ tone: "danger" | "positive"; text: string } | null>(null);
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { profile, limitations, block } = query.data;

  const regenerate = () =>
    Alert.alert(t("Generar una rutina nueva"), t("Se cierra el bloque actual y se crea uno nuevo con tu perfil actual. Tu historial de cargas se conserva."), [
      { text: t("Cancelar"), style: "cancel" },
      {
        text: t("Generar"),
        onPress: async () => {
          const result = await run((db) => regeneratePlan(db));
          if (!result) return;
          if (!result.ok) return setPlanMessage({ tone: "danger", text: result.error });
          setPlanMessage(null);
          router.push("/entrenamiento");
        },
      },
    ]);

  return (
    <Screen description={t("Tus datos, objetivos y preferencias. Todo es editable: mantenlo al día para que el plan siga siendo tuyo.")}>
      <ProfileEditor profile={profile} />

      <Card>
        <CardHeader
          title={t("Plan de entrenamiento")}
          description={
            block
              ? t("Bloque {bloque} · {rutina} · nivel {nivel} · desde el {fecha}.", {
                  bloque: block.number,
                  rutina: SPLIT_LABEL[block.split],
                  nivel: LEVEL_LABEL[block.rationale.level].toLowerCase(),
                  fecha: formatDate(block.startedOn),
                })
              : t("Aún no tienes una rutina generada.")
          }
        />
        <Txt variant="small" style={{ marginBottom: space.md }}>
          {t(
            "La rutina no cambia sola cuando editas el perfil. Si has modificado tus días, el tiempo por sesión, el material, las prioridades o tus limitaciones, genera una nueva. Se cierra el bloque actual y se conserva todo tu historial de cargas.",
          )}
        </Txt>
        {planMessage ? <Notice tone={planMessage.tone} style={{ marginBottom: space.md }}>{planMessage.text}</Notice> : null}
        <Button variant="secondary" onPress={regenerate} loading={pending}>
          {t("Generar una rutina nueva con mi perfil actual")}
        </Button>
      </Card>

      <Reminders profile={profile} />
      <Limitations limitations={limitations} />
      <DataCard />

      <Card>
        <CardHeader title={t("Privacidad e inteligencia artificial")} />
        <View style={{ gap: space.sm }}>
          <Txt variant="small">
            {t("Todos tus datos se guardan solo en este teléfono, dentro de la app. No hay cuenta ni servidor: nada sale del dispositivo salvo que tú exportes tus datos.")}
          </Txt>
          <Txt variant="small">
            {t(
              "La IA opcional de la versión web (comentarios de las revisiones y del análisis) no está en la app: necesitaría un servidor para guardar la clave de forma segura. Todos los cálculos y recomendaciones de esta app salen de reglas explícitas sobre tus datos.",
            )}
          </Txt>
          <Txt variant="small">{t("Esta aplicación no hace diagnósticos médicos. Si tienes dolor o una lesión, consulta a un profesional sanitario.")}</Txt>
        </View>
      </Card>
    </Screen>
  );
}

/** Edición del perfil: las mismas secciones del cuestionario, plegadas, con un único «Guardar». */
function ProfileEditor({ profile }: { profile: Profile }) {
  const colors = useColors();
  const { run, pending } = useMutation();
  const [draft, setDraft] = useState<Draft>(() => draftFromProfile(profile));
  const [open, setOpen] = useState<StepId | null>(null);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<{ error?: string; saved?: ProfileSaveResult } | null>(null);

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    setResult(null);
  };

  const save = async () => {
    for (const section of SECTIONS) {
      const problem = validateStep(section.id, draft, { requireWeight: false });
      if (problem) {
        setOpen(section.id);
        return setResult({ error: problem });
      }
    }
    const response = await run((db) => updateProfile(db, profileFromDraft(draft)));
    if (!response) return;
    if (!response.ok) return setResult({ error: response.error });
    setDirty(false);
    setResult({ saved: response.data });
  };

  return (
    <View style={{ gap: space.md }}>
      <Txt variant="h2">{t("Perfil físico y preferencias")}</Txt>
      {SECTIONS.map((section) => {
        const expanded = open === section.id;
        return (
          <View key={section.id} style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: expanded ? colors.lineStrong : colors.line, backgroundColor: colors.surface }}>
            <Pressable
              onPress={() => setOpen(expanded ? null : section.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg }}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: "600" }}>{t(section.title)}</Txt>
                <Txt variant="small">{t(section.summary)}</Txt>
              </View>
              <ChevronDown size={18} color={colors.subtle} style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }} />
            </Pressable>
            {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: colors.line, padding: space.lg }}>{section.render({ draft, update })}</View> : null}
          </View>
        );
      })}
      {result?.error ? <Notice tone="danger">{result.error}</Notice> : null}
      {result?.saved ? (
        <Notice tone="positive" title={t("Perfil guardado")}>
          {result.saved.planAffected ? (
            <Txt variant="small">{t("Has cambiado datos que afectan a tu rutina. No se modifica sola: si quieres adaptarla, usa «Generar una rutina nueva» más abajo.")}</Txt>
          ) : null}
          {result.saved.nutritionAffected ? (
            <Txt variant="small">{t("También cambian los datos con los que se estiman tus calorías. Puedes recalcularlas en Nutrición («Cómo se ha calculado»).")}</Txt>
          ) : null}
        </Notice>
      ) : null}
      {dirty ? (
        <Button size="lg" full onPress={save} loading={pending}>
          {t("Guardar cambios")}
        </Button>
      ) : null}
    </View>
  );
}

function Reminders({ profile }: { profile: Profile }) {
  const { run, pending } = useMutation();
  const [enabled, setEnabled] = useState(profile.remindersEnabled);
  const [weekday, setWeekday] = useState(profile.weighInWeekday);
  const [saved, setSaved] = useState(false);
  const changed = enabled !== profile.remindersEnabled || weekday !== profile.weighInWeekday;

  return (
    <Card>
      <CardHeader title={t("Recordatorios")} description={t("Avisos en la pantalla de inicio. Las notificaciones del móvil todavía no están disponibles.")} />
      <View style={{ gap: space.lg }}>
        <Toggle
          checked={enabled}
          onChange={(value) => {
            setEnabled(value);
            setSaved(false);
          }}
        >
          {t("Mostrar avisos en el inicio cuando toque pesarse, medirse o hacer la revisión semanal.")}
        </Toggle>
        <Field label={t("Día para pesarte")}>
          <Segmented
            columns={4}
            options={WEEKDAY_LABEL.map((label, index) => ({ value: index + 1, label: label.slice(0, 3) }))}
            value={weekday}
            onChange={(value) => {
              setWeekday(value);
              setSaved(false);
            }}
          />
        </Field>
        {saved ? <Notice tone="positive">{t("Recordatorios guardados.")}</Notice> : null}
        {changed ? (
          <Button
            variant="secondary"
            loading={pending}
            onPress={async () => {
              await run((db) => updateReminders(db, weekday, enabled));
              setSaved(true);
            }}
          >
            {t("Guardar recordatorios")}
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

function Limitations({ limitations }: { limitations: Limitation[] }) {
  const colors = useColors();
  const { run, pending } = useMutation();
  const [message, setMessage] = useState<{ tone: "danger" | "positive"; text: string } | null>(null);
  const active = limitations.filter((item) => item.active);
  const resolved = limitations.filter((item) => !item.active);

  return (
    <Card>
      <CardHeader
        title={t("Lesiones, molestias y limitaciones")}
        description={t(
          "Con intensidad moderada o importante, la rutina evita los ejercicios que cargan esa zona; con intensidad leve los mantiene con un aviso. Esta aplicación no hace diagnósticos.",
        )}
      />
      {active.length === 0 ? (
        <Txt variant="small" style={{ marginBottom: space.md }}>
          {t("No tienes ninguna limitación activa.")}
        </Txt>
      ) : (
        <View style={{ gap: space.sm, marginBottom: space.md }}>
          {active.map((item) => (
            <View key={item.id} style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
                <Txt style={{ fontWeight: "500" }}>{BODY_AREA_LABEL[item.bodyArea]}</Txt>
                <Badge tone={item.severity === "mild" ? "neutral" : "warning"}>{SEVERITY_LABEL[item.severity]}</Badge>
              </View>
              <Txt variant="tiny">
                {t("{tipo} · desde el {fecha}", { tipo: LIMITATION_KIND_LABEL[item.kind], fecha: formatDate(item.createdOn) })}
              </Txt>
              {item.description ? <Txt variant="small">{item.description}</Txt> : null}
              <Button size="sm" variant="ghost" onPress={() => run((db) => resolveLimitation(db, item.id))}>
                {t("Ya está resuelta")}
              </Button>
            </View>
          ))}
        </View>
      )}
      <Collapsible title={t("Añadir una lesión, molestia o limitación")}>
        <View style={{ gap: space.md }}>
          <LimitationEditor
            disabled={pending}
            onAdd={async (limitation) => {
              const result = await run((db) => addLimitation(db, limitation));
              if (!result) return;
              setMessage(result.ok ? { tone: "positive", text: t("Añadida. Genera una rutina nueva para que se tenga en cuenta.") } : { tone: "danger", text: result.error });
            }}
          />
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        </View>
      </Collapsible>
      {resolved.length > 0 ? (
        <Txt variant="tiny" style={{ marginTop: space.md }}>
          {t("Resueltas: {lista}.", { lista: resolved.map((item) => `${BODY_AREA_LABEL[item.bodyArea].toLowerCase()} (${formatDate(item.createdOn)})`).join(", ") })}
        </Txt>
      ) : null}
    </Card>
  );
}

function DataCard() {
  const colors = useColors();
  const { run, pending } = useMutation();
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await run((db) => exportAllData(db));
      if (!data) return;
      const file = new File(Paths.cache, `smart-fitness-coach-${today()}.json`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: t("Exportar mis datos") });
      } else {
        Alert.alert(t("Exportación lista"), t("Se ha guardado en: {ruta}", { ruta: file.uri }));
      }
    } catch (cause) {
      Alert.alert(t("No se ha podido exportar"), cause instanceof Error ? cause.message : String(cause));
    } finally {
      setExporting(false);
    }
  };

  const deleteEverything = () =>
    Alert.alert(
      t("Borrar todos mis datos"),
      t(
        "Se eliminarán de forma definitiva tu perfil, pesos, medidas, fotografías, rutinas, sesiones y revisiones de este teléfono. No se puede deshacer. Si quieres conservar una copia, exporta antes tus datos.",
      ),
      [
        { text: t("Cancelar"), style: "cancel" },
        {
          text: t("Borrar todo"),
          style: "destructive",
          onPress: async () => {
            const done = await run(async (db) => {
              await deleteAllPhotos(db);
              deleteAllMealPhotos();
              await deleteAllData(db);
              return true;
            });
            if (done) router.replace("/bienvenida");
          },
        },
      ],
    );

  return (
    <Card>
      <CardHeader
        title={t("Tus datos")}
        description={t("Descarga una copia de todo lo que la app guarda sobre ti (JSON). Sirve de copia de seguridad y para unir tus datos con la web u otra app más adelante.")}
      />
      <View style={{ gap: space.md }}>
        <Button variant="secondary" icon={Download} onPress={exportData} loading={exporting}>
          {t("Exportar mis datos")}
        </Button>
        <View style={{ paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Button variant="danger" icon={Trash2} onPress={deleteEverything} loading={pending}>
            {t("Borrar todos mis datos")}
          </Button>
        </View>
      </View>
    </Card>
  );
}
