# 鲲鹏记账 · 数据库设计（SQLite）

> 版本：v1.0 ｜ 引擎：SQLite 3（better-sqlite3）｜ 存储位置：系统用户数据目录 `kunpeng.db`

## 1. 设计目标

- 单机离线，隐私优先：数据只保存在本机
- 满足验收标准：**1 万条记录下列表加载与筛选 < 1 秒**（SQLite 索引 + 分页即可满足）
- 简单可靠：两张表（分类 + 记录），无冗余，易备份迁移

## 2. ER 关系

```
categories（分类表，自关联二级）
  ├── id        主键
  ├── parent_id 一级大类为 NULL，二级小类指向一级
  └── name      分类名

records（记录表）
  ├── id          主键
  ├── type        expense 支出 / income 收入
  ├── amount      金额（> 0）
  ├── category_id 外键 → categories.id（指向二级小类）
  ├── date        日期 YYYY-MM-DD
  ├── note        备注
  └── created_at  创建时间
```

## 3. 建表 SQL

```sql
CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES categories(id),   -- NULL = 一级
  name      TEXT    NOT NULL,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL CHECK (type IN ('expense', 'income')),
  amount      REAL    NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  date        TEXT    NOT NULL,
  note        TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
CREATE INDEX IF NOT EXISTS idx_records_cat  ON records(category_id);
```

## 4. 关键查询设计

| 场景 | 方式 | 性能说明 |
|------|------|----------|
| 记录列表 + 筛选 | 动态 WHERE + `LIMIT/OFFSET` 分页 | `date` 索引，万级数据毫秒级 |
| 按一级分类筛选 | `c.id = ? OR c.parent_id = ?` | 一级、二级一次命中 |
| 月度汇总 | `substr(date,1,7) = ?` + 条件聚合 | 单表扫描当月数据 |
| 分类占比 | 按 `parent_id` 分组求和 | 每次统计仅当月行 |

## 5. 预设分类种子

11 个一级分类 + 54 个二级小类，来自产品文档 2.2 节；首次启动自动写入（幂等）。
展示用图标/颜色元数据位于 `shared/categories.js`，与数据库仅按分类名关联。

## 6. 数据备份与迁移

- 导出 CSV/JSON（应用内「数据管理」页面）
- 直接备份 `kunpeng.db` 文件即可（WAL 模式下同时备份 `-wal`/`-shm` 更稳妥）
