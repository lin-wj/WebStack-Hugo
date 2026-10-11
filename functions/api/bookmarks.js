import { getAdminSession, requireAdmin } from "../lib/auth.js";

const DATA_KEY = "webstack_bookmarks_v1";
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

function validData(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.categories)) return false;
  if (data.categories.length > 500) return false;
  let count = 0;
  for (const category of data.categories) {
    if (!category || typeof category.id !== "string" || typeof category.title !== "string" || !Array.isArray(category.links)) return false;
    if (category.title.length > 200 || category.links.length > 2000) return false;
    count += category.links.length;
    for (const link of category.links) {
      if (!link || typeof link.id !== "string" || typeof link.title !== "string" || typeof link.url !== "string") return false;
      if (link.title.length > 300 || link.url.length > 2048) return false;
      try {
        const url = new URL(link.url);
        if (!["http:", "https:"].includes(url.protocol)) return false;
      } catch { return false; }
    }
  }
  return count <= 10000;
}

function publicData(data) {
  return {
    categories: data.categories
      .filter(category => !category.private)
      .map(category => ({ ...category, links: category.links.filter(link => !link.private) }))
  };
}

export async function onRequestGet({ request, env }) {
  if (!env.NAV_DB) return json({ error: "尚未绑定 NAV_DB KV" }, 503);
  const data = await env.NAV_DB.get(DATA_KEY, "json") || { categories: [] };
  const admin = await getAdminSession(request, env);
  return json(admin ? data : publicData(data));
}

export async function onRequestPut(context) {
  if (!context.env.NAV_DB) return json({ error: "尚未绑定 NAV_DB KV" }, 503);
  const denied = await requireAdmin(context);
  if (denied) return denied;

  let data;
  try { data = await context.request.json(); } catch { return json({ error: "JSON 格式错误" }, 400); }
  if (!validData(data)) return json({ error: "数据结构不正确，或包含过多项目/无效网址" }, 400);

  await context.env.NAV_DB.put(DATA_KEY, JSON.stringify(data));
  return json({ saved: true, categories: data.categories.length });
}