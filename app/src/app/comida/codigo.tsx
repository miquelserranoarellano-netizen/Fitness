import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { ScanBarcode } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Field, Input } from "@/components/form";
import { Screen } from "@/components/screen";
import { Button, Card, CardHeader, Notice, Txt } from "@/components/ui";
import { RequestError, WorkingPanel, useManualMeal } from "@/features/meals/components";
import { draftFromAnalysis, setMealDraft } from "@/features/meals/draft";
import { useServerRequest } from "@/features/meals/hooks";
import { t } from "@/i18n";
import { ApiError } from "@/lib/api";
import { getApi } from "@/lib/api-config";
import { AI_ENABLED } from "@/lib/features";
import { radius, space, useColors } from "@/theme";

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e"] as const;
/** En la web no se usa la cámara: se escribe el número. */
const CAMERA_AVAILABLE = Platform.OS !== "web";

/** Producto envasado por su código de barras (Open Food Facts), con la cámara o escribiendo el número. */
export default function BarcodeMeal() {
  const colors = useColors();
  const router = useRouter();
  const manual = useManualMeal();
  const request = useServerRequest();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const loading = request.state.status === "loading";
  const error = request.state.status === "error" ? request.state.error : null;
  const notFound = error instanceof ApiError && error.code === "not_found";

  // La cámara solo está encendida mientras se ve esta pantalla.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const lookup = async (raw: string) => {
    const value = raw.replace(/\D/g, "");
    if (!/^\d{8,14}$/.test(value)) return setFormError(t("El código tiene entre 8 y 14 cifras."));
    setFormError(null);
    setCode(value);
    setPaused(true);
    const analysis = await request.start((signal) => getApi().lookupBarcode(value, { signal }));
    if (!analysis) return;
    setMealDraft(draftFromAnalysis(analysis, "codigo"));
    router.replace("/comida/nueva");
  };

  // La cámara avisa varias veces por segundo con el mismo código: solo cuenta el primero.
  const scanned = useRef(false);
  const onScanned = (result: BarcodeScanningResult) => {
    if (scanned.current || paused || loading) return;
    scanned.current = true;
    void lookup(result.data);
  };

  const scanAgain = () => {
    scanned.current = false;
    request.reset();
    setPaused(false);
  };

  return (
    <Screen description={t("Para productos envasados. Las cifras salen de la etiqueta, en Open Food Facts.")}>
      {CAMERA_AVAILABLE ? (
        <Card>
          {!permission ? null : permission.granted ? (
            <View style={{ gap: space.md }}>
              <View style={{ height: 220, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#000" }}>
                {focused && !paused ? (
                  <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }} onBarcodeScanned={onScanned} />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ScanBarcode size={32} color="#ffffff" />
                  </View>
                )}
              </View>
              {paused && !loading ? (
                <Button variant="secondary" size="sm" onPress={scanAgain}>
                  {t("Escanear otro")}
                </Button>
              ) : (
                <Txt variant="small">{t("Enfoca el código de barras del envase; se lee solo.")}</Txt>
              )}
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <CardHeader title={t("Leer el código con la cámara")} description={t("La cámara solo se usa en esta pantalla para leer el código; no se hace ninguna foto.")} />
              {permission.canAskAgain ? (
                <Button icon={ScanBarcode} onPress={requestPermission}>
                  {t("Permitir la cámara")}
                </Button>
              ) : (
                <Txt variant="small">{t("El permiso de cámara está desactivado. Actívalo en los ajustes del teléfono o escribe el número.")}</Txt>
              )}
            </View>
          )}
        </Card>
      ) : null}

      <Card>
        <View style={{ gap: space.md }}>
          <Field label={CAMERA_AVAILABLE ? t("O escribe el número") : t("Número del código de barras")} hint={t("Las cifras que hay debajo de las barras (8 a 14).")}>
            <Input value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 14))} keyboardType="number-pad" maxLength={14} placeholder="8410000000000" accessibilityLabel={t("Número del código de barras")} />
          </Field>
          {formError ? (
            <Txt variant="small" style={{ color: colors.danger }}>
              {formError}
            </Txt>
          ) : null}
          {loading ? (
            <WorkingPanel title={t("Buscando el producto {codigo}…", { codigo: code })} onCancel={request.cancel} />
          ) : (
            <Button onPress={() => lookup(code)} disabled={code.length < 8}>
              {t("Buscar")}
            </Button>
          )}
        </View>
      </Card>

      {notFound ? (
        <View style={{ gap: space.md }}>
          <Notice tone="warning" title={t("No encontramos este producto")}>
            {t("El código {codigo} no está en Open Food Facts o no tiene calorías. Puedes escribir la comida o añadirla a mano con los datos de la etiqueta.", { codigo: code })}
          </Notice>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {AI_ENABLED ? (
              <Button size="sm" variant="secondary" onPress={() => router.replace("/comida/texto")}>
                {t("Escribirla")}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onPress={manual}>
              {t("Añadirla a mano")}
            </Button>
          </View>
        </View>
      ) : error ? (
        <RequestError error={error} onRetry={() => lookup(code)}>
          <Button size="sm" variant="secondary" onPress={manual}>
            {t("Añadirla a mano")}
          </Button>
        </RequestError>
      ) : null}
    </Screen>
  );
}
