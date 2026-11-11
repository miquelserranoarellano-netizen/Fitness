/**
 * Reparto de macronutrientes editable. Se elige en porcentajes de las calorías (de 5 en 5) y los gramos
 * salen de ahí, así que siempre cuadran con las calorías: proteína y carbohidratos 4 kcal/g, grasa 9 kcal/g.
 */

export type MacroSplit = { protein: number; carbs: number; fat: number };

/** Límites de cada macronutriente, en % de las calorías. Fuera de ahí no es una dieta razonable. */
export const SPLIT_LIMITS: Record<keyof MacroSplit, [number, number]> = {
  protein: [10, 45],
  carbs: [5, 65],
  fat: [15, 60],
};

export const CALORIE_MAX = 6000;

const round5 = (value: number) => Math.round(value / 5) * 5;

/** Reparto aproximado (de 5 en 5, suma 100) de unos gramos ya fijados. */
export function splitFromGrams(calories: number, grams: { proteinG: number; carbsG: number; fatG: number }): MacroSplit {
  if (calories <= 0) return { protein: 30, carbs: 40, fat: 30 };
  const protein = round5(((grams.proteinG * 4) / calories) * 100);
  const fat = round5(((grams.fatG * 9) / calories) * 100);
  return { protein, fat, carbs: 100 - protein - fat };
}

/** Gramos de cada macronutriente para unas calorías y un reparto. */
export function gramsFromSplit(calories: number, split: MacroSplit): { proteinG: number; carbsG: number; fatG: number } {
  return {
    proteinG: Math.round((calories * split.protein) / 100 / 4),
    carbsG: Math.round((calories * split.carbs) / 100 / 4),
    fatG: Math.round((calories * split.fat) / 100 / 9),
  };
}

/** Comprueba un objetivo puesto a mano. Devuelve el problema o null. */
export function checkManualTarget(calories: number, split: MacroSplit, floor: number): string | null {
  if (!Number.isInteger(calories) || calories < floor) return `El mínimo de seguridad es ${floor} kcal al día.`;
  if (calories > CALORIE_MAX) return `Como mucho ${CALORIE_MAX} kcal al día.`;
  if (split.protein + split.carbs + split.fat !== 100) return "El reparto tiene que sumar el 100 %.";
  for (const key of Object.keys(SPLIT_LIMITS) as (keyof MacroSplit)[]) {
    const [min, max] = SPLIT_LIMITS[key];
    if (split[key] < min || split[key] > max) return "Algún macronutriente queda fuera de un reparto razonable.";
  }
  return null;
}
