"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WeekGrid } from "./WeekGrid";
import { BookingModal } from "./BookingModal";
import { monthRangeLabel } from "@/lib/format";
import type { NowView, SlotView, WeekView } from "./types";

export function Scheduler({ weeks, now }: { weeks: WeekView[]; now: NowView }) {
  const router = useRouter();

  // Abre na semana que contém hoje; se hoje não tem monitoria, na primeira.
  const todayIndex = weeks.findIndex((w) => w.days.some((d) => d.iso === now.iso));
  const [index, setIndex] = useState(todayIndex >= 0 ? todayIndex : 0);
  const [picked, setPicked] = useState<{ dayIso: string; slot: SlotView } | null>(null);

  if (weeks.length === 0) {
    return <div className="empty">Nenhuma data de monitoria nas próximas semanas.</div>;
  }

  const week = weeks[Math.min(index, weeks.length - 1)];
  const isToday = todayIndex >= 0 && index === todayIndex;

  return (
    <>
      <div className="wg-nav">
        <button
          type="button"
          className="btn-mini"
          onClick={() => setIndex(todayIndex >= 0 ? todayIndex : 0)}
          disabled={isToday}
        >
          Hoje
        </button>

        <button
          type="button"
          className="wg-arrow"
          onClick={() => setIndex((i) => i - 1)}
          disabled={index === 0}
          aria-label="Semana anterior"
        >
          ‹
        </button>
        <button
          type="button"
          className="wg-arrow"
          onClick={() => setIndex((i) => i + 1)}
          disabled={index >= weeks.length - 1}
          aria-label="Próxima semana"
        >
          ›
        </button>

        <span className="wg-month">{monthRangeLabel(week.days.map((d) => d.iso))}</span>
      </div>

      <WeekGrid
        week={week}
        now={now}
        onPick={(dayIso, slot) => setPicked({ dayIso, slot })}
      />

      {picked && (
        <BookingModal
          dayIso={picked.dayIso}
          slot={picked.slot}
          onClose={() => {
            setPicked(null);
            // Busca a grade nova: outros alunos podem ter reservado enquanto isso.
            router.refresh();
          }}
        />
      )}
    </>
  );
}
