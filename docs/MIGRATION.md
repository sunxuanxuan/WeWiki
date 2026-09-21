# WeWiki 完整迁移指南

WeWiki 的文档正文、目录、权限和版本信息保存在 PostgreSQL 中，附件保存在 `UPLOAD_DIR`，部分旧版导入附件位于 `public/imported-docs`。完整迁移必须同时携带代码、数据库和这两类文件。

## 创建完整迁移包

确保 `.env` 中的 `DATABASE_URL` 指向需要导出的数据库，然后执行：

```bash
pnpm package:zip
```

也可以指定压缩包名称：

```bash
pnpm package:zip -- WeWiki-release.zip
```

产物位于 `dist/`。压缩包除项目代码和 `docs/` 设计文档外，还包含：

```text
migration-data/
├── database.dump
├── manifest.json
├── checksums.sha256
└── files/
    ├── uploads/
    └── public/imported-docs/
```

如果只需要创建数据备份，不需要打包代码：

```bash
pnpm data:backup
```

可以传入自定义输出目录：

```bash
pnpm data:backup -- /path/to/wewiki-data
```

## 在目标环境恢复

1. 解压完整迁移包。
2. 安装 Node.js、pnpm、PostgreSQL 客户端以及 PostgreSQL 服务。
3. 创建一个空数据库。
4. 复制 `.env.example` 为 `.env`，设置目标环境的 `DATABASE_URL`、`NEXTAUTH_URL`、`NEXTAUTH_SECRET` 和 `UPLOAD_DIR`。
5. 安装依赖：

```bash
pnpm install
```

6. 在项目根目录执行恢复：

```bash
pnpm data:restore
```

恢复脚本默认读取项目根目录中的 `migration-data`。也可以指定其他备份目录：

```bash
pnpm data:restore -- /path/to/migration-data
```

为了防止误覆盖，目标数据库存在业务表时脚本会终止。如果确认要用备份覆盖目标数据库：

```bash
pnpm data:restore -- /path/to/migration-data --force
```

恢复脚本会在导入备份后自动执行 `prisma migrate deploy`，将数据库升级到压缩包内代码所需的最新 schema。恢复完成后执行：

```bash
pnpm db:generate
pnpm build
pnpm start
```

## 安全说明

- 数据库备份包含用户密码哈希、权限、个人访问令牌哈希和审计记录，应将迁移 ZIP 视为敏感文件。
- `.env` 和 `NEXTAUTH_SECRET` 不会打包，目标环境必须重新配置。
- `--force` 会删除并重建目标数据库的 `public` schema，请只在确认目标数据库可以被完整覆盖时使用。
- 恢复前会校验 `checksums.sha256`，文件损坏或被修改时会停止恢复。
- 建议迁移完成并验证后删除服务器上不再需要的迁移 ZIP。
