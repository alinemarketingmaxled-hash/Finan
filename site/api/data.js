// Dado financeiro compartilhado (lançamentos manuais, metas, orçamento,
// categoria de clientes, previsões) -- uma linha só no banco (id=1), igual
// pra todo perfil. GET busca o que está salvo; PUT salva por cima, com
// controle de conflito otimista via updatedAt (evita um perfil apagar sem
// querer o que outro acabou de salvar).
import { getPool, ensureSchema, requireSession, jsonResponse } from "../lib/auth.js";

export const config = { runtime: "nodejs" };

export async function GET(request) {
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "não autenticado" }, 401);
  await ensureSchema();
  const { rows } = await getPool().query("SELECT data, updated_at, updated_by FROM app_data WHERE id = 1");
  const row = rows[0];
  return jsonResponse({
    data: row ? row.data : null,
    updatedAt: row ? row.updated_at : null,
    updatedBy: row ? row.updated_by : null,
  });
}

export async function PUT(request) {
  const session = await requireSession(request);
  if (!session) return jsonResponse({ error: "não autenticado" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.data !== "object" || body.data === null) {
    return jsonResponse({ error: "dado inválido" }, 400);
  }
  await ensureSchema();
  const db = getPool();

  const { rows } = await db.query("SELECT updated_at, updated_by FROM app_data WHERE id = 1");
  const current = rows[0];
  if (current) {
    const currentTime = current.updated_at.getTime();
    const expectedTime = body.expectedUpdatedAt ? new Date(body.expectedUpdatedAt).getTime() : NaN;
    if (expectedTime !== currentTime) {
      return jsonResponse({
        error: "Alguém salvou mudanças mais recentes. Atualize antes de salvar de novo.",
        conflict: true,
        updatedAt: current.updated_at,
        updatedBy: current.updated_by,
      }, 409);
    }
  }

  const { rows: saved } = await db.query(
    `INSERT INTO app_data (id, data, updated_at, updated_by) VALUES (1, $1, now(), $2)
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now(), updated_by = $2
     RETURNING updated_at, updated_by`,
    [JSON.stringify(body.data), session.name]
  );
  return jsonResponse({ ok: true, updatedAt: saved[0].updated_at, updatedBy: saved[0].updated_by });
}
