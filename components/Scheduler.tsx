"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DayTabs, type DayView, type SlotView } from "./DayTabs";
import { SlotGrid } from "./SlotGrid";
import { BookingModal } from "./BookingModal";

/** Todo o estado de cliente da página do aluno vive aqui. */
export function Scheduler({ days }: { days: DayView[] }) {
  const router = useRouter();
  const [activeIso, setActiveIso] = useState(days[0]?.iso ?? "");
  const [picked, setPicked] = useState<SlotView | null>(null);

  const activeDay = days.find((d) => d.iso === activeIso) ?? days[0];

  if (!activeDay) {
    return <div className="empty">Nenhuma data de monitoria nas próximas semanas.</div>;
  }

  return (
    <>
      <DayTabs days={days} activeIso={activeDay.iso} onSelect={setActiveIso} />
      <SlotGrid slots={activeDay.slots} onPick={setPicked} />
      {picked && (
        <BookingModal
          dayIso={activeDay.iso}
          slot={picked}
          onClose={() => {
            setPicked(null);
            // Busca a grade nova do servidor: outros alunos podem ter reservado.
            router.refresh();
          }}
        />
      )}
    </>
  );
}
