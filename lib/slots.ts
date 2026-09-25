import { TIMEZONE, START_HOUR, END_HOUR, WEEKDAYS, WEEKS_AHEAD } from "./constants";

export type Slot = { hour: number; id: string };
export type Day = { iso: string; slots: Slot[] };

/**
 * Converte um instante para a data de calendário e a hora vigentes em São Paulo.
 *
 * Toda decisão de data no app passa por aqui. O motivo: a Vercel roda em UTC e o
 * Brasil está em UTC-3, então usar `new Date()` direto faz o app virar o dia às
 * 21h no horário de Brasília — um bug que só aparece à noite e só em produção.
 *
 * `hourCycle: "h23"` é obrigatório: com `hour12: false` alguns runtimes devolvem
 * "24" à meia-noite, o que quebra as comparações de hora.
 */
export function nowInSaoPaulo(now: Date): { iso: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/**
 * Meio-dia UTC como âncora para aritmética de calendário.
 *
 * Somar dias a partir do meio-dia nunca cruza a fronteira do dia por causa de
 * offset ou horário de verão — a margem é de 12 horas para cada lado.
 */
function isoToAnchor(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function anchorToIso(anchor: Date): string {
  return anchor.toISOString().slice(0, 10);
}

/** Gera a grade: dias de monitoria de hoje até WEEKS_AHEAD semanas à frente. */
export function buildDays(now: Date): Day[] {
  const today = nowInSaoPaulo(now).iso;
  const cursor = isoToAnchor(today);
  const end = isoToAnchor(today);
  end.setUTCDate(end.getUTCDate() + WEEKS_AHEAD * 7);

  const days: Day[] = [];
  while (cursor <= end) {
    if (WEEKDAYS.includes(cursor.getUTCDay())) {
      const iso = anchorToIso(cursor);
      const slots: Slot[] = [];
      for (let h = START_HOUR; h < END_HOUR; h++) {
        slots.push({ hour: h, id: `${iso}_${h}` });
      }
      days.push({ iso, slots });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Um bloco deixa de ser reservável quando sua hora de início chega — entrar numa
 * aula que começou 40 minutos atrás não serve para ninguém.
 *
 * A comparação de strings funciona porque YYYY-MM-DD ordena lexicograficamente
 * igual à ordem cronológica.
 */
export function isSlotPast(iso: string, hour: number, now: Date): boolean {
  const current = nowInSaoPaulo(now);
  if (iso < current.iso) return true;
  if (iso > current.iso) return false;
  return hour <= current.hour;
}

export type Week = { startIso: string; days: Day[] };

/** Domingo da semana que contém a data, como o Google Calendar. */
function weekStartIso(iso: string): string {
  const anchor = isoToAnchor(iso);
  anchor.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay());
  return anchorToIso(anchor);
}

/**
 * Agrupa os dias de monitoria por semana, para a grade de semana.
 *
 * A primeira e a última semana podem vir incompletas: se hoje é quinta, a terça
 * daquela semana já passou e não entra na janela.
 */
export function groupIntoWeeks(days: Day[]): Week[] {
  const byWeek = new Map<string, Day[]>();
  for (const day of days) {
    const start = weekStartIso(day.iso);
    const list = byWeek.get(start);
    if (list) list.push(day);
    else byWeek.set(start, [day]);
  }
  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([startIso, weekDays]) => ({ startIso, days: weekDays }));
}
