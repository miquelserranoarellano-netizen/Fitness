import { Stack, useRouter } from "expo-router";
import { UtensilsCrossed } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Screen } from "@/components/screen";
import { Button, EmptyState } from "@/components/ui";
import { useFinishMealFlow } from "@/features/meals/components";
import { clearMealDraft, getMealDraft } from "@/features/meals/draft";
import { MealEditor } from "@/features/meals/MealEditor";
import { t } from "@/i18n";

/** Revisar la comida que llega de la foto, el texto, el código de barras o una favorita, o escribirla a mano. */
export default function NewMeal() {
  const router = useRouter();
  const finish = useFinishMealFlow();
  const [draft] = useState(getMealDraft);
  useEffect(() => clearMealDraft, []);

  if (!draft) {
    return (
      <Screen>
        <EmptyState icon={UtensilsCrossed} title={t("No hay ninguna comida que revisar")} action={<Button onPress={() => router.back()}>{t("Volver")}</Button>} />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: draft.source === "manual" ? t("Añadir comida") : t("Revisar comida") }} />
      <MealEditor initial={draft} initialFavoriteId={draft.favoriteId} onSaved={finish} onDiscard={() => router.back()} />
    </>
  );
}
