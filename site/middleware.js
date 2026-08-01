// Login próprio do sistema (formulário em /login.html + cookie de sessão)
// em vez do popup nativo de HTTP Basic Auth do navegador. Credenciais vêm
// de variáveis de ambiente (BASIC_AUTH_USER / BASIC_AUTH_PASSWORD) — nunca
// ficam no código-fonte. Sessão é um hash derivado da senha (sem estado no
// servidor), guardado num cookie HttpOnly.
import { next } from "@vercel/functions";

export const config = {
  matcher: "/((?!_vercel).*)",
};

const COOKIE_NAME = "maxled_session";
const ATTEMPTS_COOKIE = "maxled_attempts";
const BLOCKED_COOKIE = "maxled_blocked_until";
const LOGIN_PAGE = "/login.html";
const LOGIN_ACTION = "/login"; // caminho virtual (sem arquivo estático correspondente)
const MAX_ATTEMPTS = 7;
const LOCKOUT_SECONDS = 15 * 60; // bloqueia 15min após a 7ª tentativa errada
const ATTEMPTS_WINDOW_SECONDS = 30 * 60; // contador zera sozinho se ficar 30min sem tentar de novo

function cookie(name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  });
  return out;
}

export default async function middleware(request) {
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;
  if (!expectedPassword) {
    // Sem senha configurada: nega acesso (fail-closed) em vez de liberar o
    // site sem login. Uma variável de ambiente esquecida/removida não pode
    // virar dado financeiro publicamente acessível sem ninguém perceber.
    return new Response("Acesso indisponível: configuração de login pendente neste ambiente.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const expectedUser = process.env.BASIC_AUTH_USER || "maxled";
  const expectedToken = await sha256Hex(`${expectedUser}:${expectedPassword}:maxled-session-v1`);
  const url = new URL(request.url);

  if (url.pathname === "/logout") {
    const res = new Response(null, { status: 303, headers: { Location: LOGIN_PAGE } });
    res.headers.append("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return res;
  }

  if (url.pathname === LOGIN_ACTION && request.method === "POST") {
    const cookiesIn = parseCookies(request.headers.get("cookie"));

    // Bloqueado de tentativas anteriores: recusa sem nem checar a senha.
    const blockedUntil = parseInt(cookiesIn[BLOCKED_COOKIE] || "0", 10);
    if (blockedUntil && Date.now() < blockedUntil) {
      return new Response(null, { status: 303, headers: { Location: `${LOGIN_PAGE}?blocked=1` } });
    }

    let ok = false;
    let displayName = "";
    try {
      const bodyText = await request.text();
      const form = new URLSearchParams(bodyText);
      const user = (form.get("user") || "").trim();
      const pass = form.get("pass") || "";
      displayName = (form.get("displayName") || "").trim().slice(0, 60);
      ok = timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPassword);
    } catch (e) {
      ok = false; // corpo malformado -> conta como tentativa errada abaixo
    }

    if (ok) {
      // Nome é só pro histórico de acessos (site/js/views/config.js) -- não
      // participa da autenticação, que continua sendo usuário/senha únicos.
      const dest = "/" + (displayName ? `?welcome=${encodeURIComponent(displayName)}` : "");
      const res = new Response(null, { status: 303, headers: { Location: dest } });
      res.headers.append("Set-Cookie", cookie(COOKIE_NAME, expectedToken, 2592000));
      res.headers.append("Set-Cookie", cookie(ATTEMPTS_COOKIE, "", 0));
      res.headers.append("Set-Cookie", cookie(BLOCKED_COOKIE, "", 0));
      return res;
    }

    // Senha/usuário errados: soma 1 tentativa; na 7ª, bloqueia por 15min.
    // Guardado num cookie (não tem banco/servidor com estado nesse projeto),
    // então limpar cookies ou trocar de navegador reseta a contagem -- serve
    // pra desencorajar tentativa repetida/automatizada, não é à prova de um
    // atacante que sabe disso.
    const attempts = (parseInt(cookiesIn[ATTEMPTS_COOKIE] || "0", 10) || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      const res = new Response(null, { status: 303, headers: { Location: `${LOGIN_PAGE}?blocked=1` } });
      res.headers.append("Set-Cookie", cookie(BLOCKED_COOKIE, Date.now() + LOCKOUT_SECONDS * 1000, LOCKOUT_SECONDS));
      res.headers.append("Set-Cookie", cookie(ATTEMPTS_COOKIE, "", 0));
      return res;
    }
    const res = new Response(null, { status: 303, headers: { Location: `${LOGIN_PAGE}?error=1&remaining=${MAX_ATTEMPTS - attempts}` } });
    res.headers.append("Set-Cookie", cookie(ATTEMPTS_COOKIE, attempts, ATTEMPTS_WINDOW_SECONDS));
    return res;
  }

  if (url.pathname === LOGIN_PAGE) {
    return next(); // serve a página estática de login normalmente (GET)
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  if (cookies[COOKIE_NAME] && timingSafeEqual(cookies[COOKIE_NAME], expectedToken)) {
    return next();
  }

  const loginUrl = new URL(LOGIN_PAGE, request.url);
  return new Response(null, { status: 303, headers: { Location: loginUrl.toString() } });
}
