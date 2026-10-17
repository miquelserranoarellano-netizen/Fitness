import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, ImagePlus } from "lucide-react-native";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { View } from "react-native";
import { Screen } from "@/components/screen";
import { Button, Card, CardHeader, Notice, Txt } from "@/components/ui";
import { RequestError, WorkingPanel, useManualMeal } from "@/features/meals/components";
import { draftFromAnalysis, setMealDraft, type PickedPhoto } from "@/features/meals/draft";
import { useAvoidList, useServerRequest } from "@/features/meals/hooks";
import { t } from "@/i18n";
import { getApi } from "@/lib/api-config";
import { preparePhotoForAnalysis } from "@/lib/photo-prep";
import { radius, space, useColors } from "@/theme";

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.85, exif: false };

/**
 * Registrar una comida con una foto: se hace (o se elige), se manda al servidor para reconocer los
 * alimentos y se pasa a revisarla. Con `?abrir=camara` la cámara se abre al entrar.
 */
export default function PhotoMeal() {
  const colors = useColors();
  const router = useRouter();
  const manual = useManualMeal();
  const avoid = useAvoidList();
  const request = useServerRequest();
  const params = useLocalSearchParams<{ abrir?: string }>();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const opened = useRef(false);

  const analyze = async (picked: PickedPhoto) => {
    setNotice(null);
    const analysis = await request.start(async (signal) => {
      const payload = await preparePhotoForAnalysis(picked.uri, picked);
      return getApi().analyzePhoto(payload, { signal, avoid });
    });
    if (!analysis) return;
    if (!analysis.isFood || analysis.items.length === 0) {
      return setNotice(analysis.notes || t("No se ve comida en la foto. Prueba con otra, con el plato entero y buena luz."));
    }
    setMealDraft(draftFromAnalysis(analysis, "foto", picked));
    router.replace("/comida/nueva");
  };

  const pick = async (source: "camera" | "library") => {
    setNotice(null);
    request.reset();
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return setNotice(t("Sin permiso de cámara. Actívalo en los ajustes del teléfono o elige una foto de la galería."));
      }
    }
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const picked = { uri: asset.uri, width: asset.width, height: asset.height };
    setPhoto(picked);
    await analyze(picked);
  };

  // El botón grande de foto abre la cámara directamente (una sola vez).
  const openCamera = useEffectEvent(() => {
    void pick("camera");
  });
  useEffect(() => {
    if (params.abrir === "camara" && !opened.current) {
      opened.current = true;
      openCamera();
    }
  }, [params.abrir]);

  const loading = request.state.status === "loading";

  return (
    <Screen>
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          style={{ width: "100%", aspectRatio: Math.min(4 / 3, Math.max(3 / 4, photo.width / Math.max(photo.height, 1))), borderRadius: radius.lg, backgroundColor: colors.raised }}
          contentFit="cover"
          accessibilityLabel={t("Foto de la comida")}
        />
      ) : (
        <Card>
          <CardHeader title={t("Haz una foto del plato")} description={t("Con el plato entero a la vista, desde arriba y con buena luz. Si hay salsas o aceite, se nota mejor de cerca.")} />
        </Card>
      )}

      {loading ? (
        <Card>
          <WorkingPanel title={t("Analizando la foto…")} hint={t("Suele tardar entre 10 y 30 segundos.")} onCancel={request.cancel} />
        </Card>
      ) : (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button icon={Camera} onPress={() => pick("camera")} style={{ flex: 1 }}>
            {photo ? t("Otra foto") : t("Hacer foto")}
          </Button>
          <Button variant="secondary" icon={ImagePlus} onPress={() => pick("library")} style={{ flex: 1 }}>
            {t("Galería")}
          </Button>
        </View>
      )}

      {photo && !loading && request.state.status === "idle" && !notice ? (
        <Button variant="secondary" full onPress={() => analyze(photo)}>
          {t("Analizar esta foto")}
        </Button>
      ) : null}

      {notice ? <Notice tone="warning">{notice}</Notice> : null}

      {request.state.status === "error" ? (
        <RequestError error={request.state.error} onRetry={photo ? () => analyze(photo) : undefined}>
          <Button size="sm" variant="secondary" onPress={() => router.replace("/comida/texto")}>
            {t("Escribirla")}
          </Button>
          <Button size="sm" variant="secondary" onPress={manual}>
            {t("Añadirla a mano")}
          </Button>
        </RequestError>
      ) : null}

      <Txt variant="tiny">
        {t(
          "La foto se envía reducida y sin ubicación a tu servidor, que la pasa a la IA para reconocer los alimentos. En el teléfono se guarda una copia reducida con la comida y se borra al borrarla.",
        )}
      </Txt>
    </Screen>
  );
}
