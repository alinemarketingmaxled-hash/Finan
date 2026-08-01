// Histórico de acessos central (banco de dados) -- substitui o antigo
// histórico local (localStorage), que só existia no navegador de quem tinha
// logado. Agora aparece igual pra todo mundo, de qualquer aparelho.
import { getPool, ensureSchema, requireSession, jsonResponse } from "../lib/auth.js";

export const config = { runtime: "nodejs" };

export async function GET(request) {
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "não autenticado" }, 401);
  await ensureSchema();
  const { rows } = await getPool().query("SELECT name, ts FROM login_log ORDER BY ts DESC LIMIT 200");
  return jsonResponse({ log: rows });
}
