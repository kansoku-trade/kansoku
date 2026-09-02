# 数据库迁移

每个迁移放在 `YYYYMMDDHHMMSS_<名称>/migration.sql`。目录时间必须使用真实当前时间并保持递增；Drizzle 用完整目录名记录已执行的迁移。

不要修改已经发布的 SQL。升级旧数据库时，Drizzle 会按原时间或 SQL 哈希给旧版 `__drizzle_migrations` 补上迁移名；改动旧 SQL 会让哈希兜底失效。

新增迁移后，用真实数据库核对账本和表结构：

下列路径是 Server/开发态默认值；打包版 Desktop 请对
`$KANSOKU_DB_PATH`（`Application Support/Kansoku/State/app.db`）执行同样检查。

```bash
sqlite3 journal/charts/data/app.db \
  "select id, name, created_at from __drizzle_migrations order by id;"
sqlite3 journal/charts/data/app.db \
  "select name from sqlite_master where type='table';"
```
