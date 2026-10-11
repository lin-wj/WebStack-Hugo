import { clearSessionCookie, getAdminSession, hasAllowedOrigin, SESSION_TTL, sessionCookie } from "../lib/auth.js";

const MAX_LOGIN_BODY_BYTES = 16 * 1024;
const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  }
});

export async function onRequestGet({ request, env }) {
  if (!env.NAV_DB) return json({ error: "尚未绑定 NAV_DB KV" }, 503);
  try {
    return json({ authenticated: Boolean(await getAdminSession(request, env)) });
  } catch {
    return json({ error: "检查登录状态失败，请稍后重试" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!hasAllowedOrigin(request)) return json({ error: "请求来源不合法" }, 403);
  if (!env.NAV_DB) return json({ error: "尚未绑定 NAV_DB KV" }, 503);
  if (typeof env.NAV_ADMIN_PASSWORD !== "string" || !env.NAV_ADMIN_PASSWORD) return json({ error: "尚未设置 NAV_ADMIN_PASSWORD 密钥" }, 503);

  const length = Number(request.headers.get("Content-Length") || "0");
  if (length > MAX_LOGIN_BODY_BYTES) return json({ error: "登录请求内容过大" }, 413);

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_LOGIN_BODY_BYTES) return json({ error: "登录请求内容过大" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "请求内容格式错误" }, 400);
  }
  if (!body || typeof body.password !== "string" || body.password.length > 1024) {
    return json({ error: "请输入有效密码" }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const ipHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const rateKey = "login-attempts:" + ipHash;

  try {
    const attempts = Number(await env.NAV_DB.get(rateKey) || "0");
    if (attempts >= 10) return json({ error: "登录尝试次数过多，请稍后再试" }, 429);

    if (body.password !== env.NAV_ADMIN_PASSWORD) {
      await env.NAV_DB.put(rateKey, String(attempts + 1), { expirationTtl: 15 * 60 });
      return json({ error: "密码不正确" }, 401);
    }

    await env.NAV_DB.delete(rateKey);
    const token = crypto.randomUUID();
    await env.NAV_DB.put("session:" + token, "1", { expirationTtl: SESSION_TTL });
    return json({ authenticated: true }, 200, { "Set-Cookie": sessionCookie(token) });
  } catch {
    return json({ error: "登录服务暂时不可用，请稍后重试" }, 503);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!hasAllowedOrigin(request)) return json({ error: "请求来源不合法" }, 403, { "Set-Cookie": clearSessionCookie() });
  try {
    const session = await getAdminSession(request, env);
    if (session && env.NAV_DB) await env.NAV_DB.delete("session:" + session.token);
    return json({ authenticated: false }, 200, { "Set-Cookie": clearSessionCookie() });
  } catch {
    return json({ error: "退出登录时发生错误，请关闭管理页面" }, 500, { "Set-Cookie": clearSessionCookie() });
  }
}
