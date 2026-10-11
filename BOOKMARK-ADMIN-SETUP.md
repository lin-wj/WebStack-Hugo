# WebStack-Hugo 书签管理功能：阶段一说明

此阶段仅新增 Pages Functions 后端接口，不替换首页模板，不修改现有 YAML，也不影响 main 分支。

## Cloudflare Pages 需要配置

1. 在 Cloudflare 创建一个新的 KV namespace（建议名称 `WEBSTACK_NAV_DB`）。
2. Pages 项目 → Settings → Functions → KV namespace bindings。
3. 绑定到生产与预览环境，Variable name 必须为 `NAV_DB`，Namespace 选择新建的 KV。
4. Pages 项目 → Settings → Variables and Secrets，为生产与预览环境分别设置 Secret：
   - Name：`NAV_ADMIN_PASSWORD`
   - Value：使用自己独有的强密码，不要复用其他网站密码。
5. 先只部署预览环境并验证，不要立即修改生产域名或 main 分支。

## 已新增接口

- `GET /api/auth`：检查当前浏览器是否已登录。
- `POST /api/auth`：使用 JSON `{"password":"你的密码"}` 登录。
- `DELETE /api/auth`：退出登录。
- `GET /api/bookmarks`：读取书签；访客只能读取公开分类和公开书签。
- `PUT /api/bookmarks`：管理员保存书签数据。

数据结构示例：

```json
{
  "categories": [
    {
      "id": "tools",
      "title": "常用工具",
      "private": false,
      "links": [
        {
          "id": "example",
          "title": "示例网站",
          "url": "https://example.com/",
          "description": "示例说明",
          "icon": "",
          "private": false,
          "tags": []
        }
      ]
    }
  ]
}
```

## 安全与当前限制

- 未设置 `NAV_ADMIN_PASSWORD` 时拒绝登录，不存在内置默认密码。
- 登录会话使用 HttpOnly、Secure、SameSite=Lax Cookie，并由 KV 设置 7 天过期时间。
- 管理写入接口在服务端检查会话；访客 API 不返回标记为私密的分类和书签。
- 登录失败计数按来源 IP 在 KV 中短期累计。KV 是最终一致性存储，因此这不是严格的高强度限流系统。
- 密码通过 Cloudflare Secret 进行配置，不写入仓库或 KV。
- 本阶段尚未接入现有首页、登录表单、浏览器书签导入、拖拽排序和备份 UI。
- 需要注意：这些接口使用 `NAV_DB` KV 绑定；不要将其绑定到其他项目正在使用的数据空间。

## 回滚

此阶段所有文件仅提交到 `feature/bookmark-admin`。回滚时可停止该分支的预览部署，生产 `main` 不受影响。不要在完成预览验证前合并分支。