// Gerenciar contas (perfis) -- qualquer usuário autenticado pode ver, criar,
// editar ou remover qualquer conta, igual ao modelo anterior de senha única
// (quem tem acesso já é considerado de confiança). Nunca devolve
// password_hash.
import { getPool, ensureSchema, hashPassword, requireSession, jsonResponse } from "../lib/auth.js";

export const config = { runtime: "nodejs" };

export async function GET(request) {
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "não autenticado" }, 401);
  await ensureSchema();
  const { rows } = await getPool().query("SELECT id, name, email, created_at FROM users ORDER BY name");
  return jsonResponse({ users: rows });
}

export async function POST(request) {
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "não autenticado" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || !body.name || !body.email || !body.password) {
    return jsonResponse({ error: "nome, e-mail e senha são obrigatórios" }, 400);
  }
  if (String(body.password).length < 8) {
    return jsonResponse({ error: "senha precisa ter pelo menos 8 caracteres" }, 400);
  }
  await ensureSchema();
  try {
    const { rows } = await getPool().query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at",
      [String(body.name).trim(), String(body.email).trim().toLowerCase(), hashPassword(body.password)]
    );
    return jsonResponse({ user: rows[0] }, 201);
  } catch (e) {
    if (String(e.message).includes("duplicate key")) return jsonResponse({ error: "já existe uma conta com esse e-mail" }, 409);
    throw e;
  }
}

export async function PATCH(request) {
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "não autenticado" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || !body.id) return jsonResponse({ error: "id é obrigatório" }, 400);
  await ensureSchema();

  const sets = [];
  const values = [];
  let i = 1;
  if (body.name) { sets.push(`name = $${i++}`); values.push(String(body.name).trim()); }
  if (body.email) { sets.push(`email = $${i++}`); values.push(String(body.email).trim().toLowerCase()); }
  if (body.password) {
    if (String(body.password).length < 8) return jsonResponse({ error: "senha precisa ter pelo menos 8 caracteres" }, 400);
    sets.push(`password_hash = $${i++}`); values.push(hashPassword(body.password));
    sets.push("failed_attempts = 0", "locked_until = NULL");
  }
  if (!sets.length) return jsonResponse({ error: "nada pra atualizar" }, 400);
  values.push(body.id);

  try {
    const { rows } = await getPool().query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${i} RETURNING id, name, email, created_at`,
      values
    );
    if (!rows[0]) return jsonResponse({ error: "usuário não encontrado" }, 404);
    return jsonResponse({ user: rows[0] });
  } catch (e) {
    if (String(e.message).includes("duplicate key")) return jsonResponse({ error: "já existe uma conta com esse e-mail" }, 409);
    throw e;
  }
}

export async function DELETE(request) {
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "não autenticado" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || !body.id) return jsonResponse({ error: "id é obrigatório" }, 400);
  await ensureSchema();

  const db = getPool();
  const { rows: countRows } = await db.query("SELECT count(*)::int AS n FROM users");
  if (countRows[0].n <= 1) {
    return jsonResponse({ error: "não dá pra remover o último usuário -- ninguém mais conseguiria entrar" }, 400);
  }
  await db.query("DELETE FROM users WHERE id = $1", [body.id]);
  return jsonResponse({ ok: true });
}
