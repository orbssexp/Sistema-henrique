import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * No Next 16 o antigo middleware.ts chama-se proxy.ts e roda em runtime Node.
 *
 * A documentação do Next é explícita que o proxy é uma checagem OTIMISTA, não
 * uma solução de autorização: ele evita a viagem até a página, mas a garantia
 * real está em app/monitor/(painel)/layout.tsx, que valida a sessão de novo.
 */
export async function proxy(request: NextRequest) {
  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/monitor/login";
  url.search = "";
  return NextResponse.redirect(url);
}

// Protege /monitor e tudo abaixo, menos o próprio login — senão o redirect
// entraria em loop infinito.
export const config = {
  matcher: ["/monitor", "/monitor/((?!login).*)"],
};
