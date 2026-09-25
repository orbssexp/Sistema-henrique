# Handoff — Site de Agendamento de Monitoria de Matemática

## O que é

Um site de página única (HTML/CSS/JS, sem frameworks) para alunos marcarem horário de monitoria de matemática com o monitor.

## Onde está publicado

- **Claude Artifact (versão principal, com sincronização):**
  https://claude.ai/artifact/1MHXcYWTwqbg8mwReduz65
- **Arquivo-fonte:** `monitoria.html` (self-contained, um arquivo só)
- Também pode ser hospedado em qualquer serviço estático (Netlify, GitHub Pages etc.) — o arquivo funciona sozinho, sem servidor.

## Regras de horário

- Dias: **terças e quintas**
- Blocos de **1 hora**, das **14h às 19h**, sem intervalo (14h, 15h, 16h, 17h, 18h)
- As datas são geradas automaticamente a partir da data atual (próximas 3 semanas) — não são fixas no código, então o site nunca "fica velho".

## Fluxo do aluno

1. Escolhe uma data (aba) e um horário livre.
2. Preenche: nome, série (do 6º ano ao cursinho/vestibular, dropdown fixo) e o que quer estudar (resolução de questões livre, ou conteúdo específico digitado).
3. Confirma → o horário fica marcado como "Reservado" com nome, série e assunto visíveis para os próximos visitantes.

## Como os dados são salvos (parte técnica importante)

O site tenta usar a capability `db` do runtime de artifacts do Claude (`window.claude.use("db")`), que dá um banco compartilhado em tempo real entre todos que acessam o link.

- **Se disponível** (visitante logado com permissão no artifact): reservas ficam sincronizadas para todo mundo, com proteção contra dois alunos pegarem o mesmo horário ao mesmo tempo (usa `.acquire()` antes de gravar).
- **Se não disponível** (aluno sem conta Claude, ou site hospedado fora do claude.ai, tipo Netlify): o site cai automaticamente para `localStorage` — a reserva só fica salva no navegador daquele aluno, sem sincronizar com os outros. O site mostra um aviso discreto no topo quando isso acontece.

Essa é a principal limitação atual: **fora do claude.ai, não existe hoje uma forma nativa e gratuita de sincronizar reservas entre visitantes sem servidor próprio.**

## Estrutura do arquivo

Tudo em `monitoria.html`:
- `<style>` — todo o CSS (tema claro/escuro automático via `prefers-color-scheme`)
- `<script>` — toda a lógica:
  - `buildDays()` — gera as próximas terças/quintas
  - `renderTabs()` / `renderSlots()` — desenham a interface
  - `openBookingModal()` — formulário de reserva
  - `submitBooking()` — grava a reserva (compartilhada ou local)
  - `initData()` — detecta se `db` está disponível e liga tudo

## Como editar no futuro

- Mudar dias/horários: editar `START_HOUR`, `END_HOUR` e a condição `wd === 2 || wd === 4` (2 = terça, 4 = quinta) em `buildDays()`.
- Mudar opções de série: editar a lista de `<option>` dentro de `openBookingModal()`.
- Depois de editar, republicar no mesmo link do Artifact (mantém a mesma URL) ou re-subir no Netlify.

## Ideias para evolução (não implementadas)

- Painel só para o monitor ver/cancelar reservas.
- Confirmação por e-mail/WhatsApp além do registro no site.
- Domínio próprio pago em vez de subdomínio gratuito.
