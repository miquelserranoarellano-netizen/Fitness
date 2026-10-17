import { useLocalSearchParams, useRouter } from "expo-router";
import { UtensilsCrossed } from "lucide-react-native";
import { useState } from "react";
import { Loading, Screen } from "@/components/screen";
import { Button, EmptyState } from "@/components/ui";
import { findFavorite } from "@/data/favorites";
import { useQuery } from "@/data/provider";
import { draftFromEntry } from "@/features/meals/draft";
import { MealEditor } from "@/features/meals/MealEditor";
import { t } from "@/i18n";
import { getFoodEntry } from "@/integrations/nutrition/store";

/** Corregir o borrar una comida guardada. */
export default function EditMeal() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Al borrar, la consulta se repite y ya no la encuentra: se recuerda para no enseñar «no existe».
  const [leaving, setLeaving] = useState(false);
  const query = useQuery(
    async (db) => {
      const entry = await getFoodEntry(db, id);
      if (!entry) return null;
      const favorite = await findFavorite(db, entry.name, entry.calories);
      return { entry, favoriteId: favorite?.id ?? null };
    },
    [id],
  );

  if (query.data === undefined || leaving) return <Loading error={query.error} onRetry={query.reload} />;
  if (query.data === null) {
    return (
      <Screen>
        <EmptyState icon={UtensilsCrossed} title={t("Esta comida ya no existe")} action={<Button onPress={() => router.back()}>{t("Volver")}</Button>} />
      </Screen>
    );
  }

  const { entry, favoriteId } = query.data;
  const done = () => {
    setLeaving(true);
    router.back();
  };
  return (
    <MealEditor
      key={entry.id}
      initial={draftFromEntry(entry)}
      existing={{ id: entry.id, date: entry.date, eatenAt: entry.eatenAt }}
      initialFavoriteId={favoriteId}
      onSaved={done}
      onDeleted={done}
    />
  );
}
