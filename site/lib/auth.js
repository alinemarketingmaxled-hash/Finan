// Acesso a banco (Postgres) e autenticação -- usado pelo middleware.js e
// pelas funções em site/api/*.js. Um só lugar pra schema, hash de senha e
// sessão, pra login e API nunca divergirem na lógica.
import { Pool } from "pg";
import crypto from "node:crypto";

let pool = null;
function getPool() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Nenhuma variável de conexão com o banco encontrada (POSTGRES_URL).");
    // max baixo de propósito: cada requisição normalmente só faz 1 query por
    // vez, e a página carrega umas 20 requisições quase simultâneas (uma por
    // arquivo .js) -- um pool grande por instância só aumenta o pico de
    // conexões abertas ao mesmo tempo no banco.
    pool = new Pool({ connectionString, max: 2 });
  }
  return pool;
}

// Tenta de novo com espera curta entre tentativas -- cobre tanto uma
// oscilação passageira de conexão quanto um banco que "dormiu" por
// inatividade (comum em Postgres serverless) e precisa de um instante pra
// acordar na primeira conexão depois de um tempo parado.
async function withRetry(fn, attempts, baseDelayMs) {
  attempts = attempts || 3;
  baseDelayMs = baseDelayMs || 300;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

let schemaReady = null;
// Idempotente -- roda a cada cold start, mas CREATE TABLE IF NOT EXISTS é
// barato quando já existe. Sem sistema de migração à parte: o app é pequeno
// o bastante pra isso ser suficiente. As 4 tabelas viram uma query só (menos
// uma ida-e-volta ao banco por instância fria). Não tenta de novo aqui
// dentro -- quem chama (validateSession) já envolve tudo (isso + a query)
// numa única retentativa; tentar duas vezes em duas camadas encadeadas só
// multiplicaria o tempo de espera numa falha de verdade.
async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS login_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        ts TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS app_data (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by TEXT
      );
    `);
    await seedFirstUser(db);
  })().catch((e) => { schemaReady = null; throw e; }); // não deixa uma falha "travar" tentativas futuras
  return schemaReady;
}

// Primeiro acesso (tabela de usuários vazia): cria uma conta inicial com uma
// senha temporária já com hash aqui (nunca em texto puro no código) -- troque
// pela sua em "Gerenciar usuários" assim que entrar pela primeira vez.
async function seedFirstUser(db) {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM users");
  if (rows[0].n > 0) return;
  const seedHash = "f67747ff80ae3c8e954eeeced364f80c:801d5d87a6e536df53f5213559ffd733f02f1efe8116d3af9c41e92519470fcc2a473bc8cec60b526e2fc4eea3276be806a129d7d6ed5b890386d126736cc2ee";
  await db.query(
    "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING",
    ["Aline", "aline.marketing.maxled@gmail.com", seedHash]
  );
}

// scrypt (nativo do Node, sem dependência extra) -- salt aleatório por senha,
// formato "salt:hash" em hex.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

const MAX_ATTEMPTS = 7;
const LOCKOUT_MS = 15 * 60 * 1000;
const SESSION_DAYS = 30;

// null (sem tal usuário), {blocked:true,minutesLeft} ou {user}.
async function attemptLogin(email, password) {
  await ensureSchema();
  const db = getPool();
  const { rows } = await db.query(
    "SELECT id, name, email, password_hash, failed_attempts, locked_until FROM users WHERE email = $1",
    [String(email || "").trim().toLowerCase()]
  );
  const row = rows[0];
  if (!row) return { ok: false };

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000);
    return { ok: false, blocked: true, minutesLeft };
  }

  const valid = verifyPassword(password, row.password_hash);
  if (!valid) {
    const attempts = row.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db.query("UPDATE users SET failed_attempts = 0, locked_until = $2 WHERE id = $1", [row.id, new Date(Date.now() + LOCKOUT_MS)]);
      return { ok: false, blocked: true, minutesLeft: Math.ceil(LOCKOUT_MS / 60000) };
    }
    await db.query("UPDATE users SET failed_attempts = $2 WHERE id = $1", [row.id, attempts]);
    return { ok: false, remaining: MAX_ATTEMPTS - attempts };
  }

  await db.query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [row.id]);
  await db.query("INSERT INTO login_log (user_id, name, ts) VALUES ($1, $2, now())", [row.id, row.name]);
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [token, row.id, expiresAt]);
  return { ok: true, token, user: { id: row.id, name: row.name, email: row.email } };
}

// Reset de senha temporário (sem fluxo de "esqueci minha senha" por e-mail
// ainda) -- só existe enquanto o caminho abaixo (rota + página) estiver
// presente no código; sempre pro e-mail fixo da dona da conta, nunca um
// e-mail arbitrário do corpo da requisição.
async function resetOwnerPassword(newPassword) {
  await ensureSchema();
  const db = getPool();
  const { rows } = await db.query(
    "UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE email = $2 RETURNING id, name, email",
    [hashPassword(newPassword), "aline.marketing.maxled@gmail.com"]
  );
  return rows[0] || null;
}

// Cache curto de sessão validada -- sem isso, cada carregamento de página
// dispara ~20 requisições quase simultâneas (uma por arquivo .js) e CADA
// UMA bate no banco pra confirmar a mesma sessão de novo, multiplicando a
// carga por nada. TTL curto (a troca é: até 20s de atraso pra um logout ou
// edição de perfil valer em todo lugar, em troca de não sobrecarregar o
// banco a cada clique).
const sessionCache = new Map(); // token -> { user, expiresAtMs }
const SESSION_CACHE_TTL_MS = 20000;

async function validateSession(token) {
  if (!token) return null;
  const cached = sessionCache.get(token);
  if (cached && cached.expiresAtMs > Date.now()) return cached.user;

  const user = await withRetry(async () => {
    await ensureSchema();
    const db = getPool();
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    return rows[0] || null;
  });

  if (user) sessionCache.set(token, { user, expiresAtMs: Date.now() + SESSION_CACHE_TTL_MS });
  else sessionCache.delete(token);
  return user;
}

async function destroySession(token) {
  if (!token) return;
  sessionCache.delete(token);
  await ensureSchema();
  await getPool().query("DELETE FROM sessions WHERE token = $1", [token]);
}

// Helpers usados pelas rotas em site/api/*.js -- toda rota de API roda atrás
// do middleware (que já barra request sem sessão), mas confere de novo aqui
// por conta própria e pra saber quem é o usuário autenticado.
function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const part = header.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="));
  return part ? part.slice(name.length + 1) : null;
}
async function requireSession(request) {
  return validateSession(getCookie(request, "maxled_session"));
}
function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "content-type": "application/json" } });
}

export { getPool, ensureSchema, hashPassword, verifyPassword, attemptLogin, validateSession, destroySession, getCookie, requireSession, jsonResponse, resetOwnerPassword };
