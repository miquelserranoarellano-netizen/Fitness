import { ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Bullets, Button, Card, CardHeader, Txt } from "@/components/ui";
import { t } from "@/i18n";
import { hasAiConsent, setAiConsent } from "@/lib/ai-consent";
import { space } from "@/theme";

/** Permiso para analizar comidas con IA (ver `lib/ai-consent.ts`). */
export function useAiConsent() {
  const [granted, setGranted] = useState(hasAiConsent);
  const grant = () => {
    setAiConsent(true);
    setGranted(true);
  };
  const revoke = () => {
    setAiConsent(false);
    setGranted(false);
  };
  return { granted, grant, revoke };
}

/**
 * Lo que se enseña antes del primer análisis: qué sale del dispositivo, a quién llega y qué no se
 * envía nunca. Sin aceptar, la comida se puede añadir a mano o con el código de barras.
 */
export function AiConsentCard({ onAccept, onManual }: { onAccept: () => void; onManual: () => void }) {
  return (
    <Card highlight>
      <CardHeader title={t("Antes de analizar con IA")} description={t("Para reconocer los alimentos, esto sale de tu dispositivo:")} />
      <View style={{ gap: space.md }}>
        <Bullets
          items={[
            t("La foto (reducida y sin ubicación) o el texto de la comida que analices."),
            t("Las alergias y los alimentos que evitas, si los has indicado, para poder avisarte."),
          ]}
        />
        <Txt variant="small">
          {t(
            "Pasa por el servidor de la app, que no lo guarda, y llega a Claude, la IA de Anthropic (una empresa externa), que lo procesa para responder. No se envía nada más: ni tu nombre, ni tu peso o medidas, ni tus entrenamientos.",
          )}
        </Txt>
        <Txt variant="small">{t("Puedes retirar este permiso cuando quieras en Más → Servidor y código de acceso.")}</Txt>
        <View style={{ gap: space.sm }}>
          <Button icon={ShieldCheck} onPress={onAccept} full>
            {t("Acepto, analizar con IA")}
          </Button>
          <Button variant="ghost" onPress={onManual} full>
            {t("Ahora no, añadirla a mano")}
          </Button>
        </View>
      </View>
    </Card>
  );
}
