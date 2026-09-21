# WeWiki PRD 与技术方案总结

## 1. 项目背景

WeWiki 是一个私有化 Wiki / 个人博客笔记系统，目标是记录个人博客、知识库和办公资料。系统不是纯静态博客，而是一个需要登录、权限隔离、在线编辑和附件管理的轻量级全栈应用。

## 2. 核心目标

1. 用户登录后才能使用系统。
2. 不同用户根据权限看到不同笔记内容。
3. 支持 Markdown 编辑和实时预览。
4. 支持内嵌图片、思维导图、Word/PDF 等常见办公数据载体。
5. 技术栈保持稳定、轻便、可长期维护。

## 3. 推荐技术栈

| 模块 | 选型 | 说明 |
| --- | --- | --- |
| 全栈框架 | Next.js App Router | 前后端一体，适合私有 Wiki 和博客系统 |
| 语言 | TypeScript | 提升长期维护性和类型安全 |
| 样式 | Tailwind CSS | 轻量、开发效率高 |
| 数据库 | PostgreSQL | 稳定可靠，适合权限查询、全文搜索和长期扩展 |
| ORM | Prisma | 类型友好，迁移和模型管理清晰 |
| 认证 | Auth.js / NextAuth | 支持 Credentials、OAuth、JWT/Session 扩展 |
| Markdown 编辑 | @uiw/react-md-editor | 轻量、容易集成编辑与预览 |
| Markdown 渲染 | react-markdown + remark-gfm + rehype-sanitize | 支持 GFM，并避免 XSS |
| 思维导图 / 图表 | Markmap + Mermaid | Markmap 适合思维导图，Mermaid 适合流程图和架构图 |
| Word 预览 | Mammoth.js | 轻量地将 docx 转成 HTML 预览 |
| 文件存储 | 本地 uploads 起步，预留 S3/MinIO/R2 扩展 | 先满足本地调试，后续可替换为对象存储 |
| 部署 | Docker Compose / VPS | 后续适合私有化部署 |

## 4. 当前本地调试环境

本机已配置：

- PostgreSQL 16.14（Homebrew）
- 开发数据库：`wewiki_dev`
- 数据库连接：`postgresql://bytedance@localhost:5432/wewiki_dev?schema=public`
- Next.js 项目目录：`/Users/bytedance/Projects/GitHubProjects/WeWiki`

常用命令：

```bash
brew services start postgresql@16
brew services stop postgresql@16
pnpm dev
pnpm db:migrate
pnpm db:generate
pnpm db:studio
```

环境变量文件：

- 本地：`.env`
- 示例：`.env.example`

## 5. MVP 功能范围

### 5.1 用户与认证

- 邮箱 + 密码登录。
- 密码使用 bcryptjs/argon2 等安全哈希算法保存。
- 登录后才能访问笔记、附件、编辑器等页面。
- 用户状态支持 `active` 和 `disabled`。

### 5.2 空间与笔记

- 用户可以拥有多个空间（Space / Notebook）。
- 空间下可以创建树形笔记。
- 笔记正文以 Markdown 文本保存。
- 支持草稿、发布、归档状态。
- 支持软删除，避免误删后无法恢复。

### 5.3 权限管理

权限分两层：

1. 空间权限：控制用户是否能访问某个空间下的大部分笔记。
2. 笔记权限：控制单篇笔记的单独分享和编辑权限。

角色级别：

| 角色 | 权限说明 |
| --- | --- |
| owner | 所有者，可删除、分享、管理成员 |
| admin | 管理员，可管理空间/笔记权限 |
| editor | 可创建和编辑内容 |
| viewer | 仅可查看 |

权限判断优先级：

```text
系统管理员
  > 笔记 owner
  > 单篇笔记权限
  > 空间成员权限
  > 无权限
```

### 5.4 Markdown 编辑和预览

- 编辑器使用 `@uiw/react-md-editor`。
- 渲染使用 `react-markdown`。
- 支持 `remark-gfm`，用于表格、任务列表、删除线等 GFM 语法。
- 使用 `rehype-sanitize` 过滤危险 HTML，避免 XSS。

### 5.5 附件与办公数据载体

所有非纯文本内容都以附件形式管理。

支持对象：

- 图片：png、jpg、jpeg、gif、webp、svg。
- 文档：doc、docx、xls、xlsx、ppt、pptx。
- PDF。
- Markdown / text。
- 思维导图：优先使用 Markdown 代码块中的 `markmap` 内容保存。

Markdown 引用附件时不直接暴露磁盘路径，而是使用受保护接口：

```md
![图片说明](/api/attachments/attachment-id)
[方案文档.docx](/api/attachments/attachment-id)
```

服务端必须校验当前用户是否有权限访问附件所属笔记或空间。

## 6. 核心数据库模型

当前 Prisma schema 已覆盖以下核心表：

| 表 | 说明 |
| --- | --- |
| `users` | 用户基础信息和登录信息 |
| `sessions` | 登录会话，当前预留，后续可切换数据库 Session |
| `spaces` | 笔记空间 / 笔记本 |
| `space_members` | 空间成员和空间级权限 |
| `notes` | Markdown 笔记正文和树形结构 |
| `note_permissions` | 单篇笔记授权 |
| `attachments` | 图片、文档、PDF 等附件元数据 |
| `document_previews` | Word/PDF 等预览生成状态 |
| `tags` | 空间内标签 |
| `note_tags` | 笔记标签关联 |
| `note_revisions` | 笔记版本历史 |
| `audit_logs` | 审计日志 |

数据库 schema 文件：

```text
prisma/schema.prisma
```

初始迁移已生成并应用到本地 PostgreSQL：

```text
prisma/migrations/*_init/migration.sql
```

## 7. 安全设计要求

1. 所有笔记查询必须带用户权限条件。
2. 附件下载和图片展示必须走服务端接口并校验权限。
3. Markdown 渲染必须 sanitize。
4. 不直接信任前端传入的 `ownerId`、`userId`、`role`。
5. 上传文件需要限制大小、类型和扩展名。
6. 文件存储路径使用系统生成的 `storageKey`，不能直接使用用户上传原始文件名。
7. 密码不能明文保存。
8. 重要操作写入 `audit_logs`。

## 8. 推荐项目结构

```text
app/
  (auth)/login/
  (wiki)/notes/
  api/auth/[...nextauth]/
  api/notes/
  api/attachments/
components/
  editor/
  layout/
  notes/
lib/
  auth.ts
  db.ts
  markdown.ts
  permissions.ts
  storage.ts
prisma/
  schema.prisma
  migrations/
docs/
  PRD.md
uploads/
```

## 9. 分阶段路线图

### 阶段一：基础可用

- 登录页面和 Credentials 登录。
- 初始化管理员用户。
- 创建默认空间。
- 笔记列表、笔记详情、笔记编辑。
- Markdown 编辑和预览。

### 阶段二：权限完善

- 空间成员管理。
- 单篇笔记分享。
- read/write/admin/owner 权限校验。
- API 层统一权限中间件。

### 阶段三：附件和办公文档

- 图片上传、粘贴、拖拽。
- 附件上传和权限下载接口。
- Word docx 通过 Mammoth.js 预览。
- PDF 预览。
- Markmap 和 Mermaid 渲染。

### 阶段四：知识库体验增强

- 标签、分类、归档。
- 全文搜索。
- 版本历史和回滚。
- 回收站。
- 审计日志页面。
- 对象存储 S3/MinIO/R2 适配。

## 10. 当前状态

截至 2026-07-10：

- 已安装并启动本地 PostgreSQL 16。
- 已创建 `wewiki_dev` 开发数据库。
- 已初始化 Next.js + TypeScript + Tailwind 项目。
- 已安装 Prisma、Auth.js、Markdown、Mermaid、Markmap、Mammoth 等核心依赖。
- 已创建并应用初始数据库迁移。
- 已创建基础目录结构和核心 `lib` 文件。
