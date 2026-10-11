# WebStack-Hugo 书签管理：预览环境配置与验证

此功能仍在开发分支 `feature/bookmark-admin`，PR #1 保持 Draft。没有合并到 `main`，也没有主动修改 Cloudflare 正式环境配置。

## Cloudflare Pages 预览环境配置

1. 在 Cloudflare 创建一个**新的** KV namespace，例如 `WEBSTACK_NAV_DB_PREVIEW`。
2. Pages 项目 → Settings → Functions → KV namespace bindings，将预览环境变量名设为 `NAV_DB`，绑定到刚创建的 KV。
3. 在 Pages 项目的 Variables and Secrets 中，为**预览环境**设置 Secret：
   - Name：`NAV_ADMIN_PASSWORD`
   - Value：使用独有的强密码，不要复用其他网站密码。
4. 保存配置并重新部署预览分支。首次配置时，登录 API 显示缺少 KV 或 Secret 的错误是预期行为；配置后再测试。
5. 不要把预览环境绑定到正式站或其他项目正在使用的 KV，也不要先给生产环境添加绑定。

## 管理页面

- 管理页面：`/admin/`
- 登录：使用配置的 `NAV_ADMIN_PASSWORD`
- 保存：所有更改先在浏览器内编辑，点击“保存到云端”后才写入 KV。
- 备份：可导出 JSON 备份；也可导入之前导出的 JSON。
- 浏览器书签：可导入浏览器导出的书签 HTML 文件（单文件最大 10 MB）。导入会替换当前编辑中的全部分类，导入后请检查并点击“保存到云端”。
- 私人分类/私人书签：公开首页 API 会过滤掉这些项目；管理员登录后可在管理页查看。
- 原站迁移：当 KV 还没有书签数据时，管理页会尝试读取旧首页的数据并转换。旧的主/子分类会合并成“主分类 / 子分类”的分类名。首次保存前请检查迁移结果。

## 接口

- `GET /api/auth`：检查登录状态。
- `POST /api/auth`：使用 JSON 密码登录。
- `DELETE /api/auth`：退出登录。
- `GET /api/bookmarks`：读取书签；访客只能读取公开分类和公开书签。
- `PUT /api/bookmarks`：管理员保存书签数据。

## 当前安全措施与限制

- 未设置 `NAV_ADMIN_PASSWORD` 时拒绝登录，没有内置默认密码。
- 会话使用 HttpOnly、Secure、SameSite=Lax Cookie，KV 会话记录 7 天过期。
- 写入接口检查登录状态、请求来源、数据结构及网址协议，并限制请求体最大 10 MB。
- 登录失败计数在 KV 中短期累计，计数键保存来源 IP 的 SHA-256 摘要而非原始 IP。Cloudflare KV 是最终一致性存储，因此限流并非严格的高强度防暴力破解方案。
- 尚未完成完整安全审计，也尚未完成登录、保存、私人内容过滤和首页动态显示的端到端验证。不要视为可直接上线版本。

## 回滚

当前改动只在 `feature/bookmark-admin`。如预览异常，可停止预览部署或切回备份分支；正式 `main` 未被修改。未完成预览测试前不要合并 PR。
