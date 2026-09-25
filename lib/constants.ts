/** Fuso usado para TODA decisão de data. Ver lib/slots.ts. */
export const TIMEZONE = "America/Sao_Paulo";

/** Primeiro bloco começa às 14h. */
export const START_HOUR = 14;

/** Exclusivo: com END_HOUR = 19 os blocos são 14, 15, 16, 17 e 18. */
export const END_HOUR = 19;

/** Dias de monitoria. 0 = domingo, 2 = terça, 4 = quinta. */
export const WEEKDAYS = [2, 4];

/** Quantas semanas à frente a grade mostra. */
export const WEEKS_AHEAD = 3;

/** Opções do dropdown de série. */
export const GRADES = [
  "6º ano (Fundamental)",
  "7º ano (Fundamental)",
  "8º ano (Fundamental)",
  "9º ano (Fundamental)",
  "1º ano (Ensino Médio)",
  "2º ano (Ensino Médio)",
  "3º ano (Ensino Médio)",
  "Cursinho/Vestibular",
  "Outro",
] as const;
