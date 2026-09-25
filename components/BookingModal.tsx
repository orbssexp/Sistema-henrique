"use client";

import { useActionState, useState } from "react";
import { createBooking, type BookingState } from "@/app/actions";
import { GRADES } from "@/lib/constants";
import { shortDate, timeLabel } from "@/lib/format";
import type { SlotView } from "./DayTabs";

export function BookingModal({
  dayIso,
  slot,
  onClose,
}: {
  dayIso: string;
  slot: SlotView;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(createBooking, {});
  const [topicMode, setTopicMode] = useState<"questoes" | "conteudo">("questoes");

  const backdrop = (content: React.ReactNode) => (
    <div
      className="overlay show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Reservar horário">
        {content}
      </div>
    </div>
  );

  if (state.success) {
    return backdrop(
      <div className="confirm-screen">
        <div className="check">✅</div>
        <h2>Reserva confirmada!</h2>
        <div className="modal-sub">
          {shortDate(dayIso)} · {timeLabel(slot.hour)}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return backdrop(
    <>
      <h2>Reservar horário</h2>
      <div className="modal-sub">
        {shortDate(dayIso)} · {timeLabel(slot.hour)}
      </div>

      <form action={formAction}>
        <input type="hidden" name="slotId" value={slot.id} />
        <input type="hidden" name="topicMode" value={topicMode} />

        <div className="field">
          <label htmlFor="studentName">Seu nome</label>
          <input
            id="studentName"
            name="studentName"
            type="text"
            placeholder="Nome completo"
            maxLength={120}
            autoComplete="name"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="grade">Série</label>
          <select id="grade" name="grade" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="subject">Matéria</label>
          <input
            id="subject"
            name="subject"
            type="text"
            placeholder="Ex: Matemática, Física, Química..."
            maxLength={80}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="topic">O que você quer estudar?</label>
          <div className="topic-choice">
            <button
              type="button"
              className={topicMode === "questoes" ? "active" : ""}
              onClick={() => setTopicMode("questoes")}
            >
              Resolução de questões
            </button>
            <button
              type="button"
              className={topicMode === "conteudo" ? "active" : ""}
              onClick={() => setTopicMode("conteudo")}
            >
              Conteúdo específico
            </button>
          </div>
          {topicMode === "conteudo" && (
            <textarea
              id="topic"
              name="topic"
              maxLength={500}
              placeholder="Ex: derivadas, matriz inversa..."
            />
          )}
        </div>

        {state.error && (
          <div className="error-msg show" role="alert">
            {state.error}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Reservando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </>
  );
}
