import { Layers } from "lucide-react-native";
import { View } from "react-native";
import { t } from "@/i18n";
import { askOtherTabToYield } from "@/lib/database-turn";
import { space, useColors } from "@/theme";
import { Button, Txt } from "./ui";

/**
 * En la web, cuando los datos están abiertos en otra pestaña (ver `lib/database-turn.ts`): qué pasa y cómo seguir.
 * Mientras se espera (`failed` falso), en cuanto la otra pestaña se cierra esta se abre sola.
 */
export function DatabaseBusy({ failed }: { failed?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, justifyContent: "center", alignItems: "center" }}>
      <View style={{ width: "100%", maxWidth: 440, gap: space.md, alignItems: "center" }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Layers size={26} color={colors.accentFg} />
        </View>
        <Txt variant="h1" style={{ textAlign: "center" }}>
          {failed ? t("No se han podido abrir tus datos") : t("IKYNDO está abierta en otra pestaña")}
        </Txt>
        <Txt variant="muted" style={{ textAlign: "center" }}>
          {failed
            ? t("Otra pestaña de IKYNDO los tiene abiertos. Ciérrala (en Safari, desde el botón de pestañas) y recarga esta página. Tus datos no se han perdido.")
            : t("Tus datos solo pueden estar abiertos en una pestaña a la vez. Pulsa «Usar aquí» para pasarlos a esta, o cierra la otra pestaña: en cuanto se cierre, esta se abrirá sola.")}
        </Txt>
        <View style={{ alignSelf: "stretch", gap: space.sm, marginTop: space.sm }}>
          {failed ? (
            <Button size="lg" full onPress={() => window.location.reload()}>
              {t("Recargar")}
            </Button>
          ) : (
            <Button size="lg" full onPress={askOtherTabToYield}>
              {t("Usar aquí")}
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}
