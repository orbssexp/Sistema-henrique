import { getBookingsForReport } from "@/lib/db";
import { brDate, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

function cell(value: string): string {
  // Prefixar ' em valores que começam com =, +, - ou @ evita injeção de fórmula
  // quando o CSV é aberto numa planilha: um nome digitado como "=1+1" seria
  // interpretado como cálculo.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  const bookings = await getBookingsForReport();

  const rows = [
    ["Data", "Hora", "Aluno", "Serie", "Materia", "Assunto"],
    ...bookings.map((b) => [
      brDate(b.slot_date),
      timeLabel(b.slot_hour),
      b.student_name,
      b.grade,
      b.subject,
      b.topic ?? "resolução de questões",
    ]),
  ];

  // BOM UTF-8 senão o Excel em português transforma os acentos em lixo;
  // ponto-e-vírgula porque o Excel pt-BR usa vírgula como separador decimal.
  const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="monitorias-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
