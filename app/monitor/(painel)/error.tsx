"use client";

/**
 * Cobre a agenda e o relatório. Sem isto, uma falha de banco mostra ao monitor
 * a tela de erro crua do Next — a página do aluno já trata esse caso com um
 * aviso, e o painel precisa do mesmo cuidado.
 */
export default function PainelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="empty">
      <p>Não consegui carregar os dados agora.</p>
      <button type="button" className="btn-mini" onClick={reset}>
        Tentar de novo
      </button>
    </div>
  );
}
