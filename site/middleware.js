// Login com contas reais (nome + e-mail + senha por pessoa), guardadas no
// Postgres do projeto (site/lib/auth.js). Sessão é um token aleatório salvo
// na tabela sessions -- diferente do esquema anterior (hash derivado de uma
// senha única, sem estado), dá pra revogar uma sessão específica (logout de
// verdade) sem precisar trocar a senha de todo mundo.
import { next } from "@vercel/functions";
import { attemptLogin, validateSession, destroySession, resetOwnerPassword } from "./lib/auth.js";

export const config = {
  matcher: "/((?!_vercel).*)",
  runtime: "nodejs",
};

const COOKIE_NAME = "maxled_session";
const LOGIN_PAGE = "/login.html";
const LOGIN_ACTION = "/login";

function cookie(name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
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

function unavailable(detail) {
  return new Response(`Acesso indisponível: ${detail}`, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get("cookie"));

  // Reset de senha temporário, sem exigir sessão -- link de uso único, com
  // caminho aleatório em vez de curto/adivinhável (é essa imprevisibilidade
  // que protege o endpoint, já que não há sessão nem "esqueci minha senha"
  // por e-mail ainda). Remover essa rota (e a página estática) depois de
  // confirmado o reset -- não é pra ficar no código.
  if (url.pathname === "/api/a834046d8837f3dc775277c4215804e9a3410fe0" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return new Response("corpo inválido", { status: 400 }); }
    const newPassword = String((body && body.newPassword) || "");
    if (newPassword.length < 8) return new Response(JSON.stringify({ ok: false, error: "senha curta" }), { status: 400, headers: { "content-type": "application/json" } });
    let user;
    try {
      user = await resetOwnerPassword(newPassword);
    } catch (e) {
      return unavailable("não consegui acessar o banco de dados. Tente de novo em instantes.");
    }
    return new Response(JSON.stringify({ ok: !!user }), { status: user ? 200 : 404, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/f05ce4e109019df428684969df6020164067c813.html") {
    return next();
  }

  if (url.pathname === "/logout") {
    try { await destroySession(cookies[COOKIE_NAME]); } catch (e) { /* segue pro login de qualquer forma */ }
    const res = new Response(null, { status: 303, headers: { Location: LOGIN_PAGE } });
    res.headers.append("Set-Cookie", cookie(COOKIE_NAME, "", 0));
    return res;
  }

  if (url.pathname === LOGIN_ACTION && request.method === "POST") {
    let email = "", pass = "";
    try {
      const bodyText = await request.text();
      const form = new URLSearchParams(bodyText);
      email = (form.get("email") || "").trim();
      pass = form.get("pass") || "";
    } catch (e) {
      return new Response(null, { status: 303, headers: { Location: `${LOGIN_PAGE}?error=1` } });
    }

    let result;
    try {
      result = await attemptLogin(email, pass);
    } catch (e) {
      return unavailable("não consegui acessar o banco de dados de contas. Tente de novo em instantes.");
    }

    if (result.ok) {
      const dest = "/?welcome=" + encodeURIComponent(result.user.name.slice(0, 60));
      const res = new Response(null, { status: 303, headers: { Location: dest } });
      res.headers.append("Set-Cookie", cookie(COOKIE_NAME, result.token, 2592000));
      return res;
    }
    if (result.blocked) {
      return new Response(null, { status: 303, headers: { Location: `${LOGIN_PAGE}?blocked=1&minutes=${result.minutesLeft}` } });
    }
    const remainingQs = result.remaining ? `&remaining=${result.remaining}` : "";
    return new Response(null, { status: 303, headers: { Location: `${LOGIN_PAGE}?error=1${remainingQs}` } });
  }

  if (url.pathname === LOGIN_PAGE) {
    return next();
  }

  let session = null;
  try {
    session = await validateSession(cookies[COOKIE_NAME]);
  } catch (e) {
    return unavailable("não consegui acessar o banco de dados de contas. Tente de novo em instantes.");
  }
  if (session) {
    return next();
  }

  const loginUrl = new URL(LOGIN_PAGE, request.url);
  return new Response(null, { status: 303, headers: { Location: loginUrl.toString() } });
}
