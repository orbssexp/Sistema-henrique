import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { logout } from "../actions";

/**
 * Route group (painel): agrupa as telas autenticadas sem alterar as URLs, para
 * que /monitor/login NÃO herde esta navegação — senão a tela de login
 * apareceria com "Agenda / Relatório / Sair" para quem ainda não entrou.
 *
 * A sessão é validada aqui de novo, e não só no proxy: a doc do Next diz que o
 * proxy é checagem otimista, não autorização.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const authorized = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!authorized) redirect("/monitor/login");

  return (
    <div className="wrap">
      <nav className="monitor-nav">
        <Link href="/monitor">Agenda</Link>
        <Link href="/monitor/relatorio">Relatório</Link>
        <span className="spacer" />
        <form action={logout}>
          <button type="submit" className="btn-mini">
            Sair
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
