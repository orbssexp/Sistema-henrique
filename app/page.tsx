import { buildDays, groupIntoWeeks, isSlotPast, nowInSaoPaulo } from "@/lib/slots";
import { getBookings, getBlockedSlots } from "@/lib/db";
import { Scheduler } from "@/components/Scheduler";
import type { NowView, SlotStatus, WeekView } from "@/components/types";

// Sempre dados frescos: a grade muda conforme outros alunos reservam.
export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const days = buildDays(now);

  let taken = new Set<string>();
  let blocked = new Set<string>();
  let dbError = false;

  if (days.length > 0) {
    const from = days[0].iso;
    const to = days[days.length - 1].iso;
    try {
      const [bookings, blocks] = await Promise.all([
        getBookings(from, to),
        getBlockedSlots(from, to),
      ]);
      taken = new Set(bookings.map((b) => `${b.slot_date}_${b.slot_hour}`));
      blocked = new Set(blocks.map((b) => `${b.slot_date}_${b.slot_hour}`));
    } catch {
      // Sem banco, mostramos tudo como indisponível em vez de aceitar reservas
      // que não seriam gravadas.
      dbError = true;
    }
  }

  function statusOf(iso: string, slotId: string, hour: number): SlotStatus {
    if (dbError) return "blocked";
    if (isSlotPast(iso, hour, now)) return "past";
    if (taken.has(slotId)) return "taken";
    if (blocked.has(slotId)) return "blocked";
    return "free";
  }

  const weeks: WeekView[] = groupIntoWeeks(days).map((week) => ({
    startIso: week.startIso,
    days: week.days.map((day) => ({
      iso: day.iso,
      slots: day.slots.map((slot) => ({
        id: slot.id,
        hour: slot.hour,
        status: statusOf(day.iso, slot.id, slot.hour),
      })),
    })),
  }));

  // O "agora" vem do servidor, no fuso de São Paulo: o relógio do navegador do
  // aluno pode estar em outro fuso, e usá-lo causaria divergência na hidratação.
  const nowView: NowView = nowInSaoPaulo(now);

  return (
    <div className="wrap">
      <header>
        <div className="kicker">Monitoria</div>
        <h1>Agende seu horário</h1>
        <ul className="facts">
          <li>Terças e quintas</li>
          <li>Aulas de 1 hora</li>
          <li>Das 14h às 19h</li>
        </ul>
      </header>

      {dbError && (
        <div className="status-banner show" role="alert">
          Não consegui carregar os horários agora. Recarregue a página em alguns instantes.
        </div>
      )}

      <Scheduler weeks={weeks} now={nowView} />

      <footer>Toque num horário livre para reservar.</footer>
    </div>
  );
}
