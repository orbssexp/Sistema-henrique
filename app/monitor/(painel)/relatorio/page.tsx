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
      <header className="panel-header">
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
          <div className="value small">
            {subjects[0] ? `${subjects[0].subject} (${subjects[0].total})` : "—"}
          </div>
        </div>
        <div className="stat">
          <div className="label">Série mais frequente</div>
          <div className="value small">
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
          {/* Tabela só a partir de 720px, e mesmo assim com escape horizontal. */}
          <div className="only-wide table-scroll">
            <table className="report">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Hora</th>
                  <th>Aluno</th>
                  <th>Série</th>
                  <th>Matéria</th>
                  <th>Assunto</th>
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
                    <td className="wrap">{b.topic ?? "resolução de questões"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* No celular, cards em vez de tabela espremida. */}
          <div className="only-narrow report-cards">
            {bookings.map((b) => (
              <div className="day-card" key={b.id}>
                <h3 className="plain">
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
