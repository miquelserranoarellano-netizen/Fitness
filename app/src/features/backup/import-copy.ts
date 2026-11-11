import { router } from "expo-router";
import { importAllData, MAX_IMPORT_BYTES, parseExport, type ParsedExport } from "@/data/import";
import { deleteAllMealPhotos } from "@/data/meal-photos";
import { deleteAllPhotos } from "@/data/photos";
import { useMutation } from "@/data/provider";
import { t, tn } from "@/i18n";
import { appAlert } from "@/lib/alert";
import { dateOf, formatDate } from "@/lib/dates";
import { pickJsonFile } from "@/lib/pick-file";
import { isWeb } from "@/lib/web";

/**
 * «Importar una copia»: elegir el archivo, comprobarlo, enseñar qué trae y, tras confirmar, sustituir
 * todos los datos por los de la copia (`importAllData`, todo o nada). Se usa en Perfil → Tus datos y en
 * la bienvenida, para quien ya usaba la app en la web o en otro teléfono.
 */
export function useImportCopy(onImported?: () => Promise<unknown> | void) {
  const { run, pending } = useMutation();

  const replaceWith = async (text: string) => {
    const result = await run(async (db) => {
      const imported = await importAllData(db, text);
      if (imported.ok && !isWeb) {
        // Las fotos que hubiera en el teléfono ya no pertenecen a ningún dato.
        try {
          await deleteAllPhotos(db);
          deleteAllMealPhotos();
        } catch {
          // Quedarían archivos sueltos, sin datos: no impide usar la copia.
        }
      }
      return imported;
    });
    if (!result) return;
    if (!result.ok) return appAlert(t("No se ha podido importar"), result.error);
    await onImported?.();
    router.replace("/");
    appAlert(
      t("Copia importada"),
      isWeb ? t("Tus datos ya están en este navegador.") : t("Tus datos ya están en este teléfono."),
    );
  };

  const start = async () => {
    let text: string;
    try {
      const file = await pickJsonFile();
      if (!file) return;
      if (file.size !== null && file.size > MAX_IMPORT_BYTES) {
        return appAlert(t("No se puede importar"), t("El archivo es demasiado grande para ser una copia de la app."));
      }
      text = await file.read();
    } catch (cause) {
      return appAlert(t("No se ha podido abrir el archivo"), cause instanceof Error ? cause.message : String(cause));
    }

    const parsed = parseExport(text);
    if (!parsed.ok) return appAlert(t("No se puede importar"), parsed.error);
    appAlert(t("Importar una copia"), describe(parsed.data), [
      { text: t("Cancelar"), style: "cancel" },
      { text: t("Importar y sustituir"), style: "destructive", onPress: () => void replaceWith(text) },
    ]);
  };

  return { start, pending };
}

function describe(copy: ParsedExport): string {
  const count = (table: string) => copy.counts[table] ?? 0;
  const lines = [
    copy.exportedAt
      ? t("Copia de {nombre} del {fecha}.", { nombre: copy.profileName, fecha: formatDate(dateOf(copy.exportedAt)) })
      : t("Copia de {nombre}.", { nombre: copy.profileName }),
    t("Trae {sesiones}, {comidas} y {pesos}.", {
      sesiones: tn(count("workout_sessions"), "{n} sesión de entrenamiento", "{n} sesiones de entrenamiento"),
      comidas: tn(count("food_entries"), "{n} comida", "{n} comidas"),
      pesos: tn(count("body_weights"), "{n} pesada", "{n} pesadas"),
    }),
    isWeb
      ? t("Sustituirá todo lo que hay ahora en este navegador. No se puede deshacer: si quieres conservarlo, exporta antes tus datos.")
      : t("Sustituirá todo lo que hay ahora en este teléfono, fotografías incluidas. No se puede deshacer: si quieres conservarlo, exporta antes tus datos."),
  ];
  if (copy.photosLeftOut > 0) {
    lines.push(tn(copy.photosLeftOut, "Las fotografías no van en la copia: {n} foto se queda fuera.", "Las fotografías no van en la copia: {n} fotos se quedan fuera."));
  }
  return lines.join("\n\n");
}
