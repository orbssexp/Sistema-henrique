import { buildDays, isSlotPast } from "@/lib/slots";
import { getBookings, getBlockedSlots, type Booking } from "@/lib/db";
import { longDate, timeLabel } from "@/lib/format";
import { CancelButton } from "@/components/CancelButton";
import { BlockToggle } from "@/components/BlockToggle";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const now = new Date();
  const days = buildDays(now);

  if (days.length === 0) {
    return <div className="empty">Nenhuma data de monitoria nas próximas semanas.</div>;
  }

  const from = days[0].iso;
  const to = days[days.length - 1].iso;

  let bookings, blocks;
  try {
    [bookings, blocks] = await Promise.all([getBookings(from, to), getBlockedSlots(from, to)]);
  } catch {
    return <LoadError />;
  }

  const bySlot = new Map<string, Booking>(
    bookings.map((b) => [`${b.slot_date}_${b.slot_hour}`, b])
  );
  const blockedSet = new Set(blocks.map((b) => `${b.slot_date}_${b.slot_hour}`));
  const total = bookings.length;

  return (
    <>
      <header className="panel-header">
        <div className="kicker">Agenda</div>
        <h1>Próximas monitorias</h1>
        <p>
          {total === 0
            ? "Nenhuma reserva nas próximas semanas."
            : `${total} ${total === 1 ? "reserva" : "reservas"} nas próximas semanas.`}
        </p>
      </header>

      {days.map((day) => (
        <section className="day-card" key={day.iso}>
          <h3>{longDate(day.iso)}</h3>

          {day.slots.map((slot) => {
            const booking = bySlot.get(slot.id);
            const blocked = blockedSet.has(slot.id);
            const past = isSlotPast(day.iso, slot.hour, now);

            return (
              <div className="slot-row" key={slot.id}>
                <div className="hour">{timeLabel(slot.hour)}</div>

                {/* Aqui tudo aparece: é o ponto do app que justifica o login. */}
                <div className="detail">
                  {booking ? (
                    <>
                      <strong>{booking.student_name}</strong> · {booking.grade}
                      <br />
                      {booking.subject} — {booking.topic ?? "resolução de questões"}
                    </>
                  ) : blocked ? (
                    "Horário fechado por você"
                  ) : past ? (
                    "Encerrado"
                  ) : (
                    "Livre"
                  )}
                </div>

                <div className="row-actions">
                  {booking && (
                    <CancelButton id={booking.id} studentName={booking.student_name} />
                  )}
                  {!booking && !past && (
                    <BlockToggle iso={day.iso} hour={slot.hour} blocked={blocked} />
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
