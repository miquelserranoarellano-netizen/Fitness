import { WEEKDAY_LABEL } from "@/domain/types";
import { addDays, daysBetween, isoWeekday, relativeDay, weekStart } from "@/lib/dates";
import type { Insights } from "./insights";

/**
 * Tareas pendientes y recomendación del día. Reglas explícitas sobre los datos del usuario:
 * cada mensaje indica en qué se basa. No interviene ninguna IA. (Igual que en la web, con las rutas
 * de la app.)
 */

export type Task = { id: "weigh_in" | "measurements" | "weekly_review" | "block_review"; title: string; detail: string; href: string; cta: string };

/** Semana que toca revisar: la actual si es domingo; si no, la anterior. */
export function reviewWeek(today: string): string {
  return isoWeekday(today) === 7 ? weekStart(today) : addDays(weekStart(today), -7);
}

/** Igual que `reviewWeek`, salvo que el plan empezara después de esa semana: entonces se revisa la actual. */
export function reviewWeekFor(today: string, planStartedOn: string | null | undefined): string {
  const week = reviewWeek(today);
  return planStartedOn && planStartedOn > addDays(week, 6) ? weekStart(today) : week;
}

export function dueTasks(insights: Insights): Task[] {
  const { today, profile, weights, measurements, checkins, training } = insights;
  if (!profile.remindersEnabled) return [];
  const tasks: Task[] = [];

  const lastWeight = weights[weights.length - 1];
  const weighedThisWeek = lastWeight !== undefined && lastWeight.date >= weekStart(today);
  if (!lastWeight || daysBetween(lastWeight.date, today) >= 7 || (!weighedThisWeek && isoWeekday(today) >= profile.weighInWeekday)) {
    tasks.push({
      id: "weigh_in",
      title: "Toca pesarte",
      detail: lastWeight
        ? `Tu última pesada es de ${relativeDay(lastWeight.date, today)}. Tu día fijado es el ${WEEKDAY_LABEL[profile.weighInWeekday - 1]!.toLowerCase()}.`
        : "Aún no has registrado tu peso.",
      href: "/cuerpo",
      cta: "Registrar peso",
    });
  }

  const lastMeasurement = measurements[measurements.length - 1];
  if (!lastMeasurement) {
    tasks.push({
      id: "measurements",
      title: "Añade tus medidas corporales",
      detail: "Sin ellas no se puede saber qué zonas crecen. Puedes empezar solo con las que sepas.",
      href: "/cuerpo",
      cta: "Añadir medidas",
    });
  } else if (daysBetween(lastMeasurement.date, today) >= 28) {
    tasks.push({
      id: "measurements",
      title: "Toca actualizar tus medidas",
      detail: `La última medición es de ${relativeDay(lastMeasurement.date, today)}. Se repiten una vez al mes.`,
      href: "/cuerpo",
      cta: "Medirme",
    });
  }

  const block = training.block;
  if (block) {
    const week = reviewWeek(today);
    const reviewed = checkins.some((checkin) => checkin.weekStart === week);
    // Solo se pide la revisión de una semana en la que el plan ya estaba en marcha.
    if (!reviewed && block.startedOn <= addDays(week, 6) && daysBetween(block.startedOn, today) >= 5) {
      tasks.push({
        id: "weekly_review",
        title: "Revisión semanal pendiente",
        detail: "Unas preguntas rápidas para valorar la semana y decidir si hay que ajustar algo.",
        href: "/revisiones/semanal",
        cta: "Hacer la revisión",
      });
    }
    if (training.week > block.weeksPlanned) {
      tasks.push({
        id: "block_review",
        title: `Has terminado el bloque ${block.number}`,
        detail: "Evalúa los resultados y genera el siguiente bloque a partir de lo registrado.",
        href: "/revisiones",
        cta: "Evaluar el bloque",
      });
    }
  }
  return tasks;
}

export type CoachTip = { title: string; body: string; basis: string[]; href?: string; cta?: string };

/** La recomendación más relevante ahora mismo, elegida por orden de prioridad. */
export function coachTip(insights: Insights): CoachTip {
  const { training, today, logs, calorieDecision, findings, trend, profile } = insights;

  if (training.openSession) {
    return {
      title: "Tienes un entrenamiento a medias",
      body: `Dejaste abierta la sesión «${training.openSession.name}». Termínala o descártala para que el siguiente entrenamiento se registre bien.`,
      basis: ["Sesión en curso sin terminar."],
      href: `/sesion/${training.openSession.id}`,
      cta: "Continuar",
    };
  }

  const recentPain = logs.filter((log) => log.discomfort >= 2 && daysBetween(log.date, today) <= 10);
  if (recentPain.length > 0) {
    return {
      title: "Cuida esa molestia antes de exigirte más",
      body: "En tus últimas sesiones anotaste molestias moderadas o dolor. En esos ejercicios la carga no subirá y verás alternativas. No entrenes a través del dolor: si persiste o empeora, consulta a un profesional sanitario.",
      basis: [`${recentPain.length} ${recentPain.length === 1 ? "ejercicio con molestia anotada" : "ejercicios con molestias anotadas"} en los últimos 10 días.`],
      href: "/historial",
      cta: "Ver sesiones",
    };
  }

  if (training.sessions.length === 0 && training.nextDay) {
    return {
      title: "Empieza por tu primera sesión",
      body: "Hoy el objetivo no es rendir, sino encontrar tus cargas de referencia: elige pesos con los que termines cada serie dejando un par de repeticiones en reserva. Lo que registres será la base de todas las sugerencias.",
      basis: ["Aún no hay ninguna sesión registrada."],
      href: "/entrenamiento",
      cta: `Empezar ${training.nextDay.name}`,
    };
  }

  if (insights.poorRecovery) {
    return {
      title: "Esta semana, prioriza recuperar",
      body: "En tu última revisión indicaste sueño o energía bajos. Mantén las cargas sin forzar subidas y procura dormir más: el músculo se construye al recuperarte, no solo al entrenar.",
      basis: ["Sueño o energía bajos en la última revisión semanal."],
    };
  }

  if (calorieDecision.action === "increase" || calorieDecision.action === "decrease") {
    return { title: calorieDecision.title, body: calorieDecision.reason, basis: ["Tendencia de peso de las últimas semanas."], href: "/nutricion", cta: "Ver nutrición" };
  }

  if (insights.adherence !== null && insights.adherence < 0.7) {
    return {
      title: "La constancia es ahora lo que más te hará avanzar",
      body: `En las últimas semanas has completado el ${Math.round(insights.adherence * 100)} % de las sesiones previstas. Si ${profile.daysPerWeek} días no encajan en tu semana, redúcelos en el perfil: una rutina más corta que se cumple da mejores resultados.`,
      basis: ["Sesiones completadas frente a las previstas en las últimas 4 semanas."],
      href: "/perfil",
      cta: "Ajustar días",
    };
  }

  const confirmed = findings.find((finding) => finding.kind === "confirmed");
  if (confirmed) {
    return { title: confirmed.title, body: confirmed.proposal, basis: confirmed.evidence.slice(0, 2), href: "/analisis", cta: "Ver el análisis" };
  }

  if (trend.status === "insufficient" && training.sessions.length > 0) {
    return {
      title: "Sigue registrando: aún es pronto para ajustar",
      body: `${trend.needed} Hasta entonces, mantén tus calorías actuales y céntrate en cumplir las sesiones.`,
      basis: [`${insights.weights.length} ${insights.weights.length === 1 ? "pesada registrada" : "pesadas registradas"}.`],
    };
  }

  if (training.nextDay) {
    return {
      title: `Siguiente sesión: ${training.nextDay.name}`,
      body: "Vas por buen camino. En cada ejercicio encontrarás la carga sugerida según lo que hiciste la última vez: intenta sumar una repetición donde te lo indique, sin sacrificar la técnica.",
      basis: ["Sin problemas detectados en tus registros recientes."],
      href: "/entrenamiento",
      cta: "Ver la rutina",
    };
  }

  return { title: "Todo en orden", body: "No hay nada pendiente ahora mismo.", basis: [] };
}
