"use client";

import { blockSlot, unblockSlot } from "@/app/monitor/actions";

export function BlockToggle({
  iso,
  hour,
  blocked,
}: {
  iso: string;
  hour: number;
  blocked: boolean;
}) {
  return (
    <form action={blocked ? unblockSlot : blockSlot}>
      <input type="hidden" name="iso" value={iso} />
      <input type="hidden" name="hour" value={hour} />
      <button type="submit" className="btn-mini">
        {blocked ? "Liberar" : "Fechar horário"}
      </button>
    </form>
  );
}
