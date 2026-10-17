import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { Txt } from "@/components/ui";
import { MEASURES } from "@/domain/types";
import { t } from "@/i18n";
import { useColors } from "@/theme";

/** Altura (en el dibujo) y extremos de la cinta para cada perímetro (mismo esquema que la web). */
const MARKS: Record<(typeof MEASURES)[number], { y: number; x1: number; x2: number; labelX: number }> = {
  neck: { y: 60, x1: 88, x2: 112, labelX: 124 },
  shoulders: { y: 80, x1: 44, x2: 156, labelX: 168 },
  chest: { y: 104, x1: 62, x2: 138, labelX: 150 },
  waist: { y: 158, x1: 72, x2: 128, labelX: 140 },
  hips: { y: 196, x1: 66, x2: 134, labelX: 146 },
  arm_relaxed: { y: 116, x1: 34, x2: 56, labelX: 20 },
  arm_flexed: { y: 130, x1: 32, x2: 54, labelX: 18 },
  forearm: { y: 164, x1: 24, x2: 44, labelX: 10 },
  wrist: { y: 196, x1: 20, x2: 36, labelX: 6 },
  thigh: { y: 246, x1: 70, x2: 98, labelX: 56 },
  calf: { y: 308, x1: 70, x2: 94, labelX: 56 },
};

/** Esquema de dónde colocar la cinta. Los números coinciden con los de la lista de medidas. */
export function MeasureGuide() {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Svg width={200} height={300} viewBox="0 0 200 360">
        <G fill="none" stroke={colors.figure} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round">
          <Circle cx={100} cy={32} r={19} />
          <Path d="M92 50v14M108 50v14" />
          <Path d="M92 64 60 76c-4 26 4 56 14 82-6 14-8 26-8 40h68c0-14-2-26-8-40 10-26 18-56 14-82L108 64" />
          <Path d="M60 76c-12 4-18 14-20 30l-8 52-6 44" />
          <Path d="M62 112c-4 18-8 36-12 52l-12 40" />
          <Path d="M140 76c12 4 18 14 20 30l8 52 6 44" />
          <Path d="M138 112c4 18 8 36 12 52l12 40" />
          <Path d="M66 198c0 40 4 76 6 104l-2 44" />
          <Path d="M100 206c0 36-4 68-6 96l-2 44" />
          <Path d="M134 198c0 40-4 76-6 104l2 44" />
          <Path d="M100 206c0 36 4 68 6 96l2 44" />
        </G>
        {MEASURES.map((measure, index) => {
          const mark = MARKS[measure];
          return (
            <G key={measure}>
              <Line x1={mark.x1} x2={mark.x2} y1={mark.y} y2={mark.y} stroke={colors.accentFg} strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" />
              <Circle cx={mark.labelX} cy={mark.y} r={8} fill={colors.raised} stroke={colors.figureMark} />
              <SvgText x={mark.labelX} y={mark.y + 3.2} textAnchor="middle" fontSize={9} fontWeight="600" fill={colors.fg}>
                {index + 1}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <Txt variant="tiny" style={{ textAlign: "center" }}>
        {t("Cinta siempre horizontal, ajustada sin apretar. Mide por la mañana, en frío (sin haber entrenado) y siempre el mismo lado del cuerpo.")}
      </Txt>
    </View>
  );
}
