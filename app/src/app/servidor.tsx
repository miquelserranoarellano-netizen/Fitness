import { KeyRound, RefreshCw } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Field, Input } from "@/components/form";
import { Screen } from "@/components/screen";
import { Button, Card, CardHeader, Notice, Row, Txt } from "@/components/ui";
import { useAiConsent } from "@/features/meals/consent";
import { t } from "@/i18n";
import { cleanAccessCode, getAccessCode, MAX_ACCESS_CODE_LENGTH, setAccessCode } from "@/lib/access-code";
import { ApiError, apiErrorMessage, type AccessStatus, type ServerHealth } from "@/lib/api";
import { getApi } from "@/lib/api-config";
import { AI_ENABLED } from "@/lib/features";
import { isWeb } from "@/lib/web";
import { space, useColors } from "@/theme";

type Check =
  | { status: "checking" }
  | { status: "ok"; health: ServerHealth; access: AccessStatus | null }
  | { status: "error"; error: unknown };

/**
 * Conexión con el servidor que analiza las comidas y código de acceso de esta persona (uno de los de
 * `ACCESS_CODES` del servidor). Sin código, el resto de la app funciona igual: solo faltan el análisis con
 * IA y la búsqueda por código de barras.
 */
export default function ServerSettings() {
  const colors = useColors();
  const consent = useAiConsent();
  const [saved, setSaved] = useState(getAccessCode);
  const [code, setCode] = useState(() => getAccessCode() ?? "");
  const [check, setCheck] = useState<Check>({ status: "checking" });
  const [storeFailed, setStoreFailed] = useState(false);

  const verify = useCallback(
    () =>
      getApi()
        .health()
        .then(async (health) => {
          // Si el servidor pide código y aún no hay ninguno, no hay nada más que comprobar.
          const access = health.auth && !getAccessCode() ? null : await getApi().me();
          setCheck({ status: "ok", health, access });
        })
        .catch((error: unknown) => setCheck({ status: "error", error })),
    [],
  );

  useEffect(() => {
    void verify();
  }, [verify]);

  const recheck = () => {
    setCheck({ status: "checking" });
    void verify();
  };

  const save = () => {
    setStoreFailed(!setAccessCode(code));
    const current = getAccessCode();
    setSaved(current);
    setCode(current ?? "");
    recheck();
  };

  const remove = () => {
    setAccessCode(null);
    setSaved(null);
    setCode("");
    recheck();
  };

  const clean = cleanAccessCode(code);
  const changed = clean !== (saved ?? "");

  return (
    <Screen
      description={
        AI_ENABLED
          ? t("El servidor analiza con IA las comidas que fotografías o escribes y busca los códigos de barras. El resto de la app funciona sin él.")
          : t("El servidor busca los productos por su código de barras en Open Food Facts. El resto de la app funciona sin él.")
      }
    >
      <Card>
        <CardHeader title={t("Estado")} />
        <View style={{ gap: space.md }}>
          <Row label={t("Dirección")} value={getApi().baseUrl || t("Sin configurar")} />
          {check.status === "checking" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.accentFg} />
              <Txt variant="small">{t("Comprobando…")}</Txt>
            </View>
          ) : check.status === "ok" ? (
            <>
              <Row label={t("Conexión")} value={t("Correcta")} />
              {AI_ENABLED ? <Row label={t("Análisis con IA")} value={check.health.ai ? t("Disponible") : t("Sin configurar en el servidor")} /> : null}
              <StatusNotice health={check.health} access={check.access} />
            </>
          ) : check.error instanceof ApiError && check.error.code === "unauthorized" ? (
            <Notice tone="danger" title={t("Código no válido")}>
              {t("Este código no existe o se ha retirado. Revísalo (sin espacios) o pide uno nuevo.")}
            </Notice>
          ) : (
            <Notice tone="danger" title={t("No se ha podido comprobar")}>
              {apiErrorMessage(check.error)}
            </Notice>
          )}
          <Button size="sm" variant="secondary" icon={RefreshCw} onPress={recheck} disabled={check.status === "checking"}>
            {t("Comprobar otra vez")}
          </Button>
        </View>
      </Card>

      <Card>
        <CardHeader
          title={t("Código de acceso")}
          description={
            isWeb
              ? t("Te lo da quien gestiona el servidor; cada persona tiene el suyo. Se guarda solo en este navegador.")
              : t("Te lo da quien gestiona el servidor; cada persona tiene el suyo. Se guarda solo en este teléfono, en su llavero seguro.")
          }
        />
        <View style={{ gap: space.md }}>
          <Field label={t("Tu código")}>
            <Input
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={MAX_ACCESS_CODE_LENGTH}
              placeholder={t("Pega aquí tu código")}
              accessibilityLabel={t("Tu código de acceso")}
            />
          </Field>
          {storeFailed ? <Notice tone="danger">{t("No se ha podido guardar el código en este dispositivo.")}</Notice> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Button icon={KeyRound} onPress={save} disabled={!changed || clean.length === 0}>
              {t("Guardar y comprobar")}
            </Button>
            {saved ? (
              <Button variant="ghost" onPress={remove}>
                {t("Quitar el código")}
              </Button>
            ) : null}
          </View>
        </View>
      </Card>

      {AI_ENABLED ? (
        <Card>
          <CardHeader
            title={t("Permiso para analizar con IA")}
            description={t("Las fotos y textos de comida que analizas, con tus alergias, pasan por este servidor (que no los guarda) hasta Claude, la IA de Anthropic, que reconoce los alimentos.")}
          />
          <View style={{ gap: space.md }}>
            <Row label={t("Estado")} value={consent.granted ? t("Aceptado") : t("Sin aceptar: se te preguntará antes del primer análisis")} />
            {consent.granted ? (
              <Button size="sm" variant="secondary" onPress={consent.revoke}>
                {t("Retirar el permiso")}
              </Button>
            ) : null}
          </View>
        </Card>
      ) : null}

      <Txt variant="tiny">{t("Tus entrenamientos, medidas y comidas registradas no salen de tu dispositivo.")}</Txt>
    </Screen>
  );
}

function StatusNotice({ health, access }: { health: ServerHealth; access: AccessStatus | null }) {
  if (!health.auth) {
    return <Notice tone="warning">{t("Este servidor no pide código: es un servidor de desarrollo.")}</Notice>;
  }
  if (!access) {
    return (
      <Notice tone="warning">
        {AI_ENABLED
          ? t("Escribe tu código de acceso para analizar comidas con IA y buscar códigos de barras.")
          : t("Escribe tu código de acceso para buscar productos por su código de barras.")}
      </Notice>
    );
  }
  if (!AI_ENABLED) return <Notice tone="positive" title={t("Código de {nombre}", { nombre: access.name })} />;
  return (
    <Notice tone="positive" title={t("Código de {nombre}", { nombre: access.name })}>
      {access.limit !== null
        ? t("Hoy llevas {usados} de {limite} análisis con IA.", { usados: access.used, limite: access.limit })
        : t("Hoy llevas {usados} análisis con IA.", { usados: access.used })}
    </Notice>
  );
}
