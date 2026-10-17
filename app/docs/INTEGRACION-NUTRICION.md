# Nutrición en la app combinada

Con la fusión, la parte de comidas de SnapCal forma parte de esta app. Este documento explica cómo se
guardan las comidas y qué parte del código hace cada cosa. El plan completo está en `../../fusion/PLAN-FUSION.md`.

## Quién hace qué

| Pieza | Qué hace |
| --- | --- |
| `src/domain/nutrition/targets.ts` | Calcula **cuánto** comer (kcal y macros), con los mínimos de seguridad y los repartos bajo en hidratos y cetogénico de SnapCal. Única fuente del objetivo |
| `src/domain/nutrition/intake.ts` | Suma lo comido: totales de una comida a partir de sus alimentos, totales por día, estado del día (cumplido o fallado), racha, calorías sobrantes y resumen semanal |
| `src/integrations/nutrition/` | Guarda, lee, corrige y borra las comidas (`food_entries` y `food_entry_items`) |
| `src/data/favorites.ts`, `daily.ts`, `settings.ts` | Favoritas, agua y pasos de cada día, y ajustes (objetivos de pasos y agua, calorías sobrantes, recordatorios) |
| `src/data/meal-photos.ts` | Fotos de las comidas en la carpeta privada de la app (se borran con la comida) |
| `server/` (fase 4) | Reconoce los alimentos de una foto o un texto con Claude y busca sus cifras en USDA y Open Food Facts |

## El contrato: una comida

Toda comida se guarda con `saveFoodEntries(db, source, [comida])` y se valida con Zod en
`src/integrations/nutrition/contract.ts`:

```ts
{
  externalId?: string;        // opcional: si falta, se crea uno. Reenviar el mismo no duplica
  eatenAt: string;            // instante ISO 8601 con zona horaria
  date?: string;              // "AAAA-MM-DD"; si falta, el día local de eatenAt
  name: string;               // "Arroz con pollo"
  calories: number;           // kcal
  proteinG?, carbsG?, fatG?: number | null;
  fiberG?, sugarG?: number | null;    // solo si la base de datos los trae
  sodiumMg?: number | null;
  caloriesMin?, caloriesMax?: number | null;   // margen de la estimación
  notes?: string | null;
  photoUri?: string | null;   // copia local de la foto (meal-photos.ts)
  items?: Array<{             // los alimentos de la comida
    name: string; grams: number; calories: number;
    proteinG?, carbsG?, fatG?, fiberG?, sugarG?, sodiumMg?: number | null;
    dataSource?: "usda" | "off" | "ai" | "manual";
    matchedName?: string | null;   // con qué alimento de la base de datos coincidió
    confidence?: number | null;    // seguridad de la IA (0-1)
  }>;
}
```

`source` dice cómo se registró: `foto`, `texto`, `codigo`, `favorita` o `manual` (o el id de otra app, si
algún día se conecta una). `saveFoodEntries` devuelve el id de cada comida guardada.

- **Corregir:** `updateFoodEntry(db, id, comida)` (mismo formato, sin `externalId`).
- **Borrar:** `deleteMeal(db, id)` en `src/data/meal-photos.ts` (borra también la foto si ya nadie la usa).
- **Leer:** `getFoodEntry` (con sus alimentos), `listFoodEntries` (un día), `listFoodEntriesBetween`,
  `listRecentMeals` y `getDayIntake` (lo comido en un día, sumado).

Los totales de una comida no se escriben a mano: salen de `mealTotals(alimentos)` y, al cambiar los gramos
de un alimento, de `scaleItem(alimentoOriginal, gramos)` (`src/domain/nutrition/intake.ts`).

## Pendiente (fases siguientes)

- Pantallas de foto, texto, código de barras, resultado y favoritas (fase 5), e Inicio y Nutrición con los
  datos reales (fase 6).
- Usar lo comido en la revisión semanal, en el ajuste de calorías y en el análisis, y el objetivo según el
  día de entreno (fase 8).
- Agua, pasos y recordatorios en pantalla, e importar datos (fase 9).
