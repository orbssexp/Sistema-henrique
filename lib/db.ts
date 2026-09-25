import { neon } from "@neondatabase/serverless";

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  return neon(url);
}

export type Booking = {
  id: number;
  slot_date: string;
  slot_hour: number;
  student_name: string;
  grade: string;
  subject: string;
  topic: string | null;
  created_at: string;
};

export type BlockedSlot = { slot_date: string; slot_hour: number; reason: string | null };

/**
 * O driver devolve DATE como string "YYYY-MM-DD". Convertemos defensivamente:
 * se algum dia vier um Date, um toISOString() ingênuo poderia deslocar o dia.
 */
function toIso(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())}`;
  }
  return String(value).slice(0, 10);
}

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function mapBooking(row: Record<string, unknown>): Booking {
  return {
    id: Number(row.id),
    slot_date: toIso(row.slot_date),
    slot_hour: Number(row.slot_hour),
    student_name: String(row.student_name),
    grade: String(row.grade),
    subject: String(row.subject),
    topic: str(row.topic),
    created_at: String(row.created_at),
  };
}

/** Reservas ativas no intervalo (inclusivo). */
export async function getBookings(fromIso: string, toIsoDate: string): Promise<Booking[]> {
  const rows = await db()`
    SELECT id, slot_date, slot_hour, student_name, grade, subject, topic, created_at
    FROM bookings
    WHERE cancelled_at IS NULL AND slot_date BETWEEN ${fromIso}::date AND ${toIsoDate}::date
    ORDER BY slot_date, slot_hour
  `;
  return rows.map(mapBooking);
}

export async function getBlockedSlots(fromIso: string, toIsoDate: string): Promise<BlockedSlot[]> {
  const rows = await db()`
    SELECT slot_date, slot_hour, reason
    FROM blocked_slots
    WHERE slot_date BETWEEN ${fromIso}::date AND ${toIsoDate}::date
  `;
  return rows.map((r) => ({
    slot_date: toIso(r.slot_date),
    slot_hour: Number(r.slot_hour),
    reason: str(r.reason),
  }));
}

export type CreateResult = { ok: true } | { ok: false; reason: "taken" | "blocked" };

/**
 * Grava a reserva numa única instrução.
 *
 * O driver HTTP do Neon tem sql.transaction([...]), mas só para um lote de
 * queries decidido de antemão — não dá para ler, decidir e então gravar. Por isso
 * a checagem de bloqueio vai dentro do próprio INSERT, e não numa consulta antes.
 *
 * Zero linhas retornadas = o horário está bloqueado. Erro 23505 (unique_violation)
 * = alguém reservou primeiro. Não existe janela de corrida: quem decide é o índice
 * do banco, não a aplicação.
 */
export async function createBooking(input: {
  slotDate: string;
  slotHour: number;
  studentName: string;
  grade: string;
  subject: string;
  topic: string | null;
}): Promise<CreateResult> {
  try {
    const rows = await db()`
      INSERT INTO bookings (slot_date, slot_hour, student_name, grade, subject, topic)
      SELECT ${input.slotDate}::date, ${input.slotHour}::smallint,
             ${input.studentName}, ${input.grade}, ${input.subject}, ${input.topic}
      WHERE NOT EXISTS (
        SELECT 1 FROM blocked_slots
        WHERE slot_date = ${input.slotDate}::date
          AND slot_hour = ${input.slotHour}::smallint
      )
      RETURNING id
    `;
    if (rows.length === 0) return { ok: false, reason: "blocked" };
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "taken" };
    throw err;
  }
}

/** O driver do Neon expõe o código do Postgres em lugares diferentes por versão. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; sourceError?: { code?: unknown } };
  return e.code === "23505" || e.sourceError?.code === "23505";
}

export async function cancelBooking(id: number): Promise<void> {
  await db()`UPDATE bookings SET cancelled_at = now() WHERE id = ${id} AND cancelled_at IS NULL`;
}

export async function blockSlot(iso: string, hour: number, reason: string | null): Promise<void> {
  await db()`
    INSERT INTO blocked_slots (slot_date, slot_hour, reason)
    VALUES (${iso}::date, ${hour}::smallint, ${reason})
    ON CONFLICT (slot_date, slot_hour) DO NOTHING
  `;
}

export async function unblockSlot(iso: string, hour: number): Promise<void> {
  await db()`
    DELETE FROM blocked_slots
    WHERE slot_date = ${iso}::date AND slot_hour = ${hour}::smallint
  `;
}

/** Relatório: reservas ativas, mais recentes primeiro. */
export async function getBookingsForReport(): Promise<Booking[]> {
  const rows = await db()`
    SELECT id, slot_date, slot_hour, student_name, grade, subject, topic, created_at
    FROM bookings
    WHERE cancelled_at IS NULL
    ORDER BY slot_date DESC, slot_hour DESC
  `;
  return rows.map(mapBooking);
}

/**
 * Agrega por matéria. Como o aluno digita livre, normalizamos para que
 * "Matemática", "matematica " e "MATEMÁTICA" caiam no mesmo grupo — e mostramos
 * a grafia mais frequente na tela.
 *
 * lower(btrim(...)) sozinho NÃO basta: "matemática" e "matematica" continuariam
 * grupos diferentes por causa do acento. translate() remove os acentos sem
 * exigir a extensão unaccent, que precisaria de CREATE EXTENSION no banco.
 */
const NORMALIZE_SUBJECT =
  "translate(lower(btrim(subject)), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')";

export async function getSubjectCounts(): Promise<{ subject: string; total: number }[]> {
  const rows = await db().query(
    `SELECT mode() WITHIN GROUP (ORDER BY subject) AS subject, COUNT(*)::int AS total
     FROM bookings
     WHERE cancelled_at IS NULL
     GROUP BY ${NORMALIZE_SUBJECT}
     ORDER BY total DESC, 1`
  );
  return rows.map((r: Record<string, unknown>) => ({
    subject: String(r.subject),
    total: Number(r.total),
  }));
}

export async function getGradeCounts(): Promise<{ grade: string; total: number }[]> {
  const rows = await db()`
    SELECT grade, COUNT(*)::int AS total
    FROM bookings
    WHERE cancelled_at IS NULL
    GROUP BY grade
    ORDER BY total DESC, grade
  `;
  return rows.map((r) => ({ grade: String(r.grade), total: Number(r.total) }));
}
