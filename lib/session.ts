import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";

/** Há um cookie de sessão de monitor válido nesta requisição? */
export async function isMonitor(): Promise<boolean> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Barra a execução quando não há sessão de monitor.
 *
 * Toda Server Action do painel chama isto na primeira linha. O motivo está na
 * documentação do Next: uma Server Action é um endpoint POST público,
 * endereçável pelo id dela, e esse id vive num chunk JavaScript que qualquer
 * um baixa sem login. O proxy protege a ROTA /monitor, não a action — um POST
 * para "/" com o id certo não passa pelo proxy nem pelo layout do painel.
 *
 * Por isso a autorização precisa morar dentro de cada action, e não só na
 * borda. Ver node_modules/next/dist/docs/01-app/02-guides/data-security.md.
 */
export async function requireMonitor(): Promise<void> {
  if (!(await isMonitor())) {
    throw new Error("Não autorizado: esta ação exige sessão de monitor.");
  }
}
