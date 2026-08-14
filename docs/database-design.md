# 记账APP · 数据库设计（SQLite）

> 版本：v1.2（收入逻辑修正 + 分类管理）｜ 引擎：SQLite 3（better-sqlite3）｜ 存储位置：系统用户数据目录 `kunpeng.db`

## 1. 设计目标

- 单机离线，隐私优先：数据只保存在本机
- 满足验收标准：**1 万条记录下列表加载与筛选 < 1 秒**（SQLite 索引 + 分页即可满足）
- 简单可靠：两张表（分类 + 记录），无冗余，易备份迁移

## 2. ER 关系

```
categories（分类表，自关联二级）
  ├── id        主键
  ├── parent_id 一级大类为 NULL，二级小类指向一级
  ├── name      分类名
  ├── sort      同级排序号
  └── is_preset 1=系统预置（只读），0=用户自定义

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
  sort      INTEGER NOT NULL DEFAULT 0,
  is_preset INTEGER NOT NULL DEFAULT 1           -- 1=预置（只读），0=自定义
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
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_preset ON categories(is_preset);
```

> 旧库迁移：v1.0 的 `categories` 表没有 `is_preset` 列，启动时检测到缺失会执行
> `ALTER TABLE categories ADD COLUMN is_preset INTEGER NOT NULL DEFAULT 1`，存量分类自动全部标记为预置，数据不丢失。

## 4. 关键查询设计

| 场景 | 方式 | 性能说明 |
|------|------|----------|
| 记录列表 + 筛选 | 动态 WHERE + `LIMIT/OFFSET` 分页 | `date` 索引，万级数据毫秒级 |
| 按一级分类筛选 | `c.id = ? OR c.parent_id = ?` | 一级、二级一次命中 |
| 月度汇总 | `substr(date,1,7) = ?` + 条件聚合 | 单表扫描当月数据 |
| 分类占比 | 按 `parent_id` 分组求和 | 每次统计仅当月行 |
| 分类管理（增删改） | 同级重名用 `LOWER(name)` 比较；删除前先查 `records` 引用 | 分类量小（<500），毫秒级 |

## 5. 预设分类种子

12 个一级分组（11 个支出大类 + 1 个“收入”分组）+ 50 个二级分类
（44 个支出小类 + 6 个收入来源：工资、奖金、兼职、投资收益、红包、其他），
首次启动自动写入（幂等），`is_preset = 1` 标记为系统预置。
展示用图标/颜色元数据位于 `shared/categories.json`（二级分类继承所属一级的样式），
与数据库仅按分类名关联；自定义分类按名称哈希取兜底色板。

## 5.1 收入记录规则（v1.2）

- 收入记录使用 `records.type = 'income'`（原有字段，无需改表结构），
  `category_id` 指向“收入”分组下的来源分类，**不再使用支出分类体系**。
- 录入界面：选择“收入”后分类区切换为“收入来源”单选（无二级分类）；
  支出保持一级 + 二级分类选择。
- 明细/首页展示：收入行显示绿色“收入”徽标 + 来源名称（如“工资”），
  金额为绿色 `+¥` 样式；支出行保持“大类 · 小类”格式。
- 旧数据迁移：`migrateIncomeRecords()` 把历史收入记录（曾指向支出分类）
  统一改指“收入/其他”，幂等执行，不影响统计数据。

## 6. 分类自定义管理（v1.1）

- 预置分类（`is_preset=1`）：**不可修改、不可删除**，名称只读。
- 自定义分类：支持新增（一级/二级）、改名（仅名称）、删除。
- 新增/改名校验：名称非空、不超过 20 字、同级不重名（不区分大小写）。
- 删除校验：被 `records` 引用（含一级分类下的任一二级）时拒绝删除并提示
  “该分类已被使用，请先修改相关记录的分类”；删除一级分类时在事务内先删子分类再删自身，避免孤儿数据。
- 接口：`categories:add / categories:update / categories:remove`（主进程 DAL 见 `electron/db.js`）。
- 记账录入、明细筛选、统计看板自动包含自定义分类（按数据库实时读取）。

## 7. 数据备份与迁移

- 导出 CSV/JSON（应用内「数据管理」页面）
- 直接备份 `kunpeng.db` 文件即可（WAL 模式下同时备份 `-wal`/`-shm` 更稳妥）
- 备份后如需包含分类定义，未来可在导出中加入 `categories` 表（当前导出仅含记录）
