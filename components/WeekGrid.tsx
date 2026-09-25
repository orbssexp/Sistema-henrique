"use client";

import { START_HOUR, END_HOUR } from "@/lib/constants";
import { weekdayAbbrev, dayNumber, hourLabel, timeLabel } from "@/lib/format";
import type { NowView, SlotStatus, SlotView, WeekView } from "./types";

const LABEL: Record<SlotStatus, string> = {
  free: "Livre",
  taken: "Reservado",
  blocked: "Fechado",
  past: "Encerrado",
};

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

export function WeekGrid({
  week,
  now,
  onPick,
}: {
  week: WeekView;
  now: NowView;
  onPick: (dayIso: string, slot: SlotView) => void;
}) {
  // A linha do agora só aparece na semana que contém hoje, e só dentro da faixa
  // de horários — senão ficaria pendurada fora da grade.
  const todayInWeek = week.days.some((d) => d.iso === now.iso);
  const nowOffset = now.hour - START_HOUR + now.minute / 60;
  const showNowLine = todayInWeek && nowOffset >= 0 && nowOffset <= HOURS.length;

  return (
    <div className="wg" style={{ ["--cols" as string]: week.days.length }}>
      {/* Cabeçalho: canto com o fuso, depois uma coluna por dia. */}
      <div className="wg-corner">GMT-3</div>
      {week.days.map((day) => (
        <div className="wg-head" key={day.iso}>
          <span className="wg-wd">{weekdayAbbrev(day.iso)}</span>
          <span className={"wg-num" + (day.iso === now.iso ? " today" : "")}>
            {dayNumber(day.iso)}
          </span>
        </div>
      ))}

      {/* Corpo: uma linha por hora. */}
      <div className="wg-body">
        {showNowLine && (
          <div
            className="wg-now"
            style={{ ["--offset" as string]: nowOffset }}
            aria-hidden="true"
          />
        )}

        {HOURS.map((hour) => (
          <div className="wg-row" key={hour}>
            <div className="wg-gutter">{hourLabel(hour)}</div>
            {week.days.map((day) => {
              const slot = day.slots.find((s) => s.hour === hour);
              if (!slot) return <div className="wg-cell" key={day.iso} />;

              return (
                <div className="wg-cell" key={day.iso}>
                  {slot.status === "free" ? (
                    <button
                      type="button"
                      className="wg-slot free"
                      onClick={() => onPick(day.iso, slot)}
                      aria-label={`Reservar ${timeLabel(hour)} de ${dayNumber(day.iso)}`}
                    >
                      {LABEL.free}
                    </button>
                  ) : (
                    // Reservado mostra só que está ocupado: a página é pública.
                    <div className={`wg-slot ${slot.status}`} aria-disabled="true">
                      {LABEL[slot.status]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
