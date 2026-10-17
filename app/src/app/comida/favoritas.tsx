import { useRouter } from "expo-router";
import { Plus, Star } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Loading, Screen } from "@/components/screen";
import { Button, Card, CardHeader, Divider, EmptyState, Notice, Txt } from "@/components/ui";
import { addFavorite, listFavorites, type FavoriteMeal } from "@/data/favorites";
import { deleteFavorite } from "@/data/meal-photos";
import { saveMeal } from "@/data/meals";
import { useMutation, useQuery } from "@/data/provider";
import { MealThumb } from "@/features/meals/components";
import { draftFromEntry, draftFromFavorite, draftToFavorite, setMealDraft, type MealDraft } from "@/features/meals/draft";
import { t } from "@/i18n";
import type { FoodEntry } from "@/integrations/nutrition/contract";
import { listRecentMeals } from "@/integrations/nutrition/store";
import { formatNumber } from "@/lib/units";
import { space, useColors } from "@/theme";

const sameMeal = (a: { name: string; calories: number }, b: { name: string; calories: number }) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && Math.round(a.calories) === Math.round(b.calories);

/**
 * Repetir comidas: las favoritas (con estrella) y las últimas registradas. «+» la añade a hoy tal cual;
 * tocar la fila la abre para ajustar las cantidades antes de guardarla.
 */
export default function Favorites() {
  const router = useRouter();
  const query = useQuery(async (db) => ({ favorites: await listFavorites(db), recent: await listRecentMeals(db, 20) }));
  const { run, pending } = useMutation();
  const [message, setMessage] = useState<string | null>(null);
  if (!query.data) return <Loading error={query.error} onRetry={query.reload} />;

  const { favorites, recent } = query.data;
  const favoriteOf = (meal: { name: string; calories: number }) => favorites.find((favorite) => sameMeal(favorite, meal)) ?? null;

  const adjust = (draft: MealDraft) => {
    setMealDraft(draft);
    router.push("/comida/nueva");
  };

  const addNow = async (draft: MealDraft, meal: { name: string; photoUri: string | null }, favoriteId: string | null) => {
    setMessage(null);
    const result = await run((db) =>
      saveMeal(db, draft, { name: meal.name, eatenAt: new Date().toISOString(), photoUri: meal.photoUri, favorite: favoriteId !== null, favoriteIdBefore: favoriteId }),
    );
    if (result?.ok) setMessage(t("«{comida}» añadida a hoy.", { comida: meal.name }));
    else if (result) setMessage(result.error);
  };

  const toggleStar = (entry: FoodEntry) => {
    const favorite = favoriteOf(entry);
    void run(async (db) => {
      if (favorite) await deleteFavorite(db, favorite.id);
      else await addFavorite(db, draftToFavorite(draftFromEntry(entry, true), { name: entry.name, photoUri: entry.photoUri }));
    });
  };

  if (favorites.length === 0 && recent.length === 0) {
    return (
      <Screen>
        <EmptyState icon={Star} title={t("Aún no hay comidas que repetir")}>
          {t("Las comidas que registres aparecerán aquí. Márcalas con «Guardar también en favoritas» para tenerlas siempre a mano.")}
        </EmptyState>
      </Screen>
    );
  }

  return (
    <Screen>
      {message ? <Notice tone="positive">{message}</Notice> : null}

      <Card>
        <CardHeader
          title={t("Favoritas")}
          description={favorites.length > 0 ? t("«+» la añade a hoy tal cual; tócala para cambiar las cantidades.") : t("Todavía no tienes favoritas: márcalas con la estrella en «Recientes».")}
        />
        {favorites.map((favorite, index) => (
          <MealRow
            key={favorite.id}
            first={index === 0}
            meal={favorite}
            starred
            disabled={pending}
            onOpen={() => adjust(draftFromFavorite(favorite))}
            onAdd={() => addNow(draftFromFavorite(favorite), favorite, favorite.id)}
            onStar={() => run((db) => deleteFavorite(db, favorite.id))}
          />
        ))}
      </Card>

      {recent.length > 0 ? (
        <Card>
          <CardHeader title={t("Recientes")} />
          {recent.map((entry, index) => (
            <MealRow
              key={entry.id}
              first={index === 0}
              meal={entry}
              starred={favoriteOf(entry) !== null}
              disabled={pending}
              onOpen={() => adjust(draftFromEntry(entry, true))}
              onAdd={() => addNow(draftFromEntry(entry, true), entry, null)}
              onStar={() => toggleStar(entry)}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function MealRow({
  meal,
  starred,
  first,
  disabled,
  onOpen,
  onAdd,
  onStar,
}: {
  meal: FavoriteMeal | FoodEntry;
  starred: boolean;
  first: boolean;
  disabled: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onStar: () => void;
}) {
  const colors = useColors();
  return (
    <View>
      {first ? null : <Divider />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm }}>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={t("Ajustar {comida}", { comida: meal.name })} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.md }}>
          <MealThumb uri={meal.photoUri} />
          <View style={{ flex: 1 }}>
            <Txt numberOfLines={2}>{meal.name}</Txt>
            <Txt variant="tiny" num>
              {formatNumber(meal.calories, 0)} kcal{meal.proteinG !== null ? ` · ${t("{n} g de proteína", { n: formatNumber(meal.proteinG, 0) })}` : ""}
            </Txt>
          </View>
        </Pressable>
        <Pressable
          onPress={onStar}
          disabled={disabled}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ selected: starred }}
          accessibilityLabel={starred ? t("Quitar de favoritas") : t("Guardar en favoritas")}
          style={{ padding: 6 }}
        >
          <Star size={20} color={starred ? colors.warning : colors.subtle} fill={starred ? colors.warning : "transparent"} />
        </Pressable>
        <Button size="sm" icon={Plus} onPress={onAdd} disabled={disabled} accessibilityLabel={t("Añadir {comida} a hoy", { comida: meal.name })} />
      </View>
    </View>
  );
}
