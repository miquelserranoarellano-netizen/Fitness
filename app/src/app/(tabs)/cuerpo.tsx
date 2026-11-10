import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, Lock, Ruler, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { LineChart, Sparkline } from "@/components/charts";
import { DateStepper, Field, Segmented, UnitInput } from "@/components/form";
import { Loading, Screen } from "@/components/screen";
import { Button, Card, CardHeader, Collapsible, EmptyState, Notice, Stat, StatRow, Txt } from "@/components/ui";
import { deleteMeasurements, deleteWeight, listMeasurements, listWeights, type MeasurementRecord, type WeightRecord } from "@/data/body";
import { addPhoto, deletePhoto, listPhotos, POSE_LABEL, revokePhotosConsent, type Pose } from "@/data/photos";
import { requireProfile, setPhotosConsent, type Profile } from "@/data/profile";
import { useMutation, useQuery } from "@/data/provider";
import { logWeight, saveMeasurements } from "@/data/services";
import { measureProgress } from "@/domain/body/measurements";
import { change, smooth, weightTrend } from "@/domain/body/trend";
import { targetRate } from "@/domain/nutrition/targets";
import { MEASURES, MEASURE_HELP, MEASURE_LABEL, type Measure } from "@/domain/types";
import type { Measurements } from "@/features/profile/schema";
import { MeasureGuide } from "@/features/profile/MeasureGuide";
import { t, tn } from "@/i18n";
import { appAlert } from "@/lib/alert";
import { daysBetween, formatDate, formatShortDate, relativeDay, today as todayDate } from "@/lib/dates";
import { formatNumber, formatSigned, fromDisplayLength, fromDisplayWeight, lengthUnit, parseDecimal, roundDisplay, toDisplayLength, toDisplayWeight, weightUnit } from "@/lib/units";
import { isWeb } from "@/lib/web";
import { radius, space, useColors } from "@/theme";

export default function Body() {
  const colors = useColors();
  const query = useQuery(async (db) => ({
    profile: await requireProfile(db),
    weights: await listWeights(db),
    measurements: await listMeasurements(db),
  }));
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;
  const { profile, weights, measurements } = query.data;
  const today = todayDate();
  const { units } = profile;
  const wUnit = weightUnit(units);
  const lUnit = lengthUnit(units);
  const w = (kg: number) => roundDisplay(toDisplayWeight(kg, units), 1);
  const l = (cm: number) => roundDisplay(toDisplayLength(cm, units), 1);

  const first = weights[0] ?? null;
  const latest = weights[weights.length - 1] ?? null;
  const trend = weightTrend(weights, today);
  const sinceStart = change(first?.kg, latest?.kg);
  const [rateMin, rateMax] = targetRate(profile.primaryGoal, profile.level);
  const progress = measureProgress(measurements);
  const lastMeasurement = measurements[measurements.length - 1] ?? null;
  const daysSinceMeasure = lastMeasurement ? daysBetween(lastMeasurement.date, today) : null;
  const missing = MEASURES.filter((measure) => progress[measure].latest === null);

  return (
    <Screen tab title={t("Mi cuerpo")} description={t("Peso cada semana, medidas cada mes. Las decisiones se toman con tendencias, no con una medición suelta.")}>
      <Card>
        <CardHeader title={t("Peso")} description={latest ? t("Última pesada: {cuando}.", { cuando: relativeDay(latest.date, today) }) : undefined} />
        {latest && first ? (
          <>
            <StatRow>
              <Stat label={t("Peso actual")} value={formatNumber(w(latest.kg), 1)} unit={wUnit} />
              <Stat
                label={t("Tendencia")}
                value={trend.status === "ok" ? formatSigned(toDisplayWeight(trend.kgPerWeek, units), 2) : "—"}
                unit={trend.status === "ok" ? t("{unidad}/sem", { unidad: wUnit }) : undefined}
                hint={
                  trend.status === "ok"
                    ? t("{ritmo} % semanal · objetivo {desde} a {hasta} %", {
                        ritmo: formatSigned(trend.pctPerWeek, 2),
                        desde: formatSigned(rateMin, 2),
                        hasta: formatSigned(rateMax, 2),
                      })
                    : t("Aún sin datos suficientes")
                }
              />
              {sinceStart && weights.length > 1 ? (
                <Stat
                  label={t("Desde el {fecha}", { fecha: formatShortDate(first.date) })}
                  value={formatSigned(w(sinceStart.absolute), 1)}
                  unit={wUnit}
                  hint={`${formatSigned(sinceStart.percent, 1)} %`}
                />
              ) : null}
            </StatRow>
            <View style={{ marginTop: space.lg }}>
              {weights.length >= 2 ? (
                <LineChart
                  unit={wUnit}
                  series={[
                    { id: "raw", label: t("Pesadas"), mark: "dots", points: weights.map((entry) => ({ date: entry.date, value: w(entry.kg) })) },
                    { id: "trend", label: t("Tendencia suavizada"), mark: "line", points: smooth(weights).map((entry) => ({ date: entry.date, value: w(entry.kg) })) },
                  ]}
                />
              ) : (
                <Notice>{t("Con tu segunda pesada empezarás a ver el gráfico de evolución.")}</Notice>
              )}
              {trend.status === "insufficient" && weights.length >= 2 ? (
                <Txt variant="tiny" style={{ marginTop: space.sm }}>
                  {trend.needed}
                </Txt>
              ) : null}
            </View>
          </>
        ) : (
          <EmptyState title={t("Sin pesadas todavía")}>{t("Registra tu peso para empezar a ver tu evolución.")}</EmptyState>
        )}
      </Card>

      <Card>
        <CardHeader title={t("Registrar peso")} />
        <WeightForm profile={profile} lastKg={latest?.kg ?? null} />
      </Card>

      {weights.length > 0 ? <WeightHistory weights={weights} units={profile.units} /> : null}

      <Card>
        <CardHeader
          title={t("Medidas corporales")}
          description={
            lastMeasurement
              ? `${t("Última medición: {fecha}", { fecha: formatDate(lastMeasurement.date) })}${daysSinceMeasure !== null && daysSinceMeasure >= 28 ? t(". Ya toca repetirla.") : ""}`
              : t("Mídete una vez al mes para saber qué crece y qué se estanca.")
          }
        />
        {measurements.length === 0 ? (
          <EmptyState icon={Ruler} title={t("Aún no hay medidas")}>
            {t("Añade tu primera medición más abajo. Puedes empezar solo con las que sepas.")}
          </EmptyState>
        ) : (
          <View>
            {MEASURES.map((measure) => {
              const item = progress[measure];
              if (!item.latest) return null;
              return (
                <View key={measure} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="small" style={{ color: colors.fg }}>
                      {MEASURE_LABEL[measure]}
                    </Txt>
                    <Txt variant="tiny" num>
                      {item.vsPrevious
                        ? t("{cambio} ({porcentaje} %) desde la anterior", { cambio: formatSigned(l(item.vsPrevious.absolute), 1), porcentaje: formatSigned(item.vsPrevious.percent, 1) })
                        : t("Primera medición")}
                      {item.vsFirst && item.series.length > 2 ? t(" · {porcentaje} % desde el inicio", { porcentaje: formatSigned(item.vsFirst.percent, 1) }) : ""}
                    </Txt>
                  </View>
                  <Sparkline values={item.series.map((point) => point.value)} />
                  <Txt variant="label" num style={{ minWidth: 70, textAlign: "right" }}>
                    {formatNumber(l(item.latest.value), 1)} {lUnit}
                  </Txt>
                </View>
              );
            })}
            {missing.length > 0 ? (
              <Txt variant="tiny" style={{ marginTop: space.md }}>
                {t("Sin medir todavía: {medidas}.", { medidas: missing.map((measure) => MEASURE_LABEL[measure].toLowerCase()).join(", ") })}
              </Txt>
            ) : null}
            {measurements.length === 1 ? (
              <Txt variant="tiny" style={{ marginTop: space.sm }}>
                {t("Las diferencias aparecerán a partir de la segunda medición.")}
              </Txt>
            ) : null}
          </View>
        )}
      </Card>

      <Card>
        <CardHeader title={t("Nueva medición")} description={t("En centímetros o pulgadas según tus unidades. Solo se comparan medidas tomadas del mismo modo.")} />
        <MeasurementsForm units={profile.units} previous={lastMeasurement?.values ?? null} />
        {measurements.length > 0 ? <MeasurementList measurements={measurements} /> : null}
      </Card>

      {isWeb ? <PhotosOnlyOnPhone /> : <PhotosSection consent={profile.photosConsent} />}
    </Screen>
  );
}

function WeightForm({ profile, lastKg }: { profile: Profile; lastKg: number | null }) {
  const { run, pending } = useMutation();
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayDate());
  const [message, setMessage] = useState<{ tone: "danger" | "positive"; text: string } | null>(null);

  const save = async () => {
    const parsed = parseDecimal(value);
    if (parsed === null) return setMessage({ tone: "danger", text: t("Escribe tu peso.") });
    const result = await run((db) => logWeight(db, { date, kg: fromDisplayWeight(parsed, profile.units) }));
    if (!result) return;
    if (!result.ok) return setMessage({ tone: "danger", text: result.error });
    setValue("");
    setMessage({ tone: "positive", text: t("Peso del {fecha} guardado.", { fecha: formatDate(date) }) });
  };

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Field label={t("Peso")} style={{ flex: 1 }}>
          <UnitInput
            unit={weightUnit(profile.units)}
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setMessage(null);
            }}
            placeholder={lastKg === null ? "" : formatNumber(toDisplayWeight(lastKg, profile.units), 1)}
          />
        </Field>
        <Field label={t("Fecha")} style={{ flex: 1.3 }}>
          <DateStepper value={date} onChange={setDate} />
        </Field>
      </View>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button onPress={save} loading={pending}>
        {t("Guardar peso")}
      </Button>
      <Txt variant="tiny">
        {t(
          "Pésate por la mañana, después de ir al baño y antes de comer o beber, siempre en condiciones parecidas. Si guardas dos veces el mismo día, se queda el último valor.",
        )}
      </Txt>
    </View>
  );
}

function WeightHistory({ weights, units }: { weights: WeightRecord[]; units: Profile["units"] }) {
  const colors = useColors();
  const { run } = useMutation();
  const list = [...weights].reverse();
  const w = (kg: number) => roundDisplay(toDisplayWeight(kg, units), 1);
  const remove = (entry: WeightRecord) =>
    appAlert(t("Borrar pesada"), t("¿Borrar la pesada del {fecha}?", { fecha: formatDate(entry.date) }), [
      { text: t("Cancelar"), style: "cancel" },
      { text: t("Borrar"), style: "destructive", onPress: () => run((db) => deleteWeight(db, entry.id)) },
    ]);
  return (
    <Card>
      <Collapsible title={t("Historial de pesadas ({n})", { n: weights.length })}>
        {list.slice(0, 60).map((entry, index) => {
          const before = list[index + 1];
          return (
            <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <Txt variant="small" style={{ flex: 1 }}>
                {formatDate(entry.date)}
              </Txt>
              <Txt variant="label" num>
                {formatNumber(w(entry.kg), 1)} {weightUnit(units)}
              </Txt>
              <Txt variant="tiny" num style={{ width: 48, textAlign: "right" }}>
                {before ? formatSigned(w(entry.kg - before.kg), 1) : "—"}
              </Txt>
              <Pressable onPress={() => remove(entry)} hitSlop={8} accessibilityLabel={t("Borrar la pesada del {fecha}", { fecha: formatDate(entry.date) })}>
                <Trash2 size={16} color={colors.subtle} />
              </Pressable>
            </View>
          );
        })}
      </Collapsible>
    </Card>
  );
}

function MeasurementsForm({ units, previous }: { units: Profile["units"]; previous: Measurements | null }) {
  const colors = useColors();
  const { run, pending } = useMutation();
  const empty = () => Object.fromEntries(MEASURES.map((measure) => [measure, ""])) as Record<Measure, string>;
  const [values, setValues] = useState<Record<Measure, string>>(empty);
  const [date, setDate] = useState(todayDate());
  const [showGuide, setShowGuide] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "positive"; text: string } | null>(null);

  const save = async () => {
    const parsed = {} as Measurements;
    for (const measure of MEASURES) {
      const raw = values[measure].trim();
      if (raw === "") {
        parsed[measure] = null;
        continue;
      }
      const number = parseDecimal(raw);
      if (number === null) return setMessage({ tone: "danger", text: t("Revisa el valor de «{medida}».", { medida: MEASURE_LABEL[measure] }) });
      parsed[measure] = roundDisplay(fromDisplayLength(number, units), 1);
    }
    const result = await run((db) => saveMeasurements(db, date, parsed));
    if (!result) return;
    if (!result.ok) return setMessage({ tone: "danger", text: result.error });
    setValues(empty());
    setMessage({ tone: "positive", text: t("Medidas del {fecha} guardadas.", { fecha: formatDate(date) }) });
  };

  return (
    <View style={{ gap: space.lg }}>
      <Field label={t("Fecha de la medición")}>
        <DateStepper value={date} onChange={setDate} />
      </Field>
      <Pressable onPress={() => setShowGuide((value) => !value)}>
        <Txt variant="small" style={{ color: colors.accentFg, fontWeight: "600" }}>
          {showGuide ? t("Ocultar dónde colocar la cinta") : t("Ver dónde colocar la cinta")}
        </Txt>
      </Pressable>
      {showGuide ? <MeasureGuide /> : null}
      {MEASURES.map((measure, index) => {
        const last = previous?.[measure] ?? null;
        return (
          <Field key={measure} label={`${index + 1}. ${MEASURE_LABEL[measure]}`} hint={showGuide ? MEASURE_HELP[measure] : undefined}>
            <UnitInput
              unit={lengthUnit(units)}
              value={values[measure]}
              onChangeText={(text) => {
                setValues((current) => ({ ...current, [measure]: text }));
                setMessage(null);
              }}
              placeholder={last === null ? t("Sin medir") : t("antes: {valor}", { valor: formatNumber(toDisplayLength(last, units), 1) })}
            />
          </Field>
        );
      })}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button onPress={save} loading={pending}>
        {t("Guardar medidas")}
      </Button>
      <Txt variant="tiny">
        {t(
          "Deja en blanco lo que no midas hoy. Para que las comparaciones sirvan, mide siempre en las mismas condiciones: por la mañana, en frío y el mismo lado del cuerpo.",
        )}
      </Txt>
    </View>
  );
}

function MeasurementList({ measurements }: { measurements: MeasurementRecord[] }) {
  const colors = useColors();
  const { run } = useMutation();
  const remove = (record: MeasurementRecord) =>
    appAlert(t("Borrar medición"), t("¿Borrar las medidas del {fecha}?", { fecha: formatDate(record.date) }), [
      { text: t("Cancelar"), style: "cancel" },
      { text: t("Borrar"), style: "destructive", onPress: () => run((db) => deleteMeasurements(db, record.id)) },
    ]);
  return (
    <View style={{ marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Collapsible title={t("Mediciones guardadas ({n})", { n: measurements.length })}>
        {[...measurements].reverse().map((record) => (
          <View key={record.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 8 }}>
            <Txt variant="small" style={{ flex: 1 }}>
              {formatDate(record.date)} · {tn(MEASURES.filter((measure) => record.values[measure] !== null).length, "{n} medida", "{n} medidas")}
            </Txt>
            <Pressable onPress={() => remove(record)} hitSlop={8} accessibilityLabel={t("Borrar la medición del {fecha}", { fecha: formatDate(record.date) })}>
              <Trash2 size={16} color={colors.subtle} />
            </Pressable>
          </View>
        ))}
      </Collapsible>
    </View>
  );
}

/* ───────────────────────────── Fotografías ───────────────────────────── */

/** En la web no hay carpeta privada de la app donde guardarlas (expo-file-system no existe allí). */
function PhotosOnlyOnPhone() {
  return (
    <Card>
      <CardHeader title={t("Fotografías de progreso")} description={t("Solo en la app del móvil: la versión web no tiene un sitio privado donde guardarlas.")} />
    </Card>
  );
}

function PhotosSection({ consent }: { consent: boolean }) {
  const colors = useColors();
  const { run, pending } = useMutation();
  const photos = useQuery((db) => (consent ? listPhotos(db) : Promise.resolve([])), [consent]);
  const [pose, setPose] = useState<Pose>("front");
  const [date, setDate] = useState(todayDate());

  if (!consent) {
    return (
      <Card>
        <CardHeader title={t("Fotografías de progreso")} description={t("Opcionales. Ayudan a ver cambios que la báscula y la cinta no muestran.")} />
        <View style={{ flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
          <Lock size={20} color={colors.muted} />
          <View style={{ flex: 1, gap: space.md }}>
            <Txt variant="small">
              {t("Tus fotografías son")}{" "}
              <Txt variant="small" style={{ color: colors.fg, fontWeight: "600" }}>
                {t("privadas")}
              </Txt>
              {t(
                ": se guardan solo en este teléfono, dentro de la app, no se envían a ningún servicio ni a ninguna IA y no se usan para estimar tu porcentaje de grasa. Se guardan reducidas. Puedes borrarlas o retirar este permiso en cualquier momento.",
              )}
            </Txt>
            <Button variant="secondary" onPress={() => run((db) => setPhotosConsent(db, true))} loading={pending}>
              {t("Acepto guardar fotografías de mi progreso")}
            </Button>
          </View>
        </View>
      </Card>
    );
  }

  const pick = async (source: "camera" | "library") => {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9, exif: false };
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return appAlert(t("Sin permiso de cámara"), t("Activa el permiso de cámara en los ajustes del teléfono o elige una foto de la galería."));
    }
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    await run((db) => addPhoto(db, { sourceUri: asset.uri, width: asset.width, height: asset.height, date, pose }));
  };

  const remove = (id: string) =>
    appAlert(t("Borrar fotografía"), t("Se borrará de forma definitiva."), [
      { text: t("Cancelar"), style: "cancel" },
      { text: t("Borrar"), style: "destructive", onPress: () => run((db) => deletePhoto(db, id)) },
    ]);

  const revoke = () =>
    appAlert(t("Retirar el permiso"), t("Se eliminarán de forma definitiva todas tus fotografías. No se puede deshacer."), [
      { text: t("Cancelar"), style: "cancel" },
      { text: t("Borrar todas"), style: "destructive", onPress: () => run((db) => revokePhotosConsent(db)) },
    ]);

  const list = photos.data ?? [];
  const byDate = new Map<string, typeof list>();
  for (const photo of list) byDate.set(photo.date, [...(byDate.get(photo.date) ?? []), photo]);

  return (
    <Card>
      <CardHeader title={t("Fotografías de progreso")} description={t("Privadas y ordenadas por fecha. Hazlas siempre con la misma luz, distancia y postura para poder compararlas.")} />
      <View style={{ gap: space.md }}>
        <Field label={t("Postura")}>
          <Segmented options={(Object.keys(POSE_LABEL) as Pose[]).map((value) => ({ value, label: POSE_LABEL[value] }))} value={pose} onChange={setPose} />
        </Field>
        <Field label={t("Fecha")}>
          <DateStepper value={date} onChange={setDate} />
        </Field>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button variant="secondary" icon={Camera} onPress={() => pick("camera")} loading={pending} style={{ flex: 1 }}>
            {t("Hacer foto")}
          </Button>
          <Button variant="secondary" icon={ImagePlus} onPress={() => pick("library")} disabled={pending} style={{ flex: 1 }}>
            {t("Galería")}
          </Button>
        </View>
      </View>

      {list.length === 0 ? (
        <Txt variant="small" style={{ marginTop: space.lg }}>
          {t("Todavía no has añadido ninguna fotografía.")}
        </Txt>
      ) : (
        <View style={{ gap: space.lg, marginTop: space.lg }}>
          {[...byDate.entries()].map(([day, items]) => (
            <View key={day} style={{ gap: space.sm }}>
              <Txt variant="label">{formatDate(day)}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {items.map((photo) => (
                  <View key={photo.id} style={{ width: "48%", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={{ width: "100%", aspectRatio: 3 / 4 }}
                      contentFit="cover"
                      accessibilityLabel={t("Fotografía de progreso: {postura}, {fecha}", { postura: POSE_LABEL[photo.pose].toLowerCase(), fecha: formatDate(day) })}
                    />
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Txt variant="tiny">{POSE_LABEL[photo.pose]}</Txt>
                      <Pressable onPress={() => remove(photo.id)} hitSlop={8} accessibilityLabel={t("Borrar fotografía")}>
                        <Trash2 size={14} color={colors.subtle} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line }}>
        <Pressable onPress={revoke}>
          <Txt variant="small" style={{ color: colors.danger }}>
            {t("Retirar el permiso y borrar todas las fotografías")}
          </Txt>
        </Pressable>
      </View>
    </Card>
  );
}
