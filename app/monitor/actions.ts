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

  let ok: boolean;
  try {
    ok = await passwordMatches(password);
  } catch {
    return { error: "O login não está configurado no servidor." };
  }

  if (!ok) {
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

  // redirect() fica FORA de try/catch: o Next o implementa lançando uma exceção
  // especial, e um catch em volta a engoliria.
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
