import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Field, Input } from "@/components/form";
import { Screen } from "@/components/screen";
import { Button, Card, Notice, Txt } from "@/components/ui";
import { RequestError, WorkingPanel, useManualMeal } from "@/features/meals/components";
import { draftFromAnalysis, setMealDraft } from "@/features/meals/draft";
import { useAvoidList, useServerRequest } from "@/features/meals/hooks";
import { t } from "@/i18n";
import { MAX_TEXT_LENGTH } from "@/lib/api";
import { getApi } from "@/lib/api-config";
import { space } from "@/theme";

/** Registrar una comida escribiéndola («2 huevos fritos y una tostada»): la IA la interpreta. */
export default function DescribeMeal() {
  const router = useRouter();
  const manual = useManualMeal();
  const avoid = useAvoidList();
  const request = useServerRequest();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const loading = request.state.status === "loading";

  const analyze = async () => {
    const clean = text.trim();
    setNotice(null);
    if (clean.length < 2) return setNotice(t("Escribe qué has comido."));
    const analysis = await request.start((signal) => getApi().analyzeText(clean, { signal, avoid }));
    if (!analysis) return;
    if (!analysis.isFood || analysis.items.length === 0) {
      return setNotice(t("No hemos reconocido ninguna comida en el texto. Prueba a nombrar los alimentos y, si puedes, las cantidades."));
    }
    setMealDraft(draftFromAnalysis(analysis, "texto"));
    router.replace("/comida/nueva");
  };

  return (
    <Screen description={t("Escribe lo que has comido, con cantidades si las sabes. La IA lo separa en alimentos y busca sus cifras; después puedes corregirlo.")}>
      <Card>
        <View style={{ gap: space.md }}>
          <Field label={t("Qué has comido")} hint={t("Por ejemplo: «2 huevos fritos, una tostada con aceite y un café con leche».")}>
            <Input value={text} onChangeText={setText} multiline maxLength={MAX_TEXT_LENGTH} placeholder={t("Escribe aquí…")} accessibilityLabel={t("Qué has comido")} />
          </Field>
          <Txt variant="tiny" num style={{ textAlign: "right" }}>
            {text.length}/{MAX_TEXT_LENGTH}
          </Txt>
          {loading ? (
            <WorkingPanel title={t("Interpretando lo que has comido…")} hint={t("Suele tardar unos segundos.")} onCancel={request.cancel} />
          ) : (
            <Button onPress={analyze} full>
              {t("Analizar")}
            </Button>
          )}
        </View>
      </Card>

      {notice ? <Notice tone="warning">{notice}</Notice> : null}

      {request.state.status === "error" ? (
        <RequestError error={request.state.error} onRetry={analyze}>
          <Button size="sm" variant="secondary" onPress={manual}>
            {t("Añadirla a mano")}
          </Button>
        </RequestError>
      ) : null}
    </Screen>
  );
}
