/**
 * Aviso de falha de carregamento, renderizado NO SERVIDOR.
 *
 * O error.tsx do route group continua como rede de segurança para erros
 * inesperados, mas ele só aparece depois da hidratação no cliente — para uma
 * falha previsível como banco fora do ar, a mensagem precisa vir no HTML.
 */
export function LoadError({ children }: { children?: React.ReactNode }) {
  return (
    <div className="status-banner show" role="alert">
      {children ?? "Não consegui carregar os dados agora. Recarregue a página em alguns instantes."}
    </div>
  );
}
