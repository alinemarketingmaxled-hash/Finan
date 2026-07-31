// Protege o painel inteiro com usuário/senha (HTTP Basic Auth) via Vercel
// Routing Middleware. As credenciais vêm de variáveis de ambiente
// (BASIC_AUTH_USER / BASIC_AUTH_PASSWORD) configuradas no projeto Vercel —
// nunca ficam no código-fonte.
import { next } from "@vercel/functions";

export const config = {
  matcher: "/((?!_vercel).*)",
};

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export default function middleware(request) {
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;
  if (!expectedPassword) {
    // Sem senha configurada no projeto: libera acesso em vez de travar o site.
    return next();
  }
  const expectedUser = process.env.BASIC_AUTH_USER || "maxled";

  const authHeader = request.headers.get("authorization") || "";
  console.log("[auth-debug]", JSON.stringify({
    hasHeader: !!authHeader,
    startsWithBasic: authHeader.startsWith("Basic "),
    expectedUserLen: expectedUser.length,
    expectedPassLen: expectedPassword.length,
  }));
  if (authHeader.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const sep = decoded.indexOf(":");
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      console.log("[auth-debug]", JSON.stringify({
        decodedLen: decoded.length,
        sepIndex: sep,
        userLen: user.length,
        passLen: pass.length,
        userMatches: timingSafeEqual(user, expectedUser),
        passMatches: timingSafeEqual(pass, expectedPassword),
      }));
      if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPassword)) {
        return next();
      }
    } catch (e) {
      console.log("[auth-debug] decode error", String(e));
    }
  }

  return new Response("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Max Led Financeiro"' },
  });
}
