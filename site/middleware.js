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
const LOGIN_PAGE = "/login.html";
const LOGIN_ACTION = "/login"; // caminho virtual (sem arquivo estático correspondente)

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
    // Sem senha configurada no projeto: libera acesso em vez de travar o site.
    return next();
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
    try {
      const bodyText = await request.text();
      const form = new URLSearchParams(bodyText);
      const user = form.get("user") || "";
      const pass = form.get("pass") || "";
      if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPassword)) {
        const res = new Response(null, { status: 303, headers: { Location: "/" } });
        res.headers.append(
          "Set-Cookie",
          `${COOKIE_NAME}=${expectedToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
        );
        return res;
      }
    } catch (e) {
      // corpo malformado -> trata como credenciais inválidas abaixo
    }
    return new Response(null, { status: 303, headers: { Location: `${LOGIN_PAGE}?error=1` } });
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
