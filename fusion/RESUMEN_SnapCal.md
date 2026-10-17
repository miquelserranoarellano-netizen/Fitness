# SnapCal — resumen técnico para fusionar con otra app

## 1. Qué es
App móvil (iPhone + Android) de **control de calorías y nutrición**. Se hace una foto al plato, la IA (Claude, visión) identifica los alimentos y estima porciones, y el servidor calcula calorías y macros con bases de datos reales (USDA y Open Food Facts). Idiomas: ES / EN / FR / DE. Tema claro / oscuro.

## 2. Stack
- **App:** Expo SDK 57, React Native 0.86, React 19, TypeScript, expo-router 57 (rutas por archivos). Probada en iPhone con Expo Go.
- **Almacenamiento:** AsyncStorage (todo local en el móvil, sin cuentas ni base de datos remota).
- **Servidor:** Node + Express, SDK de Anthropic (modelo `claude-sonnet-5-5`), límite de 20 peticiones/min, cabecera `x-app-token`.
- **Pagos:** RevenueCat (7 días de prueba, 4,99 €/mes o 24,99 €/año). Sin configurar usa paquetes demo.
- **Sin librerías de gráficos:** gráficas hechas con `View` y la API `Animated`; iconos Ionicons.
- Instalar con `npm install … --legacy-peer-deps`.

## 3. Estructura de carpetas (`snapcal/`)
```
app/                      ← proyecto Expo
  app/                    ← pantallas (expo-router)
    _layout.tsx           ← proveedor + Stack + splash + recordatorios
    onboarding.tsx        ← cuestionario inicial (~30 pasos)
    (tabs)/index.tsx      ← Diario (anillo de calorías, macros, comidas, agua, pasos, peso)
    (tabs)/progress.tsx   ← Progreso (gráficas, racha, resumen semanal)
    (tabs)/settings.tsx   ← Ajustes (plan, macros, recordatorios, exportar, idioma, tema)
    scan.tsx, result.tsx  ← foto → análisis → editar y guardar
    describe.tsx          ← añadir comida escribiendo texto
    barcode.tsx           ← código de barras
    saved.tsx             ← comidas favoritas
    plan.tsx              ← objetivo y plan
    paywall.tsx           ← suscripción
  components/             ← CalorieRing, WeightChart, WeekStrip, MealRow, AddSheet, ConfirmSheet…
    ob/                   ← piezas del cuestionario (blocks, Gift, GiftBox, Anim, AppMock, PaceSlider, Charts, Loading, Result, Save…)
  lib/                    ← lógica (ver §4)
server/                   ← index.js, nutrition.js, test.mjs, .env
```

## 4. Módulos de lógica (`app/lib/`)
| Archivo | Para qué sirve |
|---|---|
| `types.ts` | Tipos: `Settings`, `Profile`, `MealEntry`, `FoodItem`, `WeightEntry`, `OnboardingAnswers`… |
| `storage.ts` | Claves AsyncStorage: meals, settings, water, weights, steps, favorites. `loadSettings` (con `ONBOARDING_VERSION`), `saveWeight`, favoritos, `clearAll` |
| `plan.ts` | Cálculo del plan: Mifflin-St Jeor, factor de actividad, ritmo semanal (7700 kcal/kg), tope 25 % del gasto, mínimos 1500/1200/1350 kcal, proteína 2,0/1,6/1,8 g/kg, grasa ≥0,8 g/kg y ≥25 %, carbohidratos el resto; dietas keto/low-carb |
| `onboarding.ts` | Fecha de nacimiento, ritmo (0,2–2,0 lb/sem), zonas lento/recomendado/rápido, fecha objetivo, curva de peso |
| `stats.ts` | Totales por día, estado del día, racha, objetivos de macros, calorías sobrantes (rollover, máx. 200) |
| `weekly.ts` | Consejos y resumen semanal |
| `reminders.ts` | Notificaciones locales (comidas y agua) |
| `export.ts` | Exportar datos |
| `units.ts` | kg/lb, ml/fl oz según idioma |
| `steps.ts` | Contador de pasos (expo-sensors) |
| `access.ts`, `purchases.ts` | Acceso premium / RevenueCat |
| `api.ts` | Cliente del servidor: `analyzePhoto`, `analyzeText`, `lookupBarcode` |
| `i18n.ts` | ~408 claves en 4 idiomas, tipadas |
| `theme.ts`, `app-context.tsx` | Colores, `useApp()` (settings, t, lang, colors), `ColorsOverride` y paleta `whiteColors` |

## 5. Funcionalidades hechas
- Foto del plato, descripción por texto y código de barras, con fibra / azúcar / sodio cuando la base de datos los tiene.
- Diario por días con anillo de calorías, macros, agua, pasos y peso; tira semanal; favoritos.
- Plan personalizado (calorías y macros calculados, editables).
- Progreso: gráfica de peso, racha, resumen semanal con consejos.
- Recordatorios, exportar datos, calorías sobrantes al día siguiente.
- Cuestionario inicial estilo Cal AI, en blanco: regalo animado con descuento real, bienvenida, preguntas (sexo, entrenos, edad, altura, peso, objetivo, ritmo con 🦥🐇🐆, dietas…), generación del plan, guardado.
- Suscripción con prueba gratuita de 7 días.

## 6. Datos que ya guarda (útiles para unir con una app de gimnasio)
- `Profile`: objetivo, sexo, edad / fecha de nacimiento, altura (cm), actividad (1–5), ritmo, peso objetivo, dieta.
- `WeightEntry`: fecha + kg (historial de peso en kg).
- `Settings.calorieGoal`, `macroGoals`, `stepGoal`, idioma, tema.
- Comidas: calorías, proteína, carbohidratos, grasa, fibra, azúcar, sodio.
- **No existe todavía:** medidas corporales (pecho, cintura, brazo…), entrenamientos, ejercicios, series, repeticiones, cuentas de usuario ni nube.

## 7. Ideas para combinarla con la app de entrenamiento
1. Compartir **perfil y peso** (una sola fuente de verdad) y añadir las **medidas corporales** de la otra app junto a `WeightEntry`.
2. Sumar las **calorías quemadas** de cada entrenamiento al objetivo del día (ya existe la opción "añadir calorías quemadas" en el cuestionario, sin conectar a nada real).
3. Ajustar el plan según los días de entreno (más proteína y calorías en días de fuerza).
4. Una pestaña nueva "Entreno" en `(tabs)/` y un tipo `Workout` en `types.ts` con su clave en `storage.ts`.
5. Si ambas apps usan Expo/React Native, copiar sus pantallas a `app/app/` y sus datos a `lib/`; si no, hay que decidir si una se reescribe a la otra.

## 8. Pendiente / límites conocidos
- Sin cuentas reales (los botones de Apple/Google/email son solo interfaz): haría falta un backend.
- Apple Health necesita una compilación nativa; el widget también.
- El servidor corre en el PC (`apiUrl` = IP local): para publicar hay que alojarlo online y cambiar `APP_TOKEN`.
- Traducciones FR/DE sin revisión nativa.
- Cambiar los enlaces de Términos y Privacidad (`components/ob/Save.tsx` y Ajustes) antes de publicar.
- Las estadísticas de marketing del cuestionario son ilustrativas (marcadas como tales).

## 9. Arrancar
- Servidor: `cd server && node index.js` (necesita `.env` con `ANTHROPIC_API_KEY`, `APP_TOKEN`, claves USDA).
- App: `cd app && npx expo start -c`; en `app.json` → `extra.apiUrl` (ej. `http://192.168.0.218:3000`) y `extra.appToken` iguales al `.env`.
