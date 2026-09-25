"use client";

import { cancelBooking } from "@/app/monitor/actions";

export function CancelButton({ id, studentName }: { id: number; studentName: string }) {
  return (
    <form
      action={cancelBooking}
      onSubmit={(e) => {
        if (!confirm(`Cancelar a reserva de ${studentName}?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn-mini danger">
        Cancelar
      </button>
    </form>
  );
}
