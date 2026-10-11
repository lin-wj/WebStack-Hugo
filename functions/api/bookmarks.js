import { getAdminSession, hasAllowedOrigin, requireAdmin } from "../lib/auth.js";

const DATA_KEY = "webstack_bookmarks_v1";
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }
});

function validOptionalUrl(value, maxLength = 2048) {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string" || value.length > maxLength) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validLogo(value) {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  if (value.startsWith("/assets/") && !value.startsWith("//") && !value.includes("..")) return true;
  return validOptionalUrl(value, 2048);
}

function validData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.categories)) return false;
  if (data.categories.length > 500) return false;
  let count = 0;
  const categoryIds = new Set();
  const linkIds = new Set();

  for (const category of data.categories) {
    if (!category || typeof category !== "object" || Array.isArray(category)) return false;
    if (typeof category.id !== "string" || !category.id || category.id.length > 128 || categoryIds.has(category.id)) return false;
    categoryIds.add(category.id);
    if (typeof category.title !== "string" || !category.title.trim() || category.title.length > 200 || !Array.isArray(category.links)) return false;
    if (category.private !== undefined && typeof category.private !== "boolean") return false;
    if (category.links.length > 2000) return false;
    count += category.links.length;

    for (const link of category.links) {
      if (!link || typeof link !== "object" || Array.isArray(link)) return false;
      if (typeof link.id !== "string" || !link.id || link.id.length > 128 || linkIds.has(link.id)) return false;
      linkIds.add(link.id);
      if (typeof link.title !== "string" || !link.title.trim() || link.title.length > 300) return false;
      if (typeof link.url !== "string" || link.url.length > 2048 || !validOptionalUrl(link.url, 2048)) return false;
      if (link.description !== undefined && (typeof link.description !== "string" || link.description.length > 2000)) return false;
      if (!validLogo(link.logo)) return false;
      if (link.tags !== undefined && (!Array.isArray(link.tags) || link.tags.length > 50 || link.tags.some(tag => typeof tag !== "string" || tag.length > 100))) return false;
      if (link.private !== undefined && typeof link.private !== "boolean") return false;
      if (link.favorite !== undefined && typeof link.favorite !== "boolean") return false;
    }
  }
  return count <= 10000;
}

function publicData(data) {
  return {
    categories: data.categories
      .filter(category => !category.private)
      .map(category => ({ ...category, links: category.links.filter(link => !link.private) }))
      .filter(category => category.links.length > 0)
  };
}

export async function onRequestGet({ request, env }) {
  if (!env.NAV_DB) return json({ error: "尚未绑定 NAV_DB KV" }, 503);
  try {
    const stored = await env.NAV_DB.get(DATA_KEY, "json");
    const data = stored && Array.isArray(stored.categories) ? stored : { categories: [] };
    const admin = await getAdminSession(request, env);
    return json({ ...((admin ? data : publicData(data))), initialized: Boolean(stored) });
  } catch {
    return json({ error: "读取书签失败，请稍后重试" }, 500);
  }
}

export async function onRequestPut(context) {
  if (!hasAllowedOrigin(context.request)) return json({ error: "请求来源不合法" }, 403);
  if (!(context.request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return json({ error: "请求必须使用 JSON 格式" }, 415);
  if (!context.env.NAV_DB) return json({ error: "尚未绑定 NAV_DB KV" }, 503);
  const denied = await requireAdmin(context);
  if (denied) return denied;

  const length = Number(context.request.headers.get("Content-Length") || "0");
  if (length > MAX_BODY_BYTES) return json({ error: "数据超过 10 MB 限制，请减少书签数量或拆分导入" }, 413);

  let data;
  try {
    const raw = await context.request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: "数据超过 10 MB 限制，请减少书签数量或拆分导入" }, 413);
    data = JSON.parse(raw);
  } catch {
    return json({ error: "JSON 格式错误" }, 400);
  }
  if (!validData(data)) return json({ error: "数据结构不正确，或包含过多项目、重复 ID 或无效网址" }, 400);

  try {
    await context.env.NAV_DB.put(DATA_KEY, JSON.stringify(data));
    return json({ saved: true, categories: data.categories.length, links: data.categories.reduce((sum, category) => sum + category.links.length, 0) });
  } catch {
    return json({ error: "保存书签失败，请稍后重试" }, 500);
  }
}
