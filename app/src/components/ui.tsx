import { Check, ChevronDown, ChevronRight, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { font, radius, space, tabular, useColors, type Palette, type Tone } from "@/theme";

/* ───────────────────────────── Texto ───────────────────────────── */

type TxtVariant = "title" | "h1" | "h2" | "body" | "muted" | "small" | "subtle" | "tiny" | "label";

const txtStyle = (variant: TxtVariant, colors: Palette): TextStyle => {
  switch (variant) {
    case "title":
      return { fontSize: font.title, fontWeight: "600", color: colors.fg, letterSpacing: -0.5, lineHeight: 34 };
    case "h1":
      return { fontSize: font.h1, fontWeight: "600", color: colors.fg, letterSpacing: -0.3, lineHeight: 28 };
    case "h2":
      return { fontSize: font.h2, fontWeight: "600", color: colors.fg, letterSpacing: -0.2, lineHeight: 24 };
    case "body":
      return { fontSize: font.body, color: colors.fg, lineHeight: 22 };
    case "muted":
      return { fontSize: font.body, color: colors.muted, lineHeight: 22 };
    case "small":
      return { fontSize: font.small, color: colors.muted, lineHeight: 19 };
    case "subtle":
      return { fontSize: font.small, color: colors.subtle, lineHeight: 19 };
    case "tiny":
      return { fontSize: font.tiny, color: colors.subtle, lineHeight: 15 };
    case "label":
      return { fontSize: font.small, fontWeight: "500", color: colors.fg, lineHeight: 19 };
  }
};

export function Txt({
  variant = "body",
  style,
  children,
  numberOfLines,
  num,
}: {
  variant?: TxtVariant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  /** Cifras tabulares. */
  num?: boolean;
}) {
  const colors = useColors();
  return (
    <Text style={[txtStyle(variant, colors), num && tabular, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/** Lista con viñetas discretas. */
export function Bullets({ items, color, textVariant = "small" }: { items: string[]; color?: string; textVariant?: TxtVariant }) {
  const colors = useColors();
  return (
    <View style={{ gap: space.sm }}>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color ?? colors.subtle, marginTop: 8 }} />
          <Txt variant={textVariant} style={{ flex: 1 }}>
            {item}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/* ───────────────────────────── Tarjetas ───────────────────────────── */

export function Card({ children, style, highlight }: { children: ReactNode; style?: StyleProp<ViewStyle>; highlight?: boolean }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, highlight && { borderColor: colors.accentLine }, style]}>{children}</View>;
}

export function CardHeader({ title, eyebrow, description, action }: { title: string; eyebrow?: string; description?: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.md }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <Txt variant="tiny" style={{ textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "500", marginBottom: 2 }}>
            {eyebrow}
          </Txt>
        ) : null}
        <Txt variant="h2">{title}</Txt>
        {description ? (
          <Txt variant="small" style={{ marginTop: 4 }}>
            {description}
          </Txt>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function Stat({ label, value, unit, hint }: { label: string; value: ReactNode; unit?: string; hint?: string }) {
  return (
    <View style={{ minWidth: 120 }}>
      <Txt variant="tiny" style={{ fontWeight: "500" }}>
        {label}
      </Txt>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 4 }}>
        {typeof value === "string" || typeof value === "number" ? (
          <Txt variant="h1" num>
            {value}
          </Txt>
        ) : (
          value
        )}
        {unit ? (
          <Txt variant="small" num>
            {unit}
          </Txt>
        ) : null}
      </View>
      {hint ? (
        <Txt variant="tiny" style={{ marginTop: 2 }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.xl, rowGap: space.lg }}>{children}</View>;
}

/** Fila de lista que navega a otra pantalla. */
export function LinkRow({
  title,
  subtitle,
  onPress,
  right,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  right?: ReactNode;
  icon?: LucideIcon;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.raised }]} accessibilityRole="button">
      {Icon ? <Icon size={18} color={colors.muted} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="body" numberOfLines={2}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="tiny" style={{ marginTop: 2 }} num>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      <ChevronRight size={16} color={colors.subtle} />
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong }, style]} />;
}

/* ───────────────────────────── Botones ───────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  icon: Icon,
  style,
  full,
  accessibilityLabel,
}: {
  children?: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const palette = {
    primary: { bg: colors.accent, fg: colors.accentInk, border: colors.accentBorder },
    secondary: { bg: colors.raised, fg: colors.fg, border: colors.lineStrong },
    ghost: { bg: "transparent", fg: colors.accentFg, border: "transparent" },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerLine },
  }[variant];
  const height = size === "sm" ? 36 : size === "lg" ? 52 : 44;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [
        {
          height,
          paddingHorizontal: size === "sm" ? 12 : 16,
          borderRadius: radius.md,
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={palette.fg} /> : Icon ? <Icon size={size === "sm" ? 16 : 18} color={palette.fg} /> : null}
      {typeof children === "string" ? (
        <Text style={{ color: palette.fg, fontSize: size === "sm" ? 14 : 15, fontWeight: "600", flexShrink: 1 }} numberOfLines={2}>
          {children}
        </Text>
      ) : (
        children ?? null
      )}
    </Pressable>
  );
}

/* ───────────────────────────── Avisos ───────────────────────────── */

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const colors = useColors();
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: colors.toneBg[tone], borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 3 }}>
      <Text style={{ color: colors.tone[tone], fontSize: 12, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

export function Notice({ tone = "neutral", title, children, style }: { tone?: Tone; title?: string; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: colors.toneBg[tone],
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: tone === "neutral" ? colors.line : colors.toneBg[tone],
          padding: space.md,
          gap: 4,
        },
        style,
      ]}
    >
      {title ? <Txt style={{ fontWeight: "600", color: tone === "neutral" ? colors.fg : colors.tone[tone] }}>{title}</Txt> : null}
      {typeof children === "string" ? <Txt variant="small">{children}</Txt> : children}
    </View>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xl, gap: space.sm }}>
      {Icon ? (
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" }}>
          <Icon size={22} color={colors.muted} />
        </View>
      ) : null}
      <Txt variant="h2" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {children ? (
        <Txt variant="small" style={{ textAlign: "center", maxWidth: 320 }}>
          {children}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

export function ProgressBar({ value, tone = "accent", style }: { value: number; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: "hidden" }, style]}>
      <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: colors.tone[tone] }} />
    </View>
  );
}

export function ProgressRing({ value, size = 84, stroke = 8, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const colors = useColors();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.ringTrack} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accentFg}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

/** Indicador redondo con un número o una marca de completado. */
export function StepDot({ done, label }: { done: boolean; label: string | number }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: done ? colors.accent : colors.raised,
      }}
    >
      {done ? <Check size={16} color={colors.accentInk} strokeWidth={3} /> : <Txt variant="tiny" num style={{ color: colors.muted, fontWeight: "600" }}>{label}</Txt>}
    </View>
  );
}

/* ───────────────────────────── Plegables ───────────────────────────── */

/** Equivalente a `<details>`: un título que despliega su contenido. */
export function Collapsible({
  title,
  subtitle,
  children,
  defaultOpen = false,
  tone,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: "danger";
}) {
  const colors = useColors();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <Pressable onPress={() => setOpen((value) => !value)} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <Txt variant="label" style={tone === "danger" ? { color: colors.danger } : undefined}>
            {title}
          </Txt>
          {subtitle ? <Txt variant="tiny">{subtitle}</Txt> : null}
        </View>
        <ChevronDown size={16} color={colors.subtle} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      {open ? <View style={{ paddingTop: space.sm }}>{children}</View> : null}
    </View>
  );
}

/** Par etiqueta-valor en una fila. */
export function Row({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }}>
      <Txt variant="small" style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt variant="small" num style={{ color: colors.fg, textAlign: "right", flexShrink: 1 }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    marginHorizontal: -space.sm,
    borderRadius: radius.sm,
  },
});
