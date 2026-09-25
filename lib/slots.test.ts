import { describe, it, expect } from "vitest";
import { nowInSaoPaulo, buildDays, isSlotPast, groupIntoWeeks } from "./slots";

describe("nowInSaoPaulo", () => {
  it("devolve a data de calendário de São Paulo, não a de UTC", () => {
    // 2026-10-02T02:30Z é 2026-10-01 23:30 em São Paulo (UTC-3).
    // Ingenuamente isso viraria "2 de outubro" e a grade sairia errada.
    const r = nowInSaoPaulo(new Date("2026-10-02T02:30:00Z"));
    expect(r.iso).toBe("2026-10-01");
    expect(r.hour).toBe(23);
  });

  it("usa hora 0 à meia-noite, não 24", () => {
    // Intl com hour12:false devolve "24" em alguns runtimes; hourCycle h23 corrige.
    const r = nowInSaoPaulo(new Date("2026-10-02T03:00:00Z"));
    expect(r.iso).toBe("2026-10-02");
    expect(r.hour).toBe(0);
  });
});

describe("buildDays", () => {
  // 2026-09-24 é quinta; 2026-10-01 é quinta; 2026-10-06 é terça.
  const meioDia = new Date("2026-09-24T15:00:00Z"); // 12:00 em São Paulo

  it("gera só terças e quintas", () => {
    for (const day of buildDays(meioDia)) {
      const [y, m, d] = day.iso.split("-").map(Number);
      const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
      expect([2, 4]).toContain(wd);
    }
  });

  it("começa no dia de hoje quando hoje é dia de monitoria", () => {
    expect(buildDays(meioDia)[0].iso).toBe("2026-09-24");
  });

  it("gera cinco blocos de uma hora por dia, das 14h às 18h", () => {
    expect(buildDays(meioDia)[0].slots.map((s) => s.hour)).toEqual([14, 15, 16, 17, 18]);
  });

  it("não passa da janela de 3 semanas", () => {
    const days = buildDays(meioDia);
    expect(days[days.length - 1].iso <= "2026-10-15").toBe(true);
  });

  it("ainda mostra o dia de hoje às 23h30, quando em UTC já é amanhã", () => {
    // O bug que este teste existe para impedir.
    expect(buildDays(new Date("2026-10-02T02:30:00Z"))[0].iso).toBe("2026-10-01");
  });

  it("dá um id estável e único a cada slot", () => {
    const ids = buildDays(meioDia).flatMap((d) => d.slots.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("2026-09-24_14");
  });
});

describe("isSlotPast", () => {
  const dezESeis = new Date("2026-09-24T19:00:00Z"); // 16:00 em São Paulo

  it("considera passado o bloco que já começou", () => {
    expect(isSlotPast("2026-09-24", 16, dezESeis)).toBe(true);
    expect(isSlotPast("2026-09-24", 15, dezESeis)).toBe(true);
  });

  it("mantém disponível o bloco que ainda não começou hoje", () => {
    expect(isSlotPast("2026-09-24", 17, dezESeis)).toBe(false);
  });

  it("considera passado qualquer bloco de dia anterior", () => {
    expect(isSlotPast("2026-09-22", 18, dezESeis)).toBe(true);
  });

  it("nunca considera passado um bloco de dia futuro", () => {
    expect(isSlotPast("2026-10-01", 14, dezESeis)).toBe(false);
  });

  it("usa o dia de São Paulo, não o de UTC, na virada da noite", () => {
    const noite = new Date("2026-10-02T02:30:00Z"); // 23:30 de 01/10 em SP
    expect(isSlotPast("2026-10-01", 14, noite)).toBe(true);
    expect(isSlotPast("2026-10-06", 14, noite)).toBe(false);
  });
});

describe("nowInSaoPaulo — minuto", () => {
  it("devolve o minuto, usado para posicionar a linha do agora", () => {
    const r = nowInSaoPaulo(new Date("2026-10-02T02:30:00Z"));
    expect(r.hour).toBe(23);
    expect(r.minute).toBe(30);
  });
});

describe("groupIntoWeeks", () => {
  // Hoje e quinta 2026-09-24. A terca daquela semana (dia 22) ja passou.
  const days = buildDays(new Date("2026-09-24T15:00:00Z"));
  const weeks = groupIntoWeeks(days);

  it("agrupa as 3 semanas da janela em 4 blocos de semana", () => {
    expect(weeks.length).toBe(4);
  });

  it("comeca a semana no domingo, como o Google Calendar", () => {
    // 2026-09-20 e domingo.
    expect(weeks[0].startIso).toBe("2026-09-20");
  });

  it("a primeira semana vem incompleta quando a terca ja passou", () => {
    expect(weeks[0].days.map((d) => d.iso)).toEqual(["2026-09-24"]);
  });

  it("as semanas do meio trazem terca e quinta", () => {
    expect(weeks[1].days.map((d) => d.iso)).toEqual(["2026-09-29", "2026-10-01"]);
    expect(weeks[2].days.map((d) => d.iso)).toEqual(["2026-10-06", "2026-10-08"]);
  });

  it("as semanas saem em ordem cronologica", () => {
    const starts = weeks.map((w) => w.startIso);
    expect([...starts].sort()).toEqual(starts);
  });

  it("nao perde nenhum dia no agrupamento", () => {
    expect(weeks.flatMap((w) => w.days).length).toBe(days.length);
  });
});
