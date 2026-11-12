import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ArrowRight, Calculator, Download, Dumbbell, Lock, ScanBarcode, TrendingUp, Utensils, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Screen } from "@/components/screen";
import { Badge, Bullets, Button, Card, Notice, Txt } from "@/components/ui";
import { t } from "@/i18n";
import { AI_ENABLED } from "@/lib/features";
import { radius, space, useColors } from "@/theme";

const LOGO = require("../../../assets/images/logo-ikyndo.jpg");
const MARK = require("../../../assets/images/icon.png");

/**
 * Presentación de IKYNDO: lo primero que ve en la web quien entra sin datos (ver `app/index.tsx`). Usa las mismas
 * piezas y colores que el resto de la app, así que sigue su tema (claro u oscuro) y su idioma. «Empezar» lleva al
 * cuestionario; quien ya tiene datos en este navegador entra directo al inicio y no la ve.
 */
export function Presentation() {
  const colors = useColors();
  const router = useRouter();
  const start = () => router.push("/bienvenida");

  return (
    <Screen tab>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Image source={MARK} style={{ width: 32, height: 32, borderRadius: radius.sm }} accessibilityIgnoresInvertColors />
        <Txt variant="h2" style={{ letterSpacing: 1 }}>
          IKYNDO
        </Txt>
      </View>

      <View style={{ alignItems: "center", paddingTop: space.md }}>
        <Image
          source={LOGO}
          contentFit="cover"
          style={{ width: 240, height: 240, borderRadius: 54, borderWidth: 1, borderColor: colors.lineStrong }}
          accessibilityLabel={t("Logotipo de IKYNDO")}
        />
      </View>

      <View style={{ gap: space.md }}>
        <Txt variant="tiny" style={{ textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "500" }}>
          {t("Entrena · Nútrete · Evoluciona")}
        </Txt>
        <Txt variant="title" style={{ fontSize: 34, lineHeight: 40 }}>
          {t("Un plan de entrenamiento y comida que se ajusta a tus datos.")}
        </Txt>
        <Txt variant="muted">
          {t("IKYNDO te prepara una rutina de hipertrofia según tus días, tu material y tus molestias, te propone las cargas de cada sesión y lleva la cuenta de tus comidas, tus calorías y tus macros.")}
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Badge tone="accent">{t("Sin cuenta ni registro")}</Badge>
          <Badge>{t("Tus datos, en tu dispositivo")}</Badge>
          <Badge>Español · English · Français · Deutsch</Badge>
        </View>
        <Button size="lg" full onPress={start}>
          <StartLabel />
        </Button>
      </View>

      <Section label={t("Qué hace IKYNDO")} title={t("Entrenamiento, alimentación y progreso, en una sola app.")}>
        <Feature
          icon={Dumbbell}
          title={t("Entrena")}
          lead={t("Una rutina hecha para ti.")}
          text={t("Respondes un cuestionario (objetivo, días, minutos por sesión, material y lesiones) y te sale una rutina de hipertrofia por bloques. En cada sesión apuntas tus series y la app te propone las cargas para la próxima vez.")}
          points={[t("66 ejercicios con consejos de técnica"), t("Si un ejercicio te molesta, lo cambias por otro que trabaja lo mismo")]}
        />
        <Feature
          icon={Utensils}
          title={t("Nútrete")}
          lead={t("Tus comidas, sin complicaciones.")}
          text={t("Busca el producto por su código de barras, repite una comida guardada o apúntala a mano: las calorías y los macros se suman solos. Tu objetivo se corrige con la tendencia real de tu peso.")}
          points={[t("Comidas favoritas para repetirlas con un toque"), t("Agua y pasos del día")]}
        />
        <Feature
          icon={TrendingUp}
          title={t("Evoluciona")}
          lead={t("Decisiones con tus datos.")}
          text={t("Registra tu peso y tus medidas y mira su evolución. Al acabar cada bloque se mantiene lo que funciona y cambia solo lo que tus datos justifican: más series donde te has estancado, otro ejercicio si algo molesta o una descarga si hay fatiga.")}
          points={[t("Resumen semanal y gráficos de evolución"), t("El siguiente bloque se adapta a lo que has hecho")]}
        />
      </Section>

      <Section label={t("Cómo funciona")} title={t("Empiezas en unos minutos.")}>
        <Step n={1} title={t("Cuéntale cómo entrenas")} text={t("Objetivo, días, material, experiencia y molestias. Son unos minutos y no hace falta cuenta.")} />
        <Step n={2} title={t("Entrena y apunta")} text={t("Sigue la sesión del día y registra tus series y tus comidas. Las cuentas las hace la app.")} />
        <Step n={3} title={t("Revisa y ajusta")} text={t("Mira cómo vas cada semana. Al acabar el bloque, el siguiente se adapta a lo que has hecho.")} />
      </Section>

      <Section label={t("Privacidad")} title={t("Tus datos se quedan contigo.")}>
        <Card style={{ paddingVertical: space.xs }}>
          <PrivacyRow icon={Lock} title={t("Sin cuentas")} text={t("No te registras ni das tu correo: lo que apuntas se guarda en tu dispositivo.")} first />
          {AI_ENABLED ? null : (
            <PrivacyRow icon={ScanBarcode} title={t("Casi nada sale de aquí")} text={t("Solo el número de los códigos de barras que busques, para encontrar el producto.")} />
          )}
          <PrivacyRow icon={Calculator} title={t("Números con reglas claras")} text={t("Las calorías, las cargas y los ajustes salen de reglas explícitas sobre tus datos.")} />
          <PrivacyRow icon={Download} title={t("Tu copia, cuando quieras")} text={t("Exporta todo en un archivo y llévatelo a otro navegador o al móvil.")} />
        </Card>
      </Section>

      <Card highlight style={{ gap: space.md, alignItems: "center" }}>
        <Txt variant="h1" style={{ textAlign: "center" }}>
          {t("¿Empezamos?")}
        </Txt>
        <Txt variant="muted" style={{ textAlign: "center" }}>
          {t("Responde el cuestionario y tendrás tu primera rutina y tu objetivo de calorías al momento.")}
        </Txt>
        <Button size="lg" full onPress={start}>
          <StartLabel />
        </Button>
      </Card>

      <View style={{ gap: space.sm }}>
        <Notice title={t("En el iPhone")}>
          {t("Añade la app a la pantalla de inicio (Compartir → Añadir a pantalla de inicio): así Safari no borra tus datos.")}
        </Notice>
        <Notice title={t("Códigos de barras")}>
          {t("Para buscar productos por su código de barras necesitas un código de acceso: pídeselo a quien te ha invitado a la prueba. Todo lo demás funciona sin él.")}
        </Notice>
      </View>

      <Txt variant="tiny" style={{ textAlign: "center" }}>
        {t("Esta aplicación no hace diagnósticos médicos. Si tienes dolor o una lesión, consulta a un profesional sanitario.")}
      </Txt>
    </Screen>
  );
}

/** Texto del botón principal con su flecha, en el color del botón. */
function StartLabel() {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Txt style={{ color: colors.accentInk, fontWeight: "600" }}>{t("Empezar")}</Txt>
      <ArrowRight size={18} color={colors.accentInk} />
    </View>
  );
}

function Section({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.md, paddingTop: space.lg }}>
      <View style={{ gap: 4 }}>
        <Txt variant="tiny" style={{ textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "500" }}>
          {label}
        </Txt>
        <Txt variant="h1">{title}</Txt>
      </View>
      {children}
    </View>
  );
}

function Feature({ icon: Icon, title, lead, text, points }: { icon: LucideIcon; title: string; lead: string; text: string; points: string[] }) {
  const colors = useColors();
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon size={22} color={colors.accentFg} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="h2">{title}</Txt>
          <Txt variant="label">{lead}</Txt>
        </View>
      </View>
      <Txt variant="small">{text}</Txt>
      <Bullets items={points} color={colors.accentFg} />
    </Card>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  const colors = useColors();
  return (
    <Card style={{ flexDirection: "row", gap: space.md }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
        <Txt style={{ color: colors.accentInk, fontWeight: "600" }} num>
          {n}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontWeight: "600" }}>{title}</Txt>
        <Txt variant="small">{text}</Txt>
      </View>
    </Card>
  );
}

function PrivacyRow({ icon: Icon, title, text, first }: { icon: LucideIcon; title: string; text: string; first?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: space.md, paddingVertical: space.md, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      <Icon size={18} color={colors.muted} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontWeight: "600" }}>{title}</Txt>
        <Txt variant="small">{text}</Txt>
      </View>
    </View>
  );
}
