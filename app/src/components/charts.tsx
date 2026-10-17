import { useMemo, useState } from "react";
import { View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { t } from "@/i18n";
import { daysBetween, formatDate, formatShortDate } from "@/lib/dates";
import { formatNumber } from "@/lib/units";
import { space, useColors } from "@/theme";
import { Txt } from "./ui";

/* ───────────────────────────── Escalas ───────────────────────────── */

/** Marcas «redondas» para un eje numérico que cubren [min, max]. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.02 || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(Number(value.toFixed(6)));
  return ticks;
}

function tickDigits(ticks: number[]): number {
  const step = ticks.length > 1 ? Math.abs((ticks[1] ?? 0) - (ticks[0] ?? 0)) : 1;
  if (step >= 1) return 0;
  return Math.min(2, Math.ceil(-Math.log10(step)));
}

function spreadIndexes(length: number, count: number): number[] {
  if (length <= count) return Array.from({ length }, (_, index) => index);
  const out = new Set<number>();
  for (let i = 0; i < count; i++) out.add(Math.round((i * (length - 1)) / (count - 1)));
  return [...out];
}

/* ───────────────────────────── Línea temporal ───────────────────────────── */

export type ChartPoint = { date: string; value: number };
export type ChartSeries = { id: string; label: string; points: ChartPoint[]; mark: "line" | "dots" };

const MARGIN = { top: 14, right: 12, bottom: 24, left: 38 };

/**
 * Evolución en el tiempo: una línea principal y, opcionalmente, las mediciones sueltas en segundo
 * plano. Tocar o arrastrar sobre el gráfico muestra los valores de esa fecha.
 */
export function LineChart({ series, unit, height = 200, digits = 1 }: { series: ChartSeries[]; unit: string; height?: number; digits?: number }) {
  const colors = useColors();
  const seriesColor = { line: colors.viz1, dots: colors.vizMuted } as const;
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const model = useMemo(() => {
    const dates = [...new Set(series.flatMap((s) => s.points.map((point) => point.date)))].sort();
    const values = series.flatMap((s) => s.points.map((point) => point.value));
    if (dates.length === 0 || values.length === 0) return null;
    const first = dates[0]!;
    const span = Math.max(1, daysBetween(first, dates[dates.length - 1]!));
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    return { dates, first, span, ticks, yMin: ticks[0]!, yMax: ticks[ticks.length - 1]! };
  }, [series]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));
  if (!model) return <View style={{ height }} onLayout={onLayout} />;

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const x = (date: string) => MARGIN.left + (model.dates.length === 1 ? innerWidth / 2 : (daysBetween(model.first, date) / model.span) * innerWidth);
  const y = (value: number) => MARGIN.top + innerHeight - ((value - model.yMin) / (model.yMax - model.yMin)) * innerHeight;
  const yDigits = Math.max(tickDigits(model.ticks), 0);
  const xLabels = spreadIndexes(model.dates.length, width < 360 ? 3 : 4);
  const activeDate = active === null ? null : (model.dates[active] ?? null);

  const select = (event: GestureResponderEvent) => {
    const pointer = event.nativeEvent.locationX;
    let nearest = 0;
    let best = Infinity;
    model.dates.forEach((date, index) => {
      const distance = Math.abs(x(date) - pointer);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setActive(nearest);
  };

  return (
    <View>
      {series.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, marginBottom: space.sm }}>
          {series.map((s) => (
            <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={s.mark === "line" ? { width: 14, height: 2, borderRadius: 1, backgroundColor: seriesColor.line } : { width: 8, height: 8, borderRadius: 4, backgroundColor: seriesColor.dots }} />
              <Txt variant="tiny">{s.label}</Txt>
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={{ height }}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={select}
        onResponderMove={select}
        onResponderRelease={() => undefined}
        onResponderTerminationRequest={() => true}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {model.ticks.map((tick) => (
              <Line key={`g${tick}`} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke={colors.vizGrid} strokeWidth={1} />
            ))}
            {model.ticks.map((tick) => (
              <SvgText key={`t${tick}`} x={MARGIN.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={10} fill={colors.subtle}>
                {formatNumber(tick, yDigits, yDigits)}
              </SvgText>
            ))}
            {xLabels.map((index) => {
              const date = model.dates[index]!;
              const anchor = index === 0 && model.dates.length > 1 ? "start" : index === model.dates.length - 1 && model.dates.length > 1 ? "end" : "middle";
              return (
                <SvgText key={`x${date}`} x={x(date)} y={height - 6} textAnchor={anchor} fontSize={10} fill={colors.subtle}>
                  {formatShortDate(date)}
                </SvgText>
              );
            })}

            {activeDate ? <Line x1={x(activeDate)} x2={x(activeDate)} y1={MARGIN.top} y2={MARGIN.top + innerHeight} stroke={colors.vizAxis} strokeWidth={1} /> : null}

            {series.map((s) => {
              if (s.mark === "dots") {
                return s.points.map((point) => <Circle key={`${s.id}${point.date}`} cx={x(point.date)} cy={y(point.value)} r={3} fill={seriesColor.dots} />);
              }
              const path = s.points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`).join("");
              const first = s.points[0];
              const last = s.points[s.points.length - 1];
              return (
                <G key={s.id}>
                  {first && last && s.points.length > 1 ? (
                    <Path
                      d={`${path}L${x(last.date).toFixed(1)},${MARGIN.top + innerHeight}L${x(first.date).toFixed(1)},${MARGIN.top + innerHeight}Z`}
                      fill={seriesColor.line}
                      opacity={0.1}
                    />
                  ) : null}
                  <Path d={path} fill="none" stroke={seriesColor.line} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {last ? <Circle cx={x(last.date)} cy={y(last.value)} r={4.5} fill={seriesColor.line} stroke={colors.surface} strokeWidth={2} /> : null}
                </G>
              );
            })}

            {activeDate
              ? series.map((s) => {
                  const point = s.points.find((candidate) => candidate.date === activeDate);
                  return point ? <Circle key={`a${s.id}`} cx={x(point.date)} cy={y(point.value)} r={5} fill={seriesColor[s.mark]} stroke={colors.surface} strokeWidth={2} /> : null;
                })
              : null}
          </Svg>
        ) : null}
      </View>

      <View style={{ minHeight: 36, marginTop: space.xs, justifyContent: "center" }}>
        {activeDate ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: space.md }}>
            <Txt variant="tiny">{formatDate(activeDate)}</Txt>
            {series.map((s) => {
              const point = s.points.find((candidate) => candidate.date === activeDate);
              if (!point) return null;
              return (
                <Txt key={s.id} variant="label" num>
                  {formatNumber(point.value, digits)} {unit}
                  {series.length > 1 ? <Txt variant="tiny"> {s.label.toLowerCase()}</Txt> : null}
                </Txt>
              );
            })}
          </View>
        ) : (
          <Txt variant="tiny">{t("Toca el gráfico para ver los valores de cada fecha.")}</Txt>
        )}
      </View>
    </View>
  );
}

/** Minigráfico de tendencia, sin ejes, con el último punto destacado. */
export function Sparkline({ values, width = 84, height = 30 }: { values: number[]; width?: number; height?: number }) {
  const colors = useColors();
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 5;
  const px = (index: number) => pad + (index / (values.length - 1)) * (width - pad * 2);
  const py = (value: number) => (max === min ? height / 2 : pad + (1 - (value - min) / (max - min)) * (height - pad * 2));
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"}${px(index).toFixed(1)},${py(value).toFixed(1)}`).join("");
  const last = values.length - 1;
  return (
    <Svg width={width} height={height}>
      <Path d={path} fill="none" stroke={colors.vizMuted} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={px(last)} cy={py(values[last]!)} r={4} fill={colors.viz1} stroke={colors.surface} strokeWidth={2} />
    </Svg>
  );
}

/* ───────────────────────────── Barras ───────────────────────────── */

export type RangeBarItem = { id: string; label: string; value: number; min: number; max: number; tag?: string };

/** Barras horizontales con su rango objetivo: la banda tenue marca el intervalo recomendado. */
export function RangeBars({ items, unit }: { items: RangeBarItem[]; unit: string }) {
  const colors = useColors();
  const top = Math.max(1, ...items.flatMap((item) => [item.value, item.max])) * 1.08;
  const pct = (value: number) => Math.min(100, (value / top) * 100);
  return (
    <View style={{ gap: space.md }}>
      {items.map((item) => (
        <View key={item.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.sm }}>
            <Txt variant="small" style={{ color: colors.fg }} numberOfLines={1}>
              {item.label}
              {item.tag ? <Txt variant="tiny"> {item.tag}</Txt> : null}
            </Txt>
            <Txt variant="tiny" num>
              <Txt variant="label" num>
                {formatNumber(item.value, 1)}
              </Txt>{" "}
              / {item.min}-{item.max} {unit}
            </Txt>
          </View>
          <View style={{ height: 10, justifyContent: "center" }}>
            <View style={{ position: "absolute", left: 0, right: 0, height: 10, borderRadius: 5, backgroundColor: colors.trackFaint }} />
            <View
              style={{
                position: "absolute",
                left: `${pct(item.min)}%`,
                width: `${Math.max(0, pct(item.max) - pct(item.min))}%`,
                height: 16,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: colors.vizAxis,
                backgroundColor: colors.vizBand,
                borderRadius: 2,
              }}
            />
            <View style={{ position: "absolute", left: 0, width: `${pct(item.value)}%`, height: 10, borderTopRightRadius: 5, borderBottomRightRadius: 5, backgroundColor: colors.viz1 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export type ColumnItem = { id: string; label: string; value: number; highlight?: boolean };

/** Columnas con el valor encima y, opcionalmente, una línea de objetivo. */
export function Columns({ items, target, targetLabel, height = 140 }: { items: ColumnItem[]; target?: number; targetLabel?: string; height?: number }) {
  const colors = useColors();
  const top = Math.max(1, target ?? 0, ...items.map((item) => item.value));
  const plot = height - 44;
  return (
    <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
      {target !== undefined ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 22 + (target / top) * plot, borderTopWidth: 1, borderColor: colors.vizAxis }}>
          {targetLabel ? (
            <Txt variant="tiny" style={{ position: "absolute", right: 0, top: -16 }}>
              {targetLabel}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {items.map((item) => (
        <View key={item.id} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          <Txt variant="tiny" num style={{ color: colors.fg, fontWeight: "500", marginBottom: 2 }}>
            {formatNumber(item.value, 1)}
          </Txt>
          <View
            style={{
              width: "70%",
              maxWidth: 24,
              height: Math.max(item.value > 0 ? 3 : 1, (item.value / top) * plot),
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              backgroundColor: item.highlight ? colors.viz1 : colors.vizMuted,
            }}
          />
          <Txt variant="tiny" numberOfLines={1} style={{ marginTop: 4, height: 16 }}>
            {item.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}
