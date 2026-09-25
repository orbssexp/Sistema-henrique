const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Trabalha sobre a string ISO, nunca sobre Date local, para não reintroduzir
 * problema de fuso. Meio-dia UTC como âncora: nenhum offset do planeta
 * consegue empurrar a data para o dia vizinho a partir dali.
 */
function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() };
}

/** "qui 1 out" — usado nas abas, onde o espaço é curto. */
export function shortDate(iso: string): string {
  const { d, m, weekday } = parts(iso);
  return `${DIAS_CURTO[weekday]} ${d} ${MESES[m - 1]}`;
}

/** "quinta, 1 de outubro" — usado nos títulos da agenda do monitor. */
export function longDate(iso: string): string {
  const { d, m, weekday } = parts(iso);
  return `${DIAS[weekday]}, ${d} de ${MESES_LONGOS[m - 1]}`;
}

/** "14h–15h" */
export function timeLabel(hour: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}h–${pad(hour + 1)}h`;
}

/** "01/10/2026" — usado no relatório e no CSV. */
export function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
