import { clearSessionCookie, getAdminSession, SESSION_TTL, sessionCookie } from "../lib/auth.js";

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
});

export async function onRequestGet({ request, env }) {
  if (!env.NAV_DB) return json({ error: "尚未绑定 NAV_DB KV" }, 503);
  return json({ authenticated: Boolean(await getAdminSession(request, env)) });
}

export async function onRequestPost({ request, env }) {
  if (!env.NAV_DB) return json({ error: "尚未绑定 NAV_DB KV" }, 503);
  if (!env.NAV_ADMIN_PASSWORD) return json({ error: "尚未设置 NAV_ADMIN_PASSWORD 密钥" }, 503);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateKey = "login-attempts:" + ip;
  const attempts = Number(await env.NAV_DB.get(rateKey) || "0");
  if (attempts >= 10) return json({ error: "登录尝试次数过多，请稍后再试" }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "请求内容格式错误" }, 400); }
  if (typeof body.password !== "string" || body.password.length > 1024) {
    return json({ error: "请输入有效密码" }, 400);
  }

  if (body.password !== env.NAV_ADMIN_PASSWORD) {
    await env.NAV_DB.put(rateKey, String(attempts + 1), { expirationTtl: 15 * 60 });
    return json({ error: "密码不正确" }, 401);
  }

  await env.NAV_DB.delete(rateKey);
  const token = crypto.randomUUID();
  await env.NAV_DB.put("session:" + token, "1", { expirationTtl: SESSION_TTL });
  return json({ authenticated: true }, 200, { "Set-Cookie": sessionCookie(token) });
}

export async function onRequestDelete({ request, env }) {
  const session = await getAdminSession(request, env);
  if (session && env.NAV_DB) await env.NAV_DB.delete("session:" + session.token);
  return json({ authenticated: false }, 200, { "Set-Cookie": clearSessionCookie() });
}