# Handoff — Agendamento de Monitoria

## O que é

Um app Next.js onde alunos marcam horário de monitoria e o monitor acompanha a agenda
por um painel com senha.

Substitui a versão anterior, que era um HTML de arquivo único. O motivo da troca: naquela
versão as reservas ficavam no `localStorage` do navegador do aluno, então cada aluno via
uma lista diferente e o monitor não via nada. Agora tudo mora num Postgres.

A versão antiga está preservada em `reference/index.html`, e é dela que vem todo o visual.

## Stack

- **Next.js 16** (App Router), TypeScript
- **Postgres no Neon**, acessado com `@neondatabase/serverless` e SQL escrito à mão
- **Vercel** para hospedagem
- Sem ORM, sem Tailwind, sem biblioteca de estado — CSS é uma folha única em
  `app/globals.css`, portada da referência

## Regras de horário

- Dias: **terças e quintas**
- Blocos de **1 hora**, das **14h às 19h** (14h, 15h, 16h, 17h, 18h)
- As datas são geradas a partir de hoje, três semanas à frente, então o site nunca "fica velho"
- O monitor pode fechar horários pontuais (feriado, imprevisto) pelo painel

## Fluxo do aluno

1. Abre `/`, escolhe uma data nas abas e um horário livre.
2. Preenche nome, série (dropdown), matéria (texto livre) e o que quer estudar
   (resolução de questões, ou um conteúdo específico digitado).
3. Confirma. O horário passa a aparecer como **"Reservado"** para os próximos visitantes.

**Horário ocupado mostra só "Reservado"** — sem nome, série ou matéria. O site é público, e
nome de aluno somado à matéria em que ele tem dificuldade é dado sensível. Esses detalhes
aparecem apenas no painel do monitor.

## Fluxo do monitor

- `/monitor/login` — digita a senha (a de `MONITOR_PASSWORD`). A sessão dura 30 dias.
- `/monitor` — **Agenda**: os próximos dias, cada horário com quem reservou (nome, série,
  matéria, assunto). Dá para cancelar uma reserva e fechar/liberar um horário.
- `/monitor/relatorio` — **Relatório**: histórico completo, total de aulas, matéria mais
  pedida, série mais frequente, e botão para baixar CSV.

## Como os dados são salvos

Duas tabelas, criadas por `scripts/init-db.sql`:

- `bookings` — uma linha por reserva. Cancelar não apaga: preenche `cancelled_at`.
- `blocked_slots` — horários que o monitor fechou.

A garantia contra dois alunos pegarem o mesmo horário é **do banco**, não da aplicação: um
índice único parcial em `(slot_date, slot_hour) WHERE cancelled_at IS NULL`. Se dois
alunos confirmarem no mesmo instante, um grava e o outro recebe "esse horário acabou de ser
reservado por outra pessoa". O índice ser *parcial* é o que permite o cancelamento devolver
o horário à grade sem apagar o histórico do relatório.

## Rodar local

```bash
npm install
cp .env.local.example .env.local   # preencha as três variáveis
npm run dev                        # http://localhost:3000
```

Variáveis:

| Nome | O que é |
|---|---|
| `DATABASE_URL` | Connection string do Neon |
| `MONITOR_PASSWORD` | Senha que o monitor digita |
| `SESSION_SECRET` | Segredo do cookie. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Outros comandos: `npm test` (13 testes), `npm run build`, `npx tsc --noEmit`.

Sem `DATABASE_URL` o app **não quebra**: a página do aluno mostra um aviso e deixa todos os
horários indisponíveis, em vez de aceitar reservas que não seriam gravadas.

## Deploy

1. Importar o repositório em [vercel.com/new](https://vercel.com/new). O primeiro build falha
   por falta de `DATABASE_URL` — é esperado.
2. No projeto: **Storage → Create Database → Neon → Continue**. A Vercel injeta a
   `DATABASE_URL` sozinha.
3. No painel do Neon → **SQL Editor** → rodar `scripts/init-db.sql`.
4. **Settings → Environment Variables**: adicionar `MONITOR_PASSWORD` e `SESSION_SECRET`
   nos três ambientes.
5. Redeploy.

## Onde mexer

| Quero mudar | Arquivo |
|---|---|
| Dias da semana, horários, semanas à frente, lista de séries | `lib/constants.ts` |
| Qualquer coisa de data ou fuso | `lib/slots.ts` |
| Qualquer query | `lib/db.ts` — nenhuma página escreve SQL |
| Visual | `app/globals.css` |
| Senha ou duração da sessão | `lib/auth.ts` e as env vars |

## Coisas que vão te morder se você não souber

**Fuso horário.** A Vercel roda em UTC, o Brasil em UTC−3. Toda decisão de data passa por
`lib/slots.ts`, que usa `America/Sao_Paulo` explicitamente. Se você trocar isso por
`new Date()` direto, entre 21h e meia-noite o app mostra a grade do dia errado — e o bug só
aparece à noite, só em produção. Os testes em `lib/slots.test.ts` existem para impedir isso;
não os apague.

**O driver devolve `DATE` como objeto `Date`.** Um `getFullYear()` ingênuo erraria a data em
um dia em *todas* as reservas. A função `toIso()` em `lib/db.ts` usa `getUTC*` de propósito.

**`proxy.ts` é o antigo `middleware.ts`.** O Next 16 renomeou. E ele é só uma checagem
otimista: a sessão é validada de novo em `app/monitor/(painel)/layout.tsx`. Não remova essa
segunda validação.

**O route group `(painel)`** existe para que `/monitor/login` não herde a navegação do
painel. Ele não aparece nas URLs.

**O CSV precisa do BOM e do ponto-e-vírgula.** Sem isso o Excel em português estraga os
acentos e joga tudo numa coluna. Ver `app/monitor/(painel)/relatorio/csv/route.ts`.

## Limitações aceitas

- **Nada impede um aluno reservar em nome de outro.** Não há identificação. O monitor pode
  cancelar pelo painel.
- **O atraso de 600ms no login errado não é rate limit de verdade** — o serverless não
  compartilha estado entre instâncias. A defesa real é a senha ser forte.
- **A grade só existe no código.** Mudar dias ou horários exige editar `lib/constants.ts` e
  refazer o deploy.
- **O free tier do Neon hiberna** quando ocioso: a primeira visita depois de um tempo parado
  pode levar alguns segundos.

## Documentos

- Design e decisões: [`docs/superpowers/specs/2026-09-24-agendamento-monitoria-nextjs-design.md`](docs/superpowers/specs/2026-09-24-agendamento-monitoria-nextjs-design.md)
- Plano de implementação: [`docs/superpowers/plans/2026-09-24-agendamento-monitoria-nextjs.md`](docs/superpowers/plans/2026-09-24-agendamento-monitoria-nextjs.md)
