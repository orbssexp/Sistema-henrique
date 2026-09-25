# Agendamento de Monitoria — Plano de Implementação

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o site de agendamento de monitoria de um HTML single-file para um app Next.js na Vercel com Postgres, ganhando dados compartilhados de verdade e um painel para o monitor.

**Architecture:** App Router com Server Components lendo o Postgres direto e Server Actions para escrever — sem API REST, sem `fetch` no cliente, sem biblioteca de estado. A grade de horários é constante no código e gerada por funções puras no fuso `America/Sao_Paulo`; o banco garante a unicidade da reserva por índice único parcial. O monitor entra por senha única em variável de ambiente, com sessão em cookie assinado por HMAC validado no middleware.

**Tech Stack:** Next.js 15 (App Router), TypeScript, `@neondatabase/serverless` com SQL puro, CSS único portado da referência, Vitest sobre a lógica de datas.

**Spec:** [`docs/superpowers/specs/2026-09-24-agendamento-monitoria-nextjs-design.md`](../specs/2026-09-24-agendamento-monitoria-nextjs-design.md)

---

## Refinamentos ao spec

Duas decisões do spec mudaram ao detalhar o código. O spec permanece a fonte da verdade sobre *o que* construir; estes são detalhes de *como*:

1. **Estilo: um `app/globals.css` único, não CSS Modules.** A referência é uma folha de 280 linhas com nomes de classe semânticos (`.slot`, `.day-tab`, `.modal`). Portar verbatim preserva o visual com risco quase zero; CSS Modules exigiria reescrever todos os seletores sem ganho.
2. **Sem transação no INSERT.** O driver HTTP do Neon não suporta transações multi-statement. A checagem de bloqueio entra no próprio INSERT via `INSERT ... SELECT ... WHERE NOT EXISTS`, numa ida só: zero linhas retornadas = bloqueado; erro `23505` = já reservado.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/constants.ts` | Grade (dias, horas, semanas), fuso, lista de séries. Único lugar a editar para mudar horários. |
| `lib/slots.ts` | **Puro.** Converte instante → data de calendário em São Paulo, gera a grade, decide "já passou". Recebe `now` por parâmetro. |
| `lib/slots.test.ts` | Testes da lógica acima. |
| `lib/db.ts` | Cliente Neon e **todas** as queries. Nenhuma página escreve SQL. |
| `lib/auth.ts` | Assinar/verificar cookie de sessão (Web Crypto HMAC, roda no Edge). |
| `lib/format.ts` | Rótulos pt-BR de data e hora. |
| `app/globals.css` | Tokens `:root` e todo o CSS. |
| `app/layout.tsx` | Shell HTML, metadata, viewport. |
| `app/page.tsx` | **Server.** Lê banco, monta a grade, entrega ao Scheduler. |
| `app/actions.ts` | Server Action `createBooking`. |
| `components/Scheduler.tsx` | **Client.** Aba ativa + estado do modal. |
| `components/DayTabs.tsx` | Apresentacional: abas de data. |
| `components/SlotGrid.tsx` | Apresentacional: grade de horários. |
| `components/BookingModal.tsx` | **Client.** Formulário de reserva. |
| `middleware.ts` | Protege `/monitor/*` exceto o login. |
| `app/monitor/login/page.tsx` | Formulário de senha. |
| `app/monitor/layout.tsx` | Navegação Agenda/Relatório + logout. |
| `app/monitor/page.tsx` | **Server.** Agenda dos próximos dias. |
| `app/monitor/relatorio/page.tsx` | **Server.** Histórico e agregados. |
| `app/monitor/relatorio/csv/route.ts` | Download CSV. |
| `app/monitor/actions.ts` | `login`, `logout`, `cancelBooking`, `blockSlot`, `unblockSlot`. |
| `components/CancelButton.tsx` | **Client.** Botão com confirmação. |
| `components/BlockToggle.tsx` | **Client.** Bloquear/liberar horário. |
| `scripts/init-db.sql` | Schema, rodado uma vez no Neon. |

---

## Chunk 1: Fundação

### Task 1: Scaffold do projeto

**Files:**
- Create: raiz do projeto (`package.json`, `tsconfig.json`, `next.config.ts`, `app/`)

- [ ] **Step 1: Criar o app Next na pasta atual**

O projeto já tem `docs/`, `reference/` e `.git`. O `create-next-app` recusa pasta não vazia, então geramos em subpasta temporária e movemos.

```bash
cd "d:/Donwloads/APPS/Sistema de agendamento de aula"
npx --yes create-next-app@latest .tmp-next \
  --ts --app --eslint --no-tailwind --no-src-dir \
  --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Mover para a raiz e remover a temporária**

```bash
cd "d:/Donwloads/APPS/Sistema de agendamento de aula"
mv .tmp-next/* .tmp-next/.[!.]* . 2>/dev/null || true
rm -rf .tmp-next
ls package.json app/layout.tsx
```

Esperado: os dois arquivos existem. O `.gitignore` gerado pelo Next substitui o nosso — confirme que ainda ignora `node_modules/`, `.next/`, `.env*.local` e adicione `.vercel` se faltar.

- [ ] **Step 3: Instalar as dependências do projeto**

```bash
npm install @neondatabase/serverless
npm install -D vitest
```

- [ ] **Step 4: Adicionar o script de teste**

Em `package.json`, dentro de `"scripts"`, acrescente:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Verificar que o projeto sobe**

```bash
npm run build
```

Esperado: `Compiled successfully`. Se falhar aqui, pare e resolva antes de seguir — todo o resto depende disso.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold do app Next.js com TypeScript e App Router"
```

---

### Task 2: Constantes e formatação

**Files:**
- Create: `lib/constants.ts`
- Create: `lib/format.ts`

- [ ] **Step 1: Criar `lib/constants.ts`**

```ts
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
```

- [ ] **Step 2: Criar `lib/format.ts`**

Trabalha sobre a string ISO, nunca sobre `Date`, para não reintroduzir problema de fuso. `Date.UTC(..., 12)` ao meio-dia evita que qualquer offset empurre a data para o dia vizinho.

```ts
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

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
  const mesesLongos = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${DIAS[weekday]}, ${d} de ${mesesLongos[m - 1]}`;
}

/** "14h–15h" */
export function timeLabel(hour: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}h–${pad(hour + 1)}h`;
}

/** "01/10/2026" — usado no CSV e no relatório. */
export function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/constants.ts lib/format.ts
git commit -m "feat: constantes da grade e formatação de data em pt-BR"
```

---

### Task 3: Portar o CSS da referência

**Files:**
- Modify: `app/globals.css` (substituir todo o conteúdo)
- Modify: `app/layout.tsx`
- Delete: `app/page.module.css` (gerado pelo scaffold, não usado)

- [ ] **Step 1: Substituir `app/globals.css`**

Copie o conteúdo de `<style>` em `reference/index.html:7-281` **verbatim**, e depois acrescente ao final os estilos novos do painel do monitor. O bloco portado inclui: os tokens `:root`, o bloco `@media (prefers-color-scheme: dark)` guardado por `:root:not([data-theme="light"])`, o bloco `:root[data-theme="dark"]`, e as classes `.wrap`, `header`, `.status-banner`, `.day-tabs`, `.day-tab`, `.slots`, `.slot`, `.overlay`, `.modal`, `.field`, `.topic-choice`, `.modal-actions`, `.btn`, `.error-msg`, `.confirm-screen`, `footer`.

Três ajustes ao portar, e só três:

```css
/* 1. Slot bloqueado pelo monitor — estado novo, não existia na referência. */
.slot.blocked {
  background: var(--taken-bg);
  cursor: default;
  box-shadow: none;
  opacity: 0.55;
}
.slot.blocked:hover { transform: none; }
.slot.blocked .tag { color: var(--text-muted); }

/* 2. Slot cujo horário já passou. */
.slot.past {
  background: var(--surface-2);
  cursor: default;
  box-shadow: none;
  opacity: 0.4;
}
.slot.past:hover { transform: none; }
.slot.past .tag { color: var(--text-muted); }

/* 3. Alvos de toque de 44px no mínimo (acessibilidade no celular). */
.day-tab { min-height: 44px; }
.btn { min-height: 44px; }
```

Em seguida acrescente os estilos do monitor:

```css
/* ---------- Painel do monitor ---------- */
.monitor-nav {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 22px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.monitor-nav a {
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  font-size: 13.5px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.monitor-nav a.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}
.monitor-nav .spacer { flex: 1; }

.day-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: var(--shadow);
}
.day-card h3 {
  margin: 0 0 12px;
  font-size: 17px;
  text-transform: capitalize;
}
.slot-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 11px 0;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}
.slot-row:first-of-type { border-top: none; }
.slot-row .hour {
  font-weight: 600;
  min-width: 78px;
  font-size: 15px;
}
.slot-row .detail {
  flex: 1 1 180px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13.5px;
  color: var(--text-muted);
}
.slot-row .detail strong { color: var(--text); font-weight: 600; }
.slot-row .row-actions {
  display: flex;
  gap: 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.btn-mini {
  padding: 8px 12px;
  min-height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 12.5px;
  cursor: pointer;
  font-family: inherit;
}
.btn-mini.danger { color: var(--danger); border-color: var(--danger); }

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 22px;
}
.stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.stat .label {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  font-weight: 600;
}
.stat .value { font-size: 24px; font-weight: 600; margin-top: 2px; }

/* Tabela do relatório: só a partir de 720px, e sempre com escape horizontal. */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table.report {
  width: 100%;
  border-collapse: collapse;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13.5px;
}
table.report th, table.report td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
table.report th { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.report-cards { display: grid; gap: 10px; }
.report-cards .day-card { margin-bottom: 0; }

.only-wide { display: none; }
@media (min-width: 720px) {
  .only-wide { display: block; }
  .only-narrow { display: none; }
}

.empty {
  text-align: center;
  padding: 34px 18px;
  color: var(--text-muted);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
}
```

- [ ] **Step 2: Reescrever `app/layout.tsx`**

O `:root` da referência já aplica `padding-top`/`padding-bottom` com `env(safe-area-inset-*)`, então o `viewport-fit=cover` é obrigatório para o iPhone com notch.

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monitoria — Agende seu horário",
  description: "Agende seu horário de monitoria.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Limpar restos do scaffold**

```bash
rm -f app/page.module.css
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run build
```

Esperado: sem erros. (A `app/page.tsx` do scaffold vai reclamar se importava o CSS Module removido — troque o conteúdo dela por um `<main>Em construção</main>` provisório; a Task 7 a substitui.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: portar o CSS da referência e adicionar estilos do painel"
```

---

## Chunk 2: Lógica de datas (TDD)

Este é o único chunk com testes, e é onde está o bug de verdade: a Vercel roda em UTC, o Brasil em UTC−3. Sem isso, entre 21h e meia-noite o app mostra a grade do dia errado — falha que só aparece à noite e só em produção.

### Task 4: `nowInSaoPaulo`

**Files:**
- Create: `lib/slots.test.ts`
- Create: `lib/slots.ts`

- [ ] **Step 1: Escrever o teste que falha**

`lib/slots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nowInSaoPaulo } from "./slots";

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
    // 2026-10-02T03:00Z = 2026-10-02 00:00 em São Paulo.
    const r = nowInSaoPaulo(new Date("2026-10-02T03:00:00Z"));
    expect(r.iso).toBe("2026-10-02");
    expect(r.hour).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run lib/slots.test.ts
```

Esperado: FAIL — `Failed to resolve import "./slots"`.

- [ ] **Step 3: Implementar o mínimo**

`lib/slots.ts`:

```ts
import { TIMEZONE, START_HOUR, END_HOUR, WEEKDAYS, WEEKS_AHEAD } from "./constants";

/**
 * Converte um instante para a data de calendário e a hora vigentes em São Paulo.
 *
 * Toda decisão de data no app passa por aqui. `hourCycle: "h23"` é obrigatório:
 * com `hour12: false` alguns runtimes devolvem "24" à meia-noite, o que quebra
 * as comparações de hora.
 */
export function nowInSaoPaulo(now: Date): { iso: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run lib/slots.test.ts
```

Esperado: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/slots.ts lib/slots.test.ts
git commit -m "feat: converter instante para data de calendário em São Paulo"
```

---

### Task 5: `buildDays`

**Files:**
- Modify: `lib/slots.test.ts`
- Modify: `lib/slots.ts`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `lib/slots.test.ts`:

```ts
import { buildDays } from "./slots";

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
    const slots = buildDays(meioDia)[0].slots;
    expect(slots.map((s) => s.hour)).toEqual([14, 15, 16, 17, 18]);
  });

  it("não passa da janela de 3 semanas", () => {
    const days = buildDays(meioDia);
    expect(days[days.length - 1].iso <= "2026-10-15").toBe(true);
  });

  it("ainda mostra o dia de hoje às 23h30, quando em UTC já é amanhã", () => {
    // O bug que este teste existe para impedir.
    const days = buildDays(new Date("2026-10-02T02:30:00Z"));
    expect(days[0].iso).toBe("2026-10-01");
  });

  it("dá um id estável e único a cada slot", () => {
    const ids = buildDays(meioDia).flatMap((d) => d.slots.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("2026-09-24_14");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run lib/slots.test.ts
```

Esperado: FAIL — `buildDays is not a function`.

- [ ] **Step 3: Implementar**

Acrescente a `lib/slots.ts`:

```ts
export type Slot = { hour: number; id: string };
export type Day = { iso: string; slots: Slot[] };

/**
 * Meio-dia UTC como âncora para aritmética de calendário.
 *
 * Somar dias a partir do meio-dia nunca cruza a fronteira do dia por causa de
 * offset ou horário de verão — a margem é de 12 horas para cada lado.
 */
function isoToAnchor(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function anchorToIso(anchor: Date): string {
  return anchor.toISOString().slice(0, 10);
}

/** Gera a grade: dias de monitoria de hoje até WEEKS_AHEAD semanas à frente. */
export function buildDays(now: Date): Day[] {
  const today = nowInSaoPaulo(now).iso;
  const cursor = isoToAnchor(today);
  const end = isoToAnchor(today);
  end.setUTCDate(end.getUTCDate() + WEEKS_AHEAD * 7);

  const days: Day[] = [];
  while (cursor <= end) {
    if (WEEKDAYS.includes(cursor.getUTCDay())) {
      const iso = anchorToIso(cursor);
      const slots: Slot[] = [];
      for (let h = START_HOUR; h < END_HOUR; h++) {
        slots.push({ hour: h, id: `${iso}_${h}` });
      }
      days.push({ iso, slots });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run lib/slots.test.ts
```

Esperado: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/slots.ts lib/slots.test.ts
git commit -m "feat: gerar a grade de terças e quintas no fuso de São Paulo"
```

---

### Task 6: `isSlotPast`

**Files:**
- Modify: `lib/slots.test.ts`
- Modify: `lib/slots.ts`

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { isSlotPast } from "./slots";

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
    // 23:30 de 01/10 em SP. O bloco das 14h de 01/10 já passou,
    // mas nada de 06/10 passou — mesmo que em UTC já seja dia 02.
    const noite = new Date("2026-10-02T02:30:00Z");
    expect(isSlotPast("2026-10-01", 14, noite)).toBe(true);
    expect(isSlotPast("2026-10-06", 14, noite)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run lib/slots.test.ts
```

Esperado: FAIL — `isSlotPast is not a function`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Um bloco deixa de ser reservável quando sua hora de início chega —
 * entrar numa aula que começou 40 minutos atrás não serve para ninguém.
 *
 * A comparação de strings funciona porque o formato é YYYY-MM-DD, que ordena
 * lexicograficamente igual à ordem cronológica.
 */
export function isSlotPast(iso: string, hour: number, now: Date): boolean {
  const current = nowInSaoPaulo(now);
  if (iso < current.iso) return true;
  if (iso > current.iso) return false;
  return hour <= current.hour;
}
```

- [ ] **Step 4: Rodar a suíte inteira**

```bash
npm test
```

Esperado: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/slots.ts lib/slots.test.ts
git commit -m "feat: marcar como indisponível o horário que já começou"
```

---

## Chunk 3: Banco de dados

### Task 7: Schema

**Files:**
- Create: `scripts/init-db.sql`

- [ ] **Step 1: Criar `scripts/init-db.sql`**

```sql
-- Rodar UMA VEZ no SQL Editor do Neon, depois de criar o banco.
-- Idempotente: pode rodar de novo sem quebrar.

CREATE TABLE IF NOT EXISTS bookings (
  id            BIGSERIAL PRIMARY KEY,
  slot_date     DATE        NOT NULL,
  slot_hour     SMALLINT    NOT NULL,
  student_name  TEXT        NOT NULL,
  grade         TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  topic         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ
);

-- Índice PARCIAL: é o que garante uma reserva por horário e, ao mesmo tempo,
-- permite que o cancelamento devolva o horário à grade sem apagar o histórico.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_unique
  ON bookings (slot_date, slot_hour)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings (slot_date);

CREATE TABLE IF NOT EXISTS blocked_slots (
  slot_date  DATE        NOT NULL,
  slot_hour  SMALLINT    NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (slot_date, slot_hour)
);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/init-db.sql
git commit -m "feat: schema do banco com índice único parcial por horário"
```

---

### Task 8: Camada de acesso a dados

**Files:**
- Create: `lib/db.ts`
- Create: `.env.local.example`

- [ ] **Step 1: Criar `.env.local.example`**

```
# Connection string do Neon. Na Vercel, criada automaticamente ao adicionar
# o banco em Storage -> Create Database -> Neon.
DATABASE_URL=

# Senha que o monitor digita em /monitor/login.
MONITOR_PASSWORD=

# Segredo para assinar o cookie de sessão. Gere com:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=
```

- [ ] **Step 2: Criar `lib/db.ts`**

```ts
import { neon } from "@neondatabase/serverless";

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  return neon(url);
}

export type Booking = {
  id: number;
  slot_date: string;
  slot_hour: number;
  student_name: string;
  grade: string;
  subject: string;
  topic: string | null;
  created_at: string;
};

export type BlockedSlot = { slot_date: string; slot_hour: number; reason: string | null };

/**
 * O driver devolve DATE como string "YYYY-MM-DD" quando o valor não tem
 * componente de hora. Convertemos defensivamente: se algum dia vier Date,
 * um toISOString() ingênuo poderia deslocar o dia.
 */
function toIso(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())}`;
  }
  return String(value).slice(0, 10);
}

function mapBooking(row: Record<string, unknown>): Booking {
  return {
    id: Number(row.id),
    slot_date: toIso(row.slot_date),
    slot_hour: Number(row.slot_hour),
    student_name: String(row.student_name),
    grade: String(row.grade),
    subject: String(row.subject),
    topic: row.topic === null || row.topic === undefined ? null : String(row.topic),
    created_at: String(row.created_at),
  };
}

/** Reservas ativas no intervalo (inclusivo). */
export async function getBookings(fromIso: string, toIso_: string): Promise<Booking[]> {
  const rows = await db()`
    SELECT id, slot_date, slot_hour, student_name, grade, subject, topic, created_at
    FROM bookings
    WHERE cancelled_at IS NULL AND slot_date BETWEEN ${fromIso}::date AND ${toIso_}::date
    ORDER BY slot_date, slot_hour
  `;
  return rows.map(mapBooking);
}

export async function getBlockedSlots(fromIso: string, toIso_: string): Promise<BlockedSlot[]> {
  const rows = await db()`
    SELECT slot_date, slot_hour, reason
    FROM blocked_slots
    WHERE slot_date BETWEEN ${fromIso}::date AND ${toIso_}::date
  `;
  return rows.map((r) => ({
    slot_date: toIso(r.slot_date),
    slot_hour: Number(r.slot_hour),
    reason: r.reason === null || r.reason === undefined ? null : String(r.reason),
  }));
}

export type CreateResult = { ok: true } | { ok: false; reason: "taken" | "blocked" };

/**
 * Grava a reserva numa única instrução.
 *
 * O driver HTTP do Neon não faz transação multi-statement, então a checagem de
 * bloqueio vai dentro do próprio INSERT. Zero linhas retornadas = o horário
 * está bloqueado. Erro 23505 (unique_violation) = alguém reservou primeiro.
 * Não existe janela de corrida: quem decide é o índice do banco.
 */
export async function createBooking(input: {
  slotDate: string;
  slotHour: number;
  studentName: string;
  grade: string;
  subject: string;
  topic: string | null;
}): Promise<CreateResult> {
  try {
    const rows = await db()`
      INSERT INTO bookings (slot_date, slot_hour, student_name, grade, subject, topic)
      SELECT ${input.slotDate}::date, ${input.slotHour}::smallint,
             ${input.studentName}, ${input.grade}, ${input.subject}, ${input.topic}
      WHERE NOT EXISTS (
        SELECT 1 FROM blocked_slots
        WHERE slot_date = ${input.slotDate}::date
          AND slot_hour = ${input.slotHour}::smallint
      )
      RETURNING id
    `;
    if (rows.length === 0) return { ok: false, reason: "blocked" };
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "taken" };
    throw err;
  }
}

/** O driver do Neon expõe o código do Postgres em lugares diferentes por versão. */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; sourceError?: { code?: unknown } };
  return e.code === "23505" || e.sourceError?.code === "23505";
}

export async function cancelBooking(id: number): Promise<void> {
  await db()`UPDATE bookings SET cancelled_at = now() WHERE id = ${id} AND cancelled_at IS NULL`;
}

export async function blockSlot(iso: string, hour: number, reason: string | null): Promise<void> {
  await db()`
    INSERT INTO blocked_slots (slot_date, slot_hour, reason)
    VALUES (${iso}::date, ${hour}::smallint, ${reason})
    ON CONFLICT (slot_date, slot_hour) DO NOTHING
  `;
}

export async function unblockSlot(iso: string, hour: number): Promise<void> {
  await db()`
    DELETE FROM blocked_slots
    WHERE slot_date = ${iso}::date AND slot_hour = ${hour}::smallint
  `;
}

/** Relatório: reservas ativas, mais recentes primeiro. */
export async function getBookingsForReport(fromIso?: string, toIso_?: string): Promise<Booking[]> {
  const rows = fromIso && toIso_
    ? await db()`
        SELECT id, slot_date, slot_hour, student_name, grade, subject, topic, created_at
        FROM bookings
        WHERE cancelled_at IS NULL AND slot_date BETWEEN ${fromIso}::date AND ${toIso_}::date
        ORDER BY slot_date DESC, slot_hour DESC`
    : await db()`
        SELECT id, slot_date, slot_hour, student_name, grade, subject, topic, created_at
        FROM bookings
        WHERE cancelled_at IS NULL
        ORDER BY slot_date DESC, slot_hour DESC`;
  return rows.map(mapBooking);
}

/**
 * Agrega por matéria. Como o aluno digita livre, normalizamos com
 * lower(btrim(...)) para "Matemática", "matematica " e "MATEMÁTICA" caírem
 * no mesmo grupo — e mostramos a grafia mais frequente na tela.
 */
export async function getSubjectCounts(): Promise<{ subject: string; total: number }[]> {
  const rows = await db()`
    SELECT mode() WITHIN GROUP (ORDER BY subject) AS subject, COUNT(*)::int AS total
    FROM bookings
    WHERE cancelled_at IS NULL
    GROUP BY lower(btrim(subject))
    ORDER BY total DESC, subject
  `;
  return rows.map((r) => ({ subject: String(r.subject), total: Number(r.total) }));
}

export async function getGradeCounts(): Promise<{ grade: string; total: number }[]> {
  const rows = await db()`
    SELECT grade, COUNT(*)::int AS total
    FROM bookings
    WHERE cancelled_at IS NULL
    GROUP BY grade
    ORDER BY total DESC, grade
  `;
  return rows.map((r) => ({ grade: String(r.grade), total: Number(r.total) }));
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sem erros. (Não há teste automatizado aqui — a verificação real acontece na Task 15, contra o banco.)

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts .env.local.example
git commit -m "feat: camada de acesso ao Postgres com reserva à prova de corrida"
```

---

## Chunk 4: Página do aluno

### Task 9: Server Action de reserva

**Files:**
- Create: `app/actions.ts`

- [ ] **Step 1: Criar `app/actions.ts`**

A validação **inteira** roda no servidor. O cliente manda `slotId`, e nós conferimos que esse id existe na grade que nós mesmos geramos — é isso que impede alguém de reservar uma data arbitrária via requisição forjada.

```ts
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

  // O slot precisa existir na grade que o servidor gera. Nunca confiamos na data
  // que veio do cliente.
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

  const result = await insertBooking({
    slotDate: slot.iso,
    slotHour: slot.hour,
    studentName,
    grade,
    subject,
    topic,
  });

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
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/actions.ts
git commit -m "feat: server action de reserva com validação server-side"
```

---

### Task 10: Componentes da grade

**Files:**
- Create: `components/DayTabs.tsx`
- Create: `components/SlotGrid.tsx`
- Create: `components/BookingModal.tsx`
- Create: `components/Scheduler.tsx`

- [ ] **Step 1: Criar o tipo compartilhado e `DayTabs.tsx`**

```tsx
"use client";

import { shortDate } from "@/lib/format";

export type SlotView = {
  id: string;
  hour: number;
  status: "free" | "taken" | "blocked" | "past";
};
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
    <div className="day-tabs" role="tablist">
      {days.map((day) => (
        <button
          key={day.iso}
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
```

- [ ] **Step 2: Criar `SlotGrid.tsx`**

Só `status: "free"` é clicável. Reservado mostra apenas "Reservado", sem nome nem matéria — a página é pública, e nome de aluno somado à matéria em que ele tem dificuldade é dado sensível.

```tsx
"use client";

import { timeLabel } from "@/lib/format";
import type { SlotView } from "./DayTabs";

const LABEL: Record<SlotView["status"], string> = {
  free: "Disponível",
  taken: "Reservado",
  blocked: "Indisponível",
  past: "Encerrado",
};

export function SlotGrid({
  slots,
  onPick,
}: {
  slots: SlotView[];
  onPick: (slot: SlotView) => void;
}) {
  if (slots.length === 0) {
    return <div className="empty">Nenhum horário neste dia.</div>;
  }
  return (
    <div className="slots">
      {slots.map((slot) =>
        slot.status === "free" ? (
          <button key={slot.id} className="slot" onClick={() => onPick(slot)}>
            <div className="time">{timeLabel(slot.hour)}</div>
            <div className="tag">{LABEL.free}</div>
          </button>
        ) : (
          <div key={slot.id} className={`slot ${slot.status}`} aria-disabled="true">
            <div className="time">{timeLabel(slot.hour)}</div>
            <div className="tag">{LABEL[slot.status]}</div>
          </div>
        )
      )}
    </div>
  );
}
```

Nota: os slots livres viram `<button>` em vez da `<div>` com `onclick` da referência. Isso dá navegação por teclado e leitura por leitor de tela de graça. Acrescente ao `globals.css`:

```css
button.slot {
  font-family: inherit;
  color: inherit;
  width: 100%;
  display: block;
}
```

- [ ] **Step 3: Criar `BookingModal.tsx`**

```tsx
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
  const [state, formAction, pending] = useActionState<BookingState, FormData>(
    createBooking,
    {}
  );
  const [topicMode, setTopicMode] = useState<"questoes" | "conteudo">("questoes");

  if (state.success) {
    return (
      <div
        className="overlay show"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="modal">
          <div className="confirm-screen">
            <div className="check">✅</div>
            <h2>Reserva confirmada!</h2>
            <div className="modal-sub">
              {shortDate(dayIso)} · {timeLabel(slot.hour)}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overlay show"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Reservar horário">
        <h2>Reservar horário</h2>
        <div className="modal-sub">
          {shortDate(dayIso)} · {timeLabel(slot.hour)}
        </div>

        <form action={formAction}>
          <input type="hidden" name="slotId" value={slot.id} />
          <input type="hidden" name="topicMode" value={topicMode} />

          <div className="field">
            <label htmlFor="studentName">Seu nome</label>
            <input id="studentName" name="studentName" type="text"
                   placeholder="Nome completo" maxLength={120} required />
          </div>

          <div className="field">
            <label htmlFor="grade">Série</label>
            <select id="grade" name="grade" required defaultValue="">
              <option value="" disabled>Selecione</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="subject">Matéria</label>
            <input id="subject" name="subject" type="text"
                   placeholder="Ex: Matemática, Física..." maxLength={80} required />
          </div>

          <div className="field">
            <label>O que você quer estudar?</label>
            <div className="topic-choice">
              <button type="button"
                      className={topicMode === "questoes" ? "active" : ""}
                      onClick={() => setTopicMode("questoes")}>
                Resolução de questões
              </button>
              <button type="button"
                      className={topicMode === "conteudo" ? "active" : ""}
                      onClick={() => setTopicMode("conteudo")}>
                Conteúdo específico
              </button>
            </div>
            {topicMode === "conteudo" && (
              <textarea name="topic" maxLength={500}
                        placeholder="Ex: derivadas, matriz inversa..." />
            )}
          </div>

          {state.error && <div className="error-msg show">{state.error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Reservando..." : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar `Scheduler.tsx`**

Todo o estado de cliente da página do aluno vive aqui: qual aba está ativa e qual slot está no modal. `router.refresh()` ao fechar busca a grade nova do servidor.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DayTabs, type DayView, type SlotView } from "./DayTabs";
import { SlotGrid } from "./SlotGrid";
import { BookingModal } from "./BookingModal";

export function Scheduler({ days }: { days: DayView[] }) {
  const router = useRouter();
  const [activeIso, setActiveIso] = useState(days[0]?.iso ?? "");
  const [picked, setPicked] = useState<SlotView | null>(null);

  const activeDay = days.find((d) => d.iso === activeIso) ?? days[0];

  if (!activeDay) {
    return <div className="empty">Nenhuma data de monitoria nas próximas semanas.</div>;
  }

  return (
    <>
      <DayTabs days={days} activeIso={activeDay.iso} onSelect={setActiveIso} />
      <SlotGrid slots={activeDay.slots} onPick={setPicked} />
      {picked && (
        <BookingModal
          dayIso={activeDay.iso}
          slot={picked}
          onClose={() => {
            setPicked(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add components/ app/globals.css
git commit -m "feat: componentes da grade e modal de reserva do aluno"
```

---

### Task 11: Página do aluno

**Files:**
- Modify: `app/page.tsx` (substituir o conteúdo do scaffold)

- [ ] **Step 1: Reescrever `app/page.tsx`**

```tsx
import { buildDays, isSlotPast } from "@/lib/slots";
import { getBookings, getBlockedSlots } from "@/lib/db";
import { Scheduler } from "@/components/Scheduler";
import type { DayView } from "@/components/DayTabs";

// Sempre dados frescos: a grade muda conforme outros alunos reservam.
export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const days = buildDays(now);

  let taken = new Set<string>();
  let blocked = new Set<string>();
  let dbError = false;

  if (days.length > 0) {
    const from = days[0].iso;
    const to = days[days.length - 1].iso;
    try {
      const [bookings, blocks] = await Promise.all([
        getBookings(from, to),
        getBlockedSlots(from, to),
      ]);
      taken = new Set(bookings.map((b) => `${b.slot_date}_${b.slot_hour}`));
      blocked = new Set(blocks.map((b) => `${b.slot_date}_${b.slot_hour}`));
    } catch {
      // Sem banco, mostramos a grade toda como indisponível em vez de aceitar
      // reservas que não seriam gravadas.
      dbError = true;
    }
  }

  const view: DayView[] = days.map((day) => ({
    iso: day.iso,
    slots: day.slots.map((slot) => ({
      id: slot.id,
      hour: slot.hour,
      status: dbError
        ? "blocked"
        : isSlotPast(day.iso, slot.hour, now)
          ? "past"
          : taken.has(slot.id)
            ? "taken"
            : blocked.has(slot.id)
              ? "blocked"
              : "free",
    })),
  }));

  return (
    <div className="wrap">
      <header>
        <div className="kicker">Monitoria</div>
        <h1>Agende seu horário</h1>
        <p>Terças e quintas · aulas de 1h, das 14h às 19h</p>
      </header>

      {dbError && (
        <div className="status-banner show">
          Não consegui carregar os horários agora. Recarregue a página em alguns instantes.
        </div>
      )}

      <Scheduler days={view} />

      <footer>Escolha um horário livre para reservar.</footer>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila e sobe**

```bash
npx tsc --noEmit && npm run build
```

Esperado: `Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: página do aluno lendo a grade do banco"
```

---

## Chunk 5: Autenticação do monitor

### Task 12: Sessão assinada

**Files:**
- Create: `lib/auth.ts`

- [ ] **Step 1: Criar `lib/auth.ts`**

Web Crypto, não o `crypto` do Node — o middleware roda no Edge, onde o módulo do Node não existe.

```ts
const SESSION_COOKIE = "monitor_session";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export { SESSION_COOKIE, THIRTY_DAYS_MS };

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET não configurada.");
  return value;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Token no formato "<expiraEmMs>.<assinatura>". */
export async function signSession(expiresAtMs: number): Promise<string> {
  const payload = String(expiresAtMs);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

/** Valida assinatura e validade. crypto.subtle.verify não vaza tempo. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(token.slice(dot + 1)) as unknown as ArrayBuffer,
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

/**
 * Compara a senha sem vazar tempo: em vez de comparar os textos, comparamos os
 * HMACs, que têm sempre o mesmo tamanho independentemente da entrada.
 */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.MONITOR_PASSWORD;
  if (!expected) throw new Error("MONITOR_PASSWORD não configurada.");
  const key = await hmacKey();
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(candidate)),
    crypto.subtle.sign("HMAC", key, enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: sessão do monitor em cookie assinado com HMAC"
```

---

### Task 13: Middleware e tela de login

**Files:**
- Create: `middleware.ts`
- Create: `app/monitor/login/page.tsx`
- Create: `app/monitor/actions.ts`
- Create: `app/monitor/layout.tsx`

- [ ] **Step 1: Criar `middleware.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const ok = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/monitor/login";
  url.search = "";
  return NextResponse.redirect(url);
}

// Protege /monitor/* inteiro, menos o próprio login (senão o redirect dá loop).
export const config = {
  matcher: ["/monitor", "/monitor/((?!login).*)"],
};
```

- [ ] **Step 2: Criar `app/monitor/actions.ts`**

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, THIRTY_DAYS_MS, passwordMatches, signSession } from "@/lib/auth";
import * as db from "@/lib/db";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Digite a senha." };

  if (!(await passwordMatches(password))) {
    // Atraso fixo para tornar a força bruta lenta. Não é rate limit de verdade:
    // o serverless não compartilha estado entre instâncias. A defesa real é a
    // senha ser forte.
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Senha incorreta." };
  }

  const expiresAt = Date.now() + THIRTY_DAYS_MS;
  (await cookies()).set(SESSION_COOKIE, await signSession(expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
  redirect("/monitor");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/monitor/login");
}

export async function cancelBooking(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  await db.cancelBooking(id);
  revalidatePath("/monitor");
  revalidatePath("/monitor/relatorio");
  revalidatePath("/");
}

export async function blockSlot(formData: FormData): Promise<void> {
  const iso = String(formData.get("iso") ?? "");
  const hour = Number(formData.get("hour"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isInteger(hour)) return;
  await db.blockSlot(iso, hour, null);
  revalidatePath("/monitor");
  revalidatePath("/");
}

export async function unblockSlot(formData: FormData): Promise<void> {
  const iso = String(formData.get("iso") ?? "");
  const hour = Number(formData.get("hour"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isInteger(hour)) return;
  await db.unblockSlot(iso, hour);
  revalidatePath("/monitor");
  revalidatePath("/");
}
```

Nota sobre `redirect()` dentro do `login`: o Next implementa `redirect` lançando uma exceção especial. Ele precisa ficar **fora** de `try/catch`, ou o catch engole o redirecionamento.

- [ ] **Step 3: Criar `app/monitor/login/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { login, type LoginState } from "../actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <div className="wrap" style={{ maxWidth: 380 }}>
      <header>
        <div className="kicker">Área do monitor</div>
        <h1>Entrar</h1>
      </header>

      <form action={formAction}>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" autoFocus
                 autoComplete="current-password" required />
        </div>
        {state.error && <div className="error-msg show">{state.error}</div>}
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Verificando..." : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Criar `app/monitor/layout.tsx`**

O middleware já garantiu a sessão; este layout só desenha a navegação.

```tsx
import Link from "next/link";
import { logout } from "./actions";

export default function MonitorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <nav className="monitor-nav">
        <Link href="/monitor">Agenda</Link>
        <Link href="/monitor/relatorio">Relatório</Link>
        <span className="spacer" />
        <form action={logout}>
          <button type="submit" className="btn-mini">Sair</button>
        </form>
      </nav>
      {children}
    </div>
  );
}
```

Nota: o layout do `/monitor/login` herda este arquivo? Não — `login` fica em `app/monitor/login/`, que **é** filho de `app/monitor/`, então herdaria a navegação e o botão Sair numa tela onde o usuário não está logado. Resolva movendo o login para um route group fora do layout: renomeie `app/monitor/layout.tsx` de forma que o login não o herde, criando `app/monitor/(painel)/layout.tsx` e movendo `page.tsx` e `relatorio/` para dentro de `(painel)/`. O route group não altera as URLs. Estrutura final:

```
app/monitor/
  login/page.tsx            ← sem layout do painel
  (painel)/
    layout.tsx              ← navegação + Sair
    page.tsx                ← /monitor
    relatorio/page.tsx      ← /monitor/relatorio
    relatorio/csv/route.ts
  actions.ts
```

- [ ] **Step 5: Gerar um `.env.local` para desenvolvimento**

```bash
cd "d:/Donwloads/APPS/Sistema de agendamento de aula"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

Crie `.env.local` com esse `SESSION_SECRET`, um `MONITOR_PASSWORD` qualquer para teste, e a `DATABASE_URL` do Neon. **Confirme que `.env*.local` está no `.gitignore` antes de salvar.**

- [ ] **Step 6: Verificar o redirecionamento**

```bash
npm run dev
```

Abra `http://localhost:3000/monitor`. Esperado: redireciona para `/monitor/login`. Digite a senha errada → "Senha incorreta." Digite a certa → cai em `/monitor`.

- [ ] **Step 7: Commit**

```bash
git add middleware.ts app/monitor/
git commit -m "feat: login do monitor com senha única e guarda no middleware"
```

---

## Chunk 6: Painel do monitor

### Task 14: Agenda

**Files:**
- Create: `app/monitor/(painel)/page.tsx`
- Create: `components/CancelButton.tsx`
- Create: `components/BlockToggle.tsx`

- [ ] **Step 1: Criar `components/CancelButton.tsx`**

```tsx
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
      <button type="submit" className="btn-mini danger">Cancelar</button>
    </form>
  );
}
```

- [ ] **Step 2: Criar `components/BlockToggle.tsx`**

```tsx
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
```

- [ ] **Step 3: Criar `app/monitor/(painel)/page.tsx`**

Ao contrário da página pública, aqui **tudo** aparece: nome, série, matéria e assunto. É o ponto do app que justifica o login.

```tsx
import { buildDays, isSlotPast } from "@/lib/slots";
import { getBookings, getBlockedSlots, type Booking } from "@/lib/db";
import { longDate, timeLabel } from "@/lib/format";
import { CancelButton } from "@/components/CancelButton";
import { BlockToggle } from "@/components/BlockToggle";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const now = new Date();
  const days = buildDays(now);
  if (days.length === 0) {
    return <div className="empty">Nenhuma data de monitoria nas próximas semanas.</div>;
  }

  const from = days[0].iso;
  const to = days[days.length - 1].iso;
  const [bookings, blocks] = await Promise.all([
    getBookings(from, to),
    getBlockedSlots(from, to),
  ]);

  const bySlot = new Map<string, Booking>(
    bookings.map((b) => [`${b.slot_date}_${b.slot_hour}`, b])
  );
  const blockedSet = new Set(blocks.map((b) => `${b.slot_date}_${b.slot_hour}`));

  const total = bookings.length;

  return (
    <>
      <header style={{ textAlign: "left", marginBottom: 18 }}>
        <div className="kicker">Agenda</div>
        <h1>Próximas monitorias</h1>
        <p>
          {total === 0
            ? "Nenhuma reserva nas próximas semanas."
            : `${total} ${total === 1 ? "reserva" : "reservas"} nas próximas semanas.`}
        </p>
      </header>

      {days.map((day) => (
        <section key={day.iso} className="day-card">
          <h3>{longDate(day.iso)}</h3>
          {day.slots.map((slot) => {
            const booking = bySlot.get(slot.id);
            const blocked = blockedSet.has(slot.id);
            const past = isSlotPast(day.iso, slot.hour, now);

            return (
              <div className="slot-row" key={slot.id}>
                <div className="hour">{timeLabel(slot.hour)}</div>
                <div className="detail">
                  {booking ? (
                    <>
                      <strong>{booking.student_name}</strong> · {booking.grade}
                      <br />
                      {booking.subject}
                      {" — "}
                      {booking.topic ?? "resolução de questões"}
                    </>
                  ) : blocked ? (
                    "Horário fechado por você"
                  ) : past ? (
                    "Encerrado"
                  ) : (
                    "Livre"
                  )}
                </div>
                <div className="row-actions">
                  {booking && (
                    <CancelButton id={booking.id} studentName={booking.student_name} />
                  )}
                  {!booking && !past && (
                    <BlockToggle iso={day.iso} hour={slot.hour} blocked={blocked} />
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Verificar no navegador**

```bash
npm run dev
```

Faça uma reserva em `/`, entre em `/monitor` e confirme: a reserva aparece com nome, série, matéria e assunto. Clique em "Fechar horário" num slot livre e confirme que ele vira "Indisponível" na página do aluno. Clique em "Cancelar" e confirme que o horário volta a ficar livre em `/`.

- [ ] **Step 5: Commit**

```bash
git add "app/monitor/(painel)/page.tsx" components/CancelButton.tsx components/BlockToggle.tsx
git commit -m "feat: agenda do monitor com cancelamento e bloqueio de horário"
```

---

### Task 15: Relatório e CSV

**Files:**
- Create: `app/monitor/(painel)/relatorio/page.tsx`
- Create: `app/monitor/(painel)/relatorio/csv/route.ts`

- [ ] **Step 1: Criar `relatorio/page.tsx`**

No celular a listagem vira cards; a tabela aparece só a partir de 720px, e mesmo assim dentro de `.table-scroll`.

```tsx
import { getBookingsForReport, getSubjectCounts, getGradeCounts } from "@/lib/db";
import { brDate, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RelatorioPage() {
  const [bookings, subjects, grades] = await Promise.all([
    getBookingsForReport(),
    getSubjectCounts(),
    getGradeCounts(),
  ]);

  return (
    <>
      <header style={{ textAlign: "left", marginBottom: 18 }}>
        <div className="kicker">Relatório</div>
        <h1>Histórico de monitorias</h1>
      </header>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">Total de aulas</div>
          <div className="value">{bookings.length}</div>
        </div>
        <div className="stat">
          <div className="label">Matéria mais pedida</div>
          <div className="value" style={{ fontSize: 17 }}>
            {subjects[0] ? `${subjects[0].subject} (${subjects[0].total})` : "—"}
          </div>
        </div>
        <div className="stat">
          <div className="label">Série mais frequente</div>
          <div className="value" style={{ fontSize: 17 }}>
            {grades[0] ? `${grades[0].grade} (${grades[0].total})` : "—"}
          </div>
        </div>
      </div>

      <div className="monitor-nav">
        <a href="/monitor/relatorio/csv">Baixar CSV</a>
      </div>

      {bookings.length === 0 ? (
        <div className="empty">Nenhuma reserva registrada ainda.</div>
      ) : (
        <>
          <div className="only-wide table-scroll">
            <table className="report">
              <thead>
                <tr>
                  <th>Data</th><th>Hora</th><th>Aluno</th>
                  <th>Série</th><th>Matéria</th><th>Assunto</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{brDate(b.slot_date)}</td>
                    <td>{timeLabel(b.slot_hour)}</td>
                    <td>{b.student_name}</td>
                    <td>{b.grade}</td>
                    <td>{b.subject}</td>
                    <td style={{ whiteSpace: "normal" }}>
                      {b.topic ?? "resolução de questões"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="only-narrow report-cards">
            {bookings.map((b) => (
              <div className="day-card" key={b.id}>
                <h3 style={{ textTransform: "none" }}>
                  {brDate(b.slot_date)} · {timeLabel(b.slot_hour)}
                </h3>
                <div className="detail">
                  <strong>{b.student_name}</strong> · {b.grade}
                  <br />
                  {b.subject} — {b.topic ?? "resolução de questões"}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Criar `relatorio/csv/route.ts`**

Detalhes que fazem o arquivo abrir certo no Excel em português: BOM UTF-8 (senão acentos viram lixo) e ponto-e-vírgula como separador (o Excel pt-BR usa vírgula como decimal).

```ts
import { getBookingsForReport } from "@/lib/db";
import { brDate, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

function cell(value: string): string {
  // Prefixar `'` em valores que começam com =, +, - ou @ evita injeção de
  // fórmula quando o CSV é aberto numa planilha.
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
```

- [ ] **Step 3: Verificar**

```bash
npm run dev
```

Abra `/monitor/relatorio`: os três cartões de estatística e a listagem aparecem. Estreite a janela abaixo de 720px e confirme que a tabela dá lugar aos cards. Clique em "Baixar CSV" e abra o arquivo — acentos corretos, colunas separadas.

- [ ] **Step 4: Rodar tudo**

```bash
npm test && npx tsc --noEmit && npm run build
```

Esperado: 13 testes passando, sem erro de tipo, build compilando.

- [ ] **Step 5: Commit**

```bash
git add "app/monitor/(painel)/relatorio"
git commit -m "feat: relatório do monitor com agregados e export CSV"
```

---

## Chunk 7: Deploy

### Task 16: Banco no Neon

- [ ] **Step 1: Criar o projeto na Vercel**

Importe o repositório em [vercel.com/new](https://vercel.com/new). O primeiro build vai **falhar**, porque não há `DATABASE_URL` ainda — é esperado.

- [ ] **Step 2: Criar o banco**

No projeto na Vercel: **Storage → Create Database → Neon → Continue**. Autorize. A Vercel injeta `DATABASE_URL` (e variantes) nas variáveis de ambiente do projeto automaticamente.

- [ ] **Step 3: Rodar o schema**

Abra o banco no painel do Neon → **SQL Editor** → cole o conteúdo de `scripts/init-db.sql` → Run.

Confirme:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

Esperado: `bookings` e `blocked_slots`.

- [ ] **Step 4: Confirmar o índice parcial**

```sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'bookings';
```

Esperado: `bookings_slot_unique` com `WHERE (cancelled_at IS NULL)` no final. Se o `WHERE` não estiver lá, o cancelamento não vai liberar o horário — recrie o índice.

---

### Task 17: Variáveis e deploy

- [ ] **Step 1: Adicionar as variáveis na Vercel**

**Settings → Environment Variables**, nos três ambientes (Production, Preview, Development):

| Nome | Valor |
|---|---|
| `MONITOR_PASSWORD` | a senha que o monitor vai usar |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

A `DATABASE_URL` já foi criada pela integração do Neon — não mexa.

- [ ] **Step 2: Redeploy**

**Deployments → ... → Redeploy** no último deploy. Esperado: build verde.

- [ ] **Step 3: Verificar em produção**

Pelo **celular**, não pelo desktop:

- [ ] `/` carrega, as abas rolam na horizontal, os horários estão legíveis
- [ ] reservar funciona e o horário vira "Reservado" para outro navegador
- [ ] `/monitor` redireciona para o login
- [ ] senha errada dá erro; senha certa entra
- [ ] a agenda mostra a reserva com nome, série, matéria e assunto
- [ ] "Fechar horário" reflete na página do aluno
- [ ] "Cancelar" devolve o horário à grade
- [ ] o CSV baixa e abre com acentos corretos
- [ ] no modo escuro do celular o contraste continua legível

- [ ] **Step 4: Atualizar o handoff**

Reescreva `handoff.md` refletindo a nova arquitetura: URL de produção, que os dados agora vivem no Neon, como entrar no painel, onde mudar dias/horários (`lib/constants.ts`), e como rodar local. O handoff atual descreve o `localStorage` e a capability `db` do Claude, que deixaram de existir.

- [ ] **Step 5: Commit final**

```bash
git add handoff.md
git commit -m "docs: atualizar handoff para a arquitetura Next.js + Neon"
git push
```

---

## Verificação final

- [ ] `npm test` — 13 testes passando
- [ ] `npx tsc --noEmit` — sem erros
- [ ] `npm run build` — compila
- [ ] Nenhum segredo commitado: `git log -p | grep -iE "SESSION_SECRET=.|MONITOR_PASSWORD=.|postgres://"` não retorna nada
- [ ] `.env.local` está ignorado: `git check-ignore -v .env.local` confirma
- [ ] Checklist de produção da Task 17 Step 3 inteiro marcado
