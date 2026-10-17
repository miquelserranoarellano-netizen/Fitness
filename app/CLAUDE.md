# Appcombinada · app

App combinada de Smart Fitness Coach (Miquel) y SnapCal (Marc), hecha con Expo (SDK 57, Expo Router, Expo Go). Parte
de la app de Miquel; la fusión sigue `../fusion/PLAN-FUSION.md` (fases y decisiones) y `../fusion/PROMPT-FUSION-APPS.md`.
Las apps originales están en `../originales/`: son solo de consulta, no se modifican. Lee también `AGENTS.md` (Expo
cambia en cada SDK: consulta la documentación de la v57 antes de usar una API) y `docs/ESTADO.md`.

- **Solo módulos incluidos en Expo Go.** Antes de añadir una dependencia, `npx expo install <paquete>` y comprueba
  que Expo Go la incluye; si no, la app dejaría de abrirse en Expo Go.
- **Dos mundos separados**: `src/domain/` son cálculos puros con pruebas; un número nunca sale de la interfaz ni de
  una IA. `src/domain/` viene de la web de Miquel (`smart-fitness-coach`); lo útil de SnapCal (`lib/plan.ts`,
  `stats.ts`, `weekly.ts`) se pasa aquí como funciones puras con pruebas, sin duplicar cálculos.
- **Datos locales.** SQLite (`src/db/`). Un usuario por teléfono: sin `user_id`. Fechas `AAAA-MM-DD`, instantes ISO,
  JSON en texto, booleanos 0/1. Una migración aplicada no se edita: se añade otra en `src/db/migrations.ts`.
  Dentro de `db.transaction(tx => …)` usa solo `tx`.
- **Pantallas.** Leen con `useQuery` y escriben con `useMutation` (`src/data/provider.tsx`), que refresca todo tras
  cada escritura. Las operaciones de varias tablas van en `src/data/services.ts` y validan su entrada.
- **Tema claro (por defecto) y oscuro.** Los colores salen siempre de `useColors()` (`src/theme.ts`); nunca un color
  fijo en una pantalla. Claro: fondo blanco, tarjetas gris cálido y acento verde bosque; oscuro: acento lima. Texto,
  iconos y trazos de acento con `accentFg`; el relleno de acento (`accent`) siempre con texto `accentInk`. Si añades un color, defínelo en las dos paletas y comprueba su contraste (4,5:1 en texto).
- **Idiomas (ES, EN, FR, DE).** Todo texto visible pasa por `t()` / `tn()` de `src/i18n`: el español es la clave
  (`t("Guardar peso")`, `t("Unas {kcal} kcal", { kcal })`, `tn(n, "{n} serie", "{n} series")`). Fuera de un
  componente se marca con `msg()` y se traduce al mostrarlo. No partas frases en trozos si se puede evitar.
  Fechas y números con `src/lib/dates.ts` y `formatNumber`, que siguen el idioma activo. Pendiente para la fase 10:
  los textos que forma el motor (`src/domain/`), la capa de datos y las validaciones, y el catálogo de ejercicios.
- **Nutrición.** Se completa con SnapCal en las fases del plan. Las comidas entran por `saveFoodEntries`
  (`src/integrations/nutrition/`, ver `docs/INTEGRACION-NUTRICION.md`); sus totales salen de `mealTotals` y
  `scaleItem` (`src/domain/nutrition/intake.ts`), nunca de la pantalla. Borrar una comida con `deleteMeal`
  (borra también su foto). El objetivo de kcal y macros sale solo de `src/domain/nutrition/targets.ts`.
- **Registrar comidas.** Pantallas en `src/app/comida/` (foto, texto, código, favoritas → `nueva`; corregir en
  `[id]`). Pasan un `MealDraft` (`src/features/meals/draft.ts`, funciones puras con pruebas) con `setMealDraft` y
  la revisión (`MealEditor`) guarda con `saveMeal` (`src/data/meals.ts`, en una transacción con la favorita).
  `AddMealButtons` son los botones para empezar desde cualquier pantalla.
- **Servidor.** Toda petición pasa por `getApi()` (`src/lib/api-config.ts`), y las fotos se preparan antes con
  `preparePhotoForAnalysis` (`src/lib/photo-prep.ts`). Los errores son `ApiError` con código: se enseñan con
  `apiErrorMessage` y se ofrece «Reintentar» solo si `isRetryable`. La clave de Anthropic nunca va en la app
  (ni en `EXPO_PUBLIC_*`): vive en `server/.env`.
- No construir nada que parezca funcionar sin funcionar. Salud: no diagnosticar, no recomendar entrenar con dolor,
  no dietas extremas.
- Comprobaciones: `npm run check` (tipos de app y de pruebas, lint y vitest) y `npx expo export --platform android`
  para validar el empaquetado. `npx expo-doctor` para dependencias.
- Desarrollo en WSL: el móvil solo ve el servidor con la red «mirrored» de WSL (`npm start`) o con túnel
  (`npm run tunnel`). `npx expo start --web --port 8082` sirve para revisar pantallas en el navegador (el 8081 puede
  estar ocupado por la app original). En web, SQLite es experimental y `Alert.alert` no funciona, así que los
  borrados con confirmación solo se prueban en el móvil.
