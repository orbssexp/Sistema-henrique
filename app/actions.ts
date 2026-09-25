"use server";

import { revalidatePath } from "next/cache";
import { buildDays, isSlotPast } from "@/lib/slots";
import { GRADES } from "@/lib/constants";
import { createBooking as insertBooking } from "@/lib/db";

export type BookingState = { error?: string; success?: boolean };

export async function createBooking(
  _prev: BookingState,
  formData: FormData
): Promise<BookingState> {
  const slotId = String(formData.get("slotId") ?? "");
  const studentName = String(formData.get("studentName") ?? "").trim();
  const grade = String(formData.get("grade") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const topicMode = String(formData.get("topicMode") ?? "questoes");
  const topicRaw = String(formData.get("topic") ?? "").trim();

  const now = new Date();

  // O slot precisa existir na grade que o SERVIDOR gera. É isso que impede
  // alguém de reservar uma data arbitrária por requisição forjada — nunca
  // confiamos na data que veio do cliente.
  const slot = buildDays(now)
    .flatMap((d) => d.slots.map((s) => ({ ...s, iso: d.iso })))
    .find((s) => s.id === slotId);
  if (!slot) return { error: "Esse horário não está mais disponível. Recarregue a página." };

  if (isSlotPast(slot.iso, slot.hour, now)) return { error: "Esse horário já passou." };
  if (!studentName) return { error: "Escreva seu nome para continuar." };
  if (studentName.length > 120) return { error: "Nome muito longo." };
  if (!(GRADES as readonly string[]).includes(grade)) return { error: "Selecione sua série." };
  if (!subject) return { error: "Diga qual matéria você quer estudar." };
  if (subject.length > 80) return { error: "Nome da matéria muito longo." };
  if (topicMode === "conteudo" && !topicRaw) {
    return { error: "Diga qual conteúdo você quer estudar." };
  }
  if (topicRaw.length > 500) return { error: "Descrição muito longa." };

  // topic NULL significa "resolução de questões" — é o padrão da referência.
  const topic = topicMode === "conteudo" ? topicRaw : null;

  let result;
  try {
    result = await insertBooking({
      slotDate: slot.iso,
      slotHour: slot.hour,
      studentName,
      grade,
      subject,
      topic,
    });
  } catch {
    return { error: "Não consegui salvar a reserva agora. Tente de novo." };
  }

  if (!result.ok) {
    revalidatePath("/");
    return result.reason === "taken"
      ? { error: "Esse horário acabou de ser reservado por outra pessoa." }
      : { error: "O monitor fechou esse horário. Escolha outro." };
  }

  revalidatePath("/");
  revalidatePath("/monitor");
  return { success: true };
}
