const COOKIE_NAME = "webstack_admin_session";
const SESSION_TTL = 60 * 60 * 24 * 7;

export function readCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  if (!item) return "";
  try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return ""; }
}

export async function getAdminSession(request, env) {
  if (!env.NAV_DB) return null;
  const token = readCookie(request, COOKIE_NAME);
  if (!token || !/^[a-f0-9-]{36}$/i.test(token)) return null;
  const value = await env.NAV_DB.get("session:" + token);
  return value ? { token } : null;
}

export function hasAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export async function requireAdmin(context) {
  const session = await getAdminSession(context.request, context.env);
  if (!session) {
    return new Response(JSON.stringify({ error: "需要管理员登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  return null;
}

export function sessionCookie(token, maxAge = SESSION_TTL) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export { SESSION_TTL };