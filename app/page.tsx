import { buildDays, isSlotPast } from "@/lib/slots";
import { getBookings, getBlockedSlots } from "@/lib/db";
import { Scheduler } from "@/components/Scheduler";
import type { DayView, SlotStatus } from "@/components/DayTabs";

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

  const view: DayView[] = days.map((day) => ({
    iso: day.iso,
    slots: day.slots.map((slot) => ({
      id: slot.id,
      hour: slot.hour,
      status: statusOf(day.iso, slot.id, slot.hour),
    })),
  }));

  return (
    <div className="wrap">
      <header>
        <div className="kicker">Monitoria</div>
        <h1>Agende seu horário</h1>
        <p>Terças e quintas · aulas de 1h, das 14h às 19h</p>
      </header>

      {dbError && (
        <div className="status-banner show" role="alert">
          Não consegui carregar os horários agora. Recarregue a página em alguns instantes.
        </div>
      )}

      <Scheduler days={view} />

      <footer>Escolha um horário livre para reservar.</footer>
    </div>
  );
}
