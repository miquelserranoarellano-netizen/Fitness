import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Segmented } from "@/components/form";
import { Card, Stat, StatRow, Txt } from "@/components/ui";
import { getCalorieCalendar, firstMealDate, type CalendarDay } from "@/data/nutrition-day";
import { useQuery } from "@/data/provider";
import { GOOD_RANGE } from "@/domain/nutrition/intake";
import { WEEKDAY_LABEL } from "@/domain/types";
import { AddMealButtons, MealThumb } from "@/features/meals/components";
import { t } from "@/i18n";
import { listFoodEntries } from "@/integrations/nutrition/store";
import { addDays, addMonths, formatDate, formatMonth, formatShortDate, formatTime, isoWeekday, monthEnd, monthStart, relativeDay, weekStart } from "@/lib/dates";
import { formatNumber } from "@/lib/units";
import { radius, space, tabular, useColors } from "@/theme";

type Period = "day" | "week" | "month" | "all";

function range(period: Period, anchor: string): [string, string] {
  if (period === "week") return [weekStart(anchor), addDays(weekStart(anchor), 6)];
  if (period === "month") return [monthStart(anchor), monthEnd(anchor)];
  return [anchor, anchor];
}

function step(period: Period, anchor: string, direction: 1 | -1): string {
  if (period === "week") return addDays(anchor, 7 * direction);
  if (period === "month") return addMonths(anchor, direction);
  return addDays(anchor, direction);
}

/**
 * Calendario de calorías: un día (con sus comidas), una semana, un mes o todo. Cada día sale en verde si
 * se cumplió (entre el 90 % y el 105 % del objetivo de ese día) y en rojo si no. Tocar un día lo abre.
 */
export function CalorieCalendar({ today }: { today: string }) {
  const colors = useColors();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("day");
  const [anchor, setAnchor] = useState(today);

  const query = useQuery(
    async (db) => {
      const first = await firstMealDate(db);
      const [from, to] = period === "all" ? [first && first < today ? first : today, today] : range(period, anchor);
      const calendar = await getCalorieCalendar(db, from, to, today);
      const entries = period === "day" ? await listFoodEntries(db, anchor) : [];
      return { ...calendar, entries, from, to, first };
    },
    [period, anchor, today],
  );

  const open = (date: string) => {
    setAnchor(date);
    setPeriod("day");
  };
  const canNext = range(period, anchor)[1] < today;

  const label =
    period === "day"
      ? relativeDay(anchor, today)
      : period === "week"
        ? `${formatShortDate(range("week", anchor)[0])} – ${formatShortDate(range("week", anchor)[1])}`
        : period === "month"
          ? formatMonth(anchor)
          : query.data?.first
            ? t("Desde el {fecha}", { fecha: formatDate(query.data.first) })
            : t("Todavía sin comidas");

  return (
    <Card>
      <Txt variant="h2" style={{ marginBottom: space.md }}>
        {t("Tus calorías")}
      </Txt>
      <Segmented
        options={[
          { value: "day" as const, label: t("Día") },
          { value: "week" as const, label: t("Semana") },
          { value: "month" as const, label: t("Mes") },
          { value: "all" as const, label: t("Todo") },
        ]}
        value={period}
        onChange={(value) => {
          setPeriod(value);
          setAnchor(today);
        }}
      />

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: space.md, marginBottom: space.md }}>
        {period === "all" ? null : (
          <NavButton direction="prev" onPress={() => setAnchor(step(period, anchor, -1))} />
        )}
        <Txt style={{ flex: 1, textAlign: "center", fontWeight: "600" }}>{label}</Txt>
        {period === "all" ? null : <NavButton direction="next" disabled={!canNext} onPress={() => setAnchor(step(period, anchor, 1))} />}
      </View>

      {!query.data ? (
        <ActivityIndicator color={colors.accentFg} />
      ) : period === "day" ? (
        <DayView day={query.data.days[0]} entries={query.data.entries} isToday={anchor === today} onOpenMeal={(id) => router.push({ pathname: "/comida/[id]", params: { id } })} />
      ) : (
        <View style={{ gap: space.lg }}>
          {period === "all" ? null : <DayGrid days={query.data.days} today={today} padStart={period === "month"} onOpen={open} />}
          <StatRow>
            <Stat label={t("Días cumplidos")} value={query.data.summary.good} />
            <Stat label={t("No cumplidos")} value={query.data.summary.bad} />
            <Stat label={t("Media de lo comido")} value={query.data.summary.averageCalories === null ? "—" : formatNumber(query.data.summary.averageCalories, 0)} unit={query.data.summary.averageCalories === null ? undefined : "kcal"} hint={t("En {n} días con comidas", { n: query.data.summary.logged })} />
          </StatRow>
          <Legend />
        </View>
      )}
    </Card>
  );
}

function NavButton({ direction, onPress, disabled }: { direction: "prev" | "next"; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={disabled ? undefined : onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={direction === "prev" ? t("Anterior") : t("Siguiente")} accessibilityState={{ disabled }} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
      <Icon size={20} color={disabled ? colors.subtle : colors.fg} />
    </Pressable>
  );
}

/** Semana o mes: un círculo por día, verde si se cumplió y rojo si no. */
function DayGrid({ days, today, padStart, onOpen }: { days: CalendarDay[]; today: string; padStart: boolean; onOpen: (date: string) => void }) {
  const colors = useColors();
  const blanks = padStart && days[0] ? isoWeekday(days[0].date) - 1 : 0;
  const cells: (CalendarDay | null)[] = [...Array.from({ length: blanks }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAY_LABEL.map((weekday) => (
          <Txt key={weekday} variant="tiny" style={{ flex: 1, textAlign: "center", fontWeight: "600" }}>
            {t(weekday).charAt(0)}
          </Txt>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: "row" }}>
          {cells.slice(row * 7, row * 7 + 7).map((day, index) => {
            if (!day) return <View key={`blank-${index}`} style={{ flex: 1 }} />;
            const fill = day.status === "good" ? colors.tone.positive : day.status === "bad" ? colors.tone.danger : "transparent";
            const future = day.date > today;
            return (
              <Pressable
                key={day.date}
                onPress={future ? undefined : () => onOpen(day.date)}
                accessibilityRole="button"
                accessibilityLabel={`${formatDate(day.date)}: ${day.status === "good" ? t("cumplido") : day.status === "bad" ? t("no cumplido") : t("sin valorar")}`}
                style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: fill,
                    borderWidth: day.date === today ? 2 : fill === "transparent" ? 1 : 0,
                    borderColor: day.date === today ? colors.accentFg : colors.line,
                  }}
                >
                  <Txt style={[{ fontSize: 14, fontWeight: "600", color: fill === "transparent" ? (future ? colors.subtle : colors.fg) : colors.bg }, tabular]}>{Number(day.date.slice(8))}</Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Legend() {
  const colors = useColors();
  const dot = (color: string) => <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {dot(colors.tone.positive)}
        <Txt variant="tiny">{t("Cumplido: entre el {min} % y el {max} % del objetivo", { min: Math.round(GOOD_RANGE.min * 100), max: Math.round(GOOD_RANGE.max * 100) })}</Txt>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {dot(colors.tone.danger)}
        <Txt variant="tiny">{t("No cumplido: fuera de ese margen o sin registrar")}</Txt>
      </View>
    </View>
  );
}

/** Un día: lo comido frente al objetivo y sus comidas. */
function DayView({
  day,
  entries,
  isToday,
  onOpenMeal,
}: {
  day: CalendarDay | undefined;
  entries: Awaited<ReturnType<typeof listFoodEntries>>;
  isToday: boolean;
  onOpenMeal: (id: string) => void;
}) {
  const colors = useColors();
  const tone = day?.status === "good" ? colors.tone.positive : day?.status === "bad" ? colors.tone.danger : colors.muted;
  return (
    <View style={{ gap: space.md }}>
      {day && day.goal !== null ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.raised }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tone }} />
          <Txt style={[{ flex: 1, fontWeight: "600" }, tabular]}>
            {t("{comido} de {objetivo} kcal", { comido: formatNumber(day.calories, 0), objetivo: formatNumber(day.goal, 0) })}
          </Txt>
          <Txt variant="small" style={{ color: tone, fontWeight: "600" }}>
            {day.status === "good" ? t("Cumplido") : day.status === "bad" ? t("No cumplido") : isToday ? t("En curso") : ""}
          </Txt>
        </View>
      ) : null}
      {entries.length > 0 ? (
        <View>
          {entries.map((entry) => (
            <Pressable
              key={entry.id}
              onPress={() => onOpenMeal(entry.id)}
              accessibilityRole="button"
              accessibilityLabel={t("Corregir {comida}", { comida: entry.name })}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line, opacity: pressed ? 0.7 : 1 })}
            >
              <MealThumb uri={entry.photoUri} size={40} />
              <View style={{ flex: 1 }}>
                <Txt variant="small" style={{ color: colors.fg }} numberOfLines={1}>
                  {entry.name}
                </Txt>
                <Txt variant="tiny" style={tabular}>
                  {formatTime(entry.eatenAt)}
                </Txt>
              </View>
              <Txt variant="small" style={tabular}>
                {formatNumber(entry.calories, 0)} kcal
              </Txt>
              <ChevronRight size={16} color={colors.subtle} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Txt variant="small">{isToday ? t("Aún no has registrado nada hoy. Usa el botón de la cámara de abajo para hacer una foto del plato.") : t("Este día no tiene comidas registradas.")}</Txt>
      )}
      {isToday ? <AddMealButtons /> : null}
    </View>
  );
}
