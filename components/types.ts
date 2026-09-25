export type SlotStatus = "free" | "taken" | "blocked" | "past";
export type SlotView = { id: string; hour: number; status: SlotStatus };
export type DayView = { iso: string; slots: SlotView[] };
export type WeekView = { startIso: string; days: DayView[] };

/**
 * O "agora" é calculado no servidor e descido por props. Se o cliente usasse o
 * próprio relógio, o HTML hidratado divergiria do renderizado — e o fuso do
 * navegador do aluno pode nem ser o de São Paulo.
 */
export type NowView = { iso: string; hour: number; minute: number };
