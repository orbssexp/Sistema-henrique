"use client";

import { timeLabel } from "@/lib/format";
import type { SlotStatus, SlotView } from "./DayTabs";

const LABEL: Record<SlotStatus, string> = {
  free: "Disponível",
  taken: "Reservado",
  blocked: "Indisponível",
  past: "Encerrado",
};

export function SlotGrid({
  slots,
  onPick,
}: {
  slots: SlotView[];
  onPick: (slot: SlotView) => void;
}) {
  if (slots.length === 0) {
    return <div className="empty">Nenhum horário neste dia.</div>;
  }

  return (
    <div className="slots">
      {slots.map((slot) =>
        slot.status === "free" ? (
          <button key={slot.id} type="button" className="slot" onClick={() => onPick(slot)}>
            <div className="time">{timeLabel(slot.hour)}</div>
            <div className="tag">{LABEL.free}</div>
          </button>
        ) : (
          // Reservado mostra só que está ocupado. Nome, série e matéria ficam
          // apenas no painel do monitor: a página é pública, e nome de aluno
          // somado à matéria em que ele tem dificuldade é dado sensível.
          <div key={slot.id} className={`slot ${slot.status}`} aria-disabled="true">
            <div className="time">{timeLabel(slot.hour)}</div>
            <div className="tag">{LABEL[slot.status]}</div>
          </div>
        )
      )}
    </div>
  );
}
