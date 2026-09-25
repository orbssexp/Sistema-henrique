"use client";

import { shortDate } from "@/lib/format";

export type SlotStatus = "free" | "taken" | "blocked" | "past";
export type SlotView = { id: string; hour: number; status: SlotStatus };
export type DayView = { iso: string; slots: SlotView[] };

export function DayTabs({
  days,
  activeIso,
  onSelect,
}: {
  days: DayView[];
  activeIso: string;
  onSelect: (iso: string) => void;
}) {
  return (
    <div className="day-tabs" role="tablist" aria-label="Datas disponíveis">
      {days.map((day) => (
        <button
          key={day.iso}
          type="button"
          role="tab"
          aria-selected={day.iso === activeIso}
          className={"day-tab" + (day.iso === activeIso ? " active" : "")}
          onClick={() => onSelect(day.iso)}
        >
          {shortDate(day.iso)}
        </button>
      ))}
    </div>
  );
}
