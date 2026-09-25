# Design — Agendamento de Monitoria em Next.js

Data: 2026-09-24
Status: aprovado, pronto para virar plano de implementação

## Problema

Existe hoje um site de página única (`reference/index.html`, 602 linhas, sem framework) onde alunos marcam monitoria de matemática. Ele funciona, mas tem duas limitações que o tornam inutilizável fora do claude.ai:

1. **Os dados não são compartilhados.** O arquivo usa a capability `db` do runtime de artifacts do Claude e, quando ela não existe (aluno sem conta Claude, ou site hospedado em qualquer outro lugar), cai para `localStorage`. A reserva fica salva só no navegador daquele aluno. Nenhum outro aluno e, principalmente, nenhum monitor enxerga.
2. **O monitor não tem onde olhar.** Não existe painel. O monitor só veria as reservas abrindo o mesmo site que os alunos, e só se a sincronização estivesse funcionando.

Além disso o escopo cresceu: a monitoria não é mais só de matemática, e o monitor precisa poder fechar horários pontualmente (feriado, imprevisto).

## Objetivo

Um app Next.js hospedado na Vercel, com banco Postgres, onde:

- o aluno escolhe uma data e um horário livre, preenche nome, série, matéria e assunto, e confirma;
- o monitor entra com senha e vê a agenda dos próximos dias e um relatório histórico de todas as reservas;
- tudo funciona bem no celular, que é como os alunos vão acessar.

## Não-objetivos

Ficam de fora desta entrega, deliberadamente:

- conta/login para o aluno;
- notificação por e-mail ou WhatsApp;
- o monitor editar a grade de dias e horários pela interface (a grade é constante no código);
- múltiplos monitores;
- domínio próprio pago.

## Decisões

| Assunto | Decisão | Motivo |
|---|---|---|
| Hospedagem | Vercel | Free tier, deploy por git push, é onde o Next roda melhor |
| Banco | Neon Postgres, criado pelo marketplace da Vercel | Nenhum cadastro novo além da própria Vercel; a `DATABASE_URL` é injetada automaticamente no projeto |
| Acesso a dados | `@neondatabase/serverless` com SQL puro | Duas tabelas não justificam um ORM |
| Comunicação cliente/servidor | Server Components + Server Actions | Sem API REST, sem `fetch` no cliente, sem biblioteca de estado |
| Estilo | CSS Modules reusando as variáveis `:root` da referência | Preserva o visual atual (serif, paleta verde/laranja, tema claro/escuro automático) sem adicionar Tailwind |
| Login do monitor | Senha única em variável de ambiente + cookie httpOnly assinado | Um monitor só; não precisa de tabela de usuários nem recuperação de senha |
| Matéria | Campo de texto livre | Escolha do usuário; o relatório agrupa normalizando (trim + case-insensitive) |
| Grade de horários | Fixa no código (terças e quintas, 14h–19h, próximas 3 semanas) + bloqueio manual pelo monitor | Entrega rápida sem perder a flexibilidade para imprevistos |
| Privacidade na página pública | Horário ocupado mostra apenas "Reservado" | O site é público; nome de aluno somado à matéria em que ele tem dificuldade é dado sensível |
| Testes | Vitest apenas sobre a lógica de datas | É o único ponto com risco de bug silencioso |

## Arquitetura

### Fluxo do aluno

```
GET /  →  Server Component lê bookings + blocked_slots do Neon
       →  monta a grade das próximas 3 semanas (ter/qui, 14h-19h)
       →  marca cada slot como livre / reservado / bloqueado / passado
       →  renderiza abas de dia + grade

clique em slot livre  →  modal (Client Component) com o formulário
confirmar             →  Server Action createBooking()
                      →  INSERT; índice único decide o vencedor
                      →  revalidatePath('/')
```

### Fluxo do monitor

```
GET /monitor  →  middleware verifica cookie assinado
              →  sem cookie: redireciona para /monitor/login
              →  com cookie: Agenda dos próximos dias

/monitor/relatorio  →  histórico completo, filtro por período,
                       contagem por matéria e por série, export CSV

Ações: cancelBooking(id), blockSlot(data, hora), unblockSlot(data, hora)
```

### Concorrência

A referência usava um lease distribuído (`ref.acquire({ ttlMs: 6000 })`) antes de gravar. Aqui isso é desnecessário: o índice único parcial em `(slot_date, slot_hour) WHERE cancelled_at IS NULL` faz o banco rejeitar a segunda reserva simultânea. A Server Action captura a violação de unicidade (código Postgres `23505`) e devolve ao aluno "esse horário acabou de ser reservado por outra pessoa", recarregando a grade. É mais simples que o lease e não tem janela de corrida.

A ação também precisa recusar a reserva quando o slot está bloqueado ou já passou — as duas checagens rodam no servidor, dentro da mesma transação do INSERT, nunca confiando no que o cliente mandou.

### Fuso horário

Este é o ponto mais fácil de errar e o mais difícil de perceber. A Vercel roda em UTC; o Brasil está em UTC−3. Se a grade for gerada com `new Date()` no servidor, entre 21h e meia-noite no horário de Brasília o app já considera que virou o dia e mostra a grade errada — um bug que só aparece à noite, e só em produção.

Portanto:

- toda geração de data usa explicitamente o fuso `America/Sao_Paulo`, via `Intl.DateTimeFormat` com `timeZone`;
- `slot_date` é `DATE` no Postgres, não `timestamptz` — é uma data de calendário ("quinta, 2 de outubro"), não um instante no tempo;
- a decisão de "este horário já passou" compara contra o agora convertido para São Paulo;
- tudo isso vive em `lib/slots.ts` como funções puras, que recebem o "agora" por parâmetro para poderem ser testadas.

## Schema

```sql
CREATE TABLE bookings (
  id            BIGSERIAL PRIMARY KEY,
  slot_date     DATE        NOT NULL,
  slot_hour     SMALLINT    NOT NULL,
  student_name  TEXT        NOT NULL,
  grade         TEXT        NOT NULL,
  subject       TEXT        NOT NULL,   -- matéria, texto livre
  topic         TEXT,                   -- assunto; NULL = resolução de questões
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX bookings_slot_unique
  ON bookings (slot_date, slot_hour)
  WHERE cancelled_at IS NULL;

CREATE INDEX bookings_date_idx ON bookings (slot_date);

CREATE TABLE blocked_slots (
  slot_date  DATE        NOT NULL,
  slot_hour  SMALLINT    NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (slot_date, slot_hour)
);
```

O índice único é **parcial**: quando o monitor cancela uma reserva, `cancelled_at` é preenchido, a linha sai do índice e o horário volta a ficar disponível — sem perder o registro para o relatório.

`subject` guarda o texto como o aluno digitou. A agregação do relatório normaliza na consulta (`lower(btrim(subject))`) para que "Matemática", "matematica" e "matemática " caiam no mesmo grupo, preservando a grafia original na listagem.

## Estrutura de arquivos

```
app/
  layout.tsx              raiz, metadata, fontes
  globals.css             variáveis :root portadas da referência, reset
  page.tsx                aluno (Server Component)
  actions.ts              createBooking
  monitor/
    login/page.tsx        formulário de senha
    layout.tsx            guarda de sessão + navegação Agenda/Relatório
    page.tsx              agenda dos próximos dias
    relatorio/page.tsx    histórico e agregados
    actions.ts            login, logout, cancelBooking, blockSlot, unblockSlot
components/
  DayTabs.tsx             abas de data (client, controla a aba ativa)
  SlotGrid.tsx            grade de horários
  BookingModal.tsx        formulário de reserva
  MonitorDay.tsx          um dia na agenda do monitor
  ReportTable.tsx         tabela/cards do relatório + botão CSV
lib/
  db.ts                   cliente Neon e todas as queries
  slots.ts                puro: geração da grade, fuso, "já passou"
  auth.ts                 assinar/verificar cookie de sessão (HMAC, Web Crypto)
  format.ts               rótulos de data e hora em pt-BR
  constants.ts            START_HOUR, END_HOUR, WEEKDAYS, WEEKS_AHEAD, séries
middleware.ts             protege /monitor/*
scripts/
  init-db.sql             o schema acima, para rodar uma vez no Neon
```

Nenhuma página escreve SQL: tudo passa por `lib/db.ts`. Trocar o Neon por outro Postgres depois mexe em um arquivo só.

## Autenticação do monitor

- `MONITOR_PASSWORD` e `SESSION_SECRET` como variáveis de ambiente na Vercel.
- A rota de login compara a senha em tempo constante e, se bater, grava um cookie `monitor_session` com `httpOnly`, `secure`, `sameSite=lax`, validade de 30 dias.
- O valor do cookie é `expiraEm.assinaturaHMAC`, assinado com `SESSION_SECRET` usando Web Crypto (funciona no runtime Edge do middleware, ao contrário do `crypto` do Node).
- O middleware valida assinatura e validade antes de deixar passar por `/monitor/*`.
- Rate limit simples no login (contador em memória por IP) para desencorajar força bruta. É best-effort: o serverless não compartilha memória entre instâncias, e isso está documentado como limitação aceita, não como proteção real.

## Responsividade

Mobile-first, já que os alunos vão acessar pelo celular.

- Grade de horários: `grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`, herdado da referência.
- Abas de dia: faixa com rolagem horizontal e `-webkit-overflow-scrolling: touch`.
- Modal: largura total com margem no celular, máximo de 380px no desktop.
- Painel do monitor: cards empilhados no celular; a tabela do relatório aparece só a partir de 720px, e mesmo assim dentro de um contêiner com `overflow-x: auto`.
- `viewport-fit=cover` e `env(safe-area-inset-*)` preservados da referência, para iPhone com notch.
- Alvos de toque com no mínimo 44px de altura.

## Testes

Vitest sobre `lib/slots.ts`, que é puro e recebe o "agora" por parâmetro:

- gera apenas terças e quintas dentro da janela de 3 semanas;
- gera cinco blocos por dia (14, 15, 16, 17, 18);
- com o agora em 2026-10-01 23:30 em São Paulo (já 2026-10-02 em UTC), a grade ainda começa em 2026-10-01;
- um slot das 14h no dia de hoje, com o agora às 16h, é marcado como passado;
- um slot em dia futuro nunca é marcado como passado.

O restante (fluxo de reserva, painel, deploy) é verificado rodando o app. Teste de integração contra Postgres foi descartado por exigir Docker na máquina do usuário.

## Plano de deploy

1. `npm create next-app` com TypeScript e App Router, sem Tailwind.
2. Desenvolver e rodar local com um `.env.local` apontando para o Neon (mesmo banco, é um projeto pessoal).
3. `git init`, primeiro commit, criar repositório no GitHub.
4. Importar o repositório na Vercel.
5. Na Vercel: Storage → Create Database → Neon → autorizar. A `DATABASE_URL` entra sozinha.
6. Rodar `scripts/init-db.sql` uma vez no SQL editor do Neon.
7. Adicionar `MONITOR_PASSWORD` e `SESSION_SECRET` nas variáveis de ambiente da Vercel.
8. Redeploy, testar reserva pelo celular e painel do monitor.

## Riscos conhecidos

- **Ninguém impede um aluno de reservar em nome de outro.** Não há identificação. É aceito: o público é pequeno e conhecido, e o monitor pode cancelar pelo painel.
- **O rate limit do login não é confiável em serverless.** A defesa real é uma senha forte.
- **A grade só existe no código.** Mudar dias ou horários exige editar `lib/constants.ts` e refazer o deploy.
- **Free tier do Neon hiberna o banco quando ocioso.** A primeira requisição depois de um tempo parado pode levar alguns segundos.
