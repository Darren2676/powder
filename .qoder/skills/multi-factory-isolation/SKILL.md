---
name: multi-factory-isolation
description: Add factory field support to master data management pages following the multi-factory data isolation scheme. Covers database column addition, backend controller refactoring (LEFT JOIN factory + strict factory_id filtering + CRUD + import/export), frontend form factory dropdown + table column + search filter, and batch update of existing records to Ningguo factory. Use when user needs to add factory field to a master data page, says 多工厂隔离, 增加工厂字段, 工厂改造, 工厂字段, or mentions master data factory isolation.
---

# 多工厂隔离 — 主数据页面工厂字段改造

## 改造范围

为一个主数据管理页面（如客户/供应商/物流公司等）完整添加"工厂"字段支持：

1. **数据库**：表添加 `factory_id INT NULL` 列
2. **后端 Controller**：LEFT JOIN factory + 严格过滤 + CRUD 支持 + 导入导出
3. **前端 List.vue**：表格工厂列 + 表单工厂下拉 + 编辑回填
4. **数据迁移**：现有记录批量更新为宁国工厂

---

## Step 1: 数据库加列

用脚本检查并添加 `factory_id` 列（读写 `.env` 获取数据库连接）：

```js
// _add_factory_id_<table>.cjs（放 server/ 目录下）
const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
dotenv.config();

const sequelize = new Sequelize({
  dialect: 'mssql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'PowderMom',
  username: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true, tdsVersion: '7_2', requestTimeout: 120000 } },
  pool: { max: 10, min: 2, acquire: 30000, idle: 60000 }
});

(async () => {
  try {
    const [cols] = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '<TABLE>' AND COLUMN_NAME = 'factory_id'"
    );
    if (cols.length > 0) { console.log('factory_id already exists.'); process.exit(0); return; }
    await sequelize.query("ALTER TABLE <TABLE> ADD factory_id INT NULL");
    console.log('factory_id column added.');
    await sequelize.close();
    process.exit(0);
  } catch(e) { console.error(e.message); process.exit(1); }
})();
```

执行后删除临时脚本。

---

## Step 2: 后端 Controller 改造

以 `customer.controller.ts` 为模板，需要改 7 处：

### 2.1 添加 import

```typescript
import { getFactoryId } from '../../../utils/factoryWhere.util';
```

### 2.2 列表查询 — 添加工厂过滤 + LEFT JOIN

> **⚠️ 关键：ROW_NUMBER 分页中的 factory_id 条件必须注入到内层业务查询的 WHERE，而非外层包装查询。** 否则 ROW_NUMBER 计算范围错误，分页结果不准确。

```typescript
// 多工厂数据隔离过滤（符合多工厂方案：filter模式下严格隔离，仅显示本工厂记录）
const _factoryId = getFactoryId(req);
if (_factoryId !== null) {
  conditions.push(`<alias>.factory_id = :_factoryId`);
  replacements._factoryId = _factoryId;
}
```

查询 SQL 改为 LEFT JOIN 获取工厂名称，**factory_id 过滤条件在子查询内部**：

```sql
SELECT * FROM (
  SELECT <alias>.*, f.factory_name, f.factory_short,
    ROW_NUMBER() OVER (ORDER BY ...) AS _row_num
  FROM <table> <alias>
  LEFT JOIN factory f ON <alias>.factory_id = f.id
  ${whereClause}   -- factory_id 条件在此处（内层）
) AS t
WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
```

COUNT 查询也需加表别名：`SELECT COUNT(*) as total FROM <table> <alias> ${whereClause}`

### 2.3 新建 — INSERT 加 factory_id

```sql
INSERT INTO <table> (..., factory_id, condition, created_by, created_at, updated_at)
VALUES (..., :factory_id, N'启用', :created_by, GETDATE(), GETDATE())
```

replacements 加：`factory_id: b.factory_id || null`

### 2.4 更新 — UPDATE 加 factory_id

```sql
UPDATE <table> SET ..., factory_id = :factory_id, updated_at = GETDATE() WHERE ...
```

replacements 加：`factory_id: b.factory_id || null`

### 2.5 删除 — WHERE 追加 factory_id 防止跨工厂越权删除

```sql
DELETE FROM <table> WHERE <pk> = :id AND factory_id = :_factoryId
```

或使用 UPDATE 软删除加同样条件。

### 2.6 导入 — UPDATE 路径加 factory_id

在 UPDATE SET 中加 `factory_id = :factory_id,`，replacements 加 `factory_id: item.factory_id || null`

### 2.7 导入 — INSERT 路径加 factory_id

在 INSERT 列和 VALUES 中都加入 `factory_id` 和 `:factory_id`，replacements 加 `factory_id: item.factory_id || null`

### 2.8 导出 — fields/headers 加 factory_id

```typescript
const fields = [..., 'factory_id'];
const headers = [..., '所属工厂'];
```

---

## Step 3: 前端 List.vue 改造

### 3.1 添加 import

```typescript
import { getFactories } from '@/api/system/factory'
```

### 3.2 添加工厂列表加载

```typescript
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch (e) { /* ignore */ }
}
```

### 3.3 接口加 factory_id

```typescript
interface Xxx { ..., factory_id?: number | null }
```

### 3.4 emptyForm 加 factory_id

```typescript
const emptyForm = (): Xxx => ({ ..., factory_id: null })
```

### 3.5 onMounted 调用 loadFactories

```typescript
onMounted(() => { ..., loadFactories() })
```

### 3.6 表格列加工厂

如已存在则跳过：

```typescript
{ title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true,
  customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
```

### 3.7 新建/编辑表单加"所属工厂"下拉

在基本信息区合适位置添加工厂选择：

```html
<a-col :span="6">
  <a-form-item label="所属工厂">
    <a-select v-model:value="form.factory_id" placeholder="请选择" allow-clear>
      <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">
        {{ f.factory_short || f.factory_name }}
      </a-select-option>
    </a-select>
  </a-form-item>
</a-col>
```

### 3.8 保存 payload 加 factory_id

```typescript
const payload = { ..., factory_id: form.factory_id }
```

---

## Step 4: 现有记录更新为宁国

所有现有记录批量更新为宁国工厂（factory_id=14），执行脚本：

```js
// _update_<table>_factory.cjs
const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
dotenv.config();

const sequelize = new Sequelize({
  dialect: 'mssql', host: '127.0.0.1', port: 1433,
  database: process.env.DB_NAME || 'PowderMom',
  username: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true, tdsVersion: '7_2' } }
});

(async () => {
  const [factories] = await sequelize.query("SELECT id, factory_short FROM factory");
  const ningguo = factories.find(f => f.factory_short === '宁国');
  if (!ningguo) { console.log('未找到宁国工厂'); process.exit(1); return; }
  
  const [count] = await sequelize.query("SELECT COUNT(*) as cnt FROM <TABLE>");
  console.log('当前记录数:', count[0].cnt);
  
  await sequelize.query("UPDATE <TABLE> SET factory_id = :fid", { replacements: { fid: ningguo.id } });
  console.log('更新完成');
  
  const [verify] = await sequelize.query("SELECT TOP 5 * FROM <TABLE> ORDER BY id DESC");
  verify.forEach(r => console.log(`  factory_id=${r.factory_id}`));
  
  await sequelize.close();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
```

---

## 过滤规范（关键）

**严格遵循多工厂方案**：过滤模式下 `filter: true` 时仅 `factory_id = :_factoryId`，不包含 `IS NULL`。

| 场景 | filter | 可见范围 |
|------|--------|---------|
| 总部角色 + `x-view-mode: all` | false | 全部记录 |
| `x-factory-id` 指定工厂 | true | 仅该工厂记录 |
| 默认工厂 (`default_factory_id`) | true | 仅本工厂记录 |

过滤代码模板：

```typescript
const _factoryId = getFactoryId(req);
if (_factoryId !== null) {
  conditions.push(`<alias>.factory_id = :_factoryId`);
  replacements._factoryId = _factoryId;
}
```

---

## 验证清单

- [ ] 数据库列已添加：`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '<table>' AND COLUMN_NAME = 'factory_id'`
- [ ] 后端 nodemon 已重启且无编译错误
- [ ] API GET 列表返回 200，含 `factory_short` 字段
- [ ] API POST 创建可传入 `factory_id`
- [ ] API PUT 更新可修改 `factory_id`
- [ ] 前端表格显示"工厂"列
- [ ] 新建/编辑弹窗有"所属工厂"下拉
- [ ] 现有记录已更新为宁国工厂

---

## 常见陷阱

### 1. 先改 Controller 后加 DB 列导致崩溃

**症状**：Controller 已添加 `factory_id` 过滤和 LEFT JOIN，但数据库表尚未添加 `factory_id` 列，SQL 执行时报 `Invalid column name 'factory_id'`。

**解决**：严格按 Step 1 → Step 2 → Step 3 → Step 4 顺序执行。数据库迁移脚本必须先跑通。

### 2. ROW_NUMBER 分页 factory_id 放在外层导致分页错乱

**症状**：将 `factory_id` 过滤条件放在外层 `WHERE t._row_num > ...` 之后，导致 ROW_NUMBER 先对全表编号，过滤后行号不连续，分页结果跳跃/遗漏。

**正确做法**：factory_id 条件必须在子查询（内层）的 WHERE 中。参考 Step 2.2 的 SQL 模板。

### 3. Sequelize replacements 使用 `@` 前缀导致参数未替换

**症状**：使用 `@factoryId` 而非 `:factoryId`，Sequelize 不识别导致参数未替换或 SQL 语法错误。

**正确做法**：本项目统一使用冒号前缀参数化：`:factory_id`、`:_factoryId`。`factoryWhere.util.ts` 中的 `@` 语法仅在其内部自动转换时使用，不要在 Controller 中直接使用。

### 4. DELETE/UPDATE 遗漏 factory_id 导致跨工厂越权

**症状**：删除或更新操作只根据主键匹配，未加 `factory_id` 条件，用户可能通过猜测 ID 越权操作其他工厂的数据。

**正确做法**：所有 UPDATE/DELETE 的 WHERE 条件必须包含 `factory_id = :_factoryId`。

### 5. factoryBody.middleware 是死代码

`factoryBody.middleware.ts` 从未注册启用，不要尝试导入或使用它。factory_id 注入（写操作）实际通过 `auth.middleware.ts` 内联逻辑完成。改造时只需使用 `getFactoryId(req)` 读取即可。

### 6. 导入路径因模块深度不同而不同

`getFactoryId` 位于 `server/src/utils/factoryWhere.util.ts`，导入路径取决于 Controller 所在目录深度：
- `modules/master-data/customer/` → `../../../utils/factoryWhere.util`
- `modules/warehouse/stockIn/` → `../../../utils/factoryWhere.util`
- `services/` → `../utils/factoryWhere.util`

---

## 参考模板

完整改造参考：
- **后端**：`server/src/modules/master-data/customer/customer.controller.ts`
- **前端**：`client/src/views/master-data/Customer/List.vue`
- **工具函数**：`server/src/utils/factoryWhere.util.ts`（含 `getFactoryId`、`factoryWhere`、`insertFactoryField`、`getFactoryCode`）

详细逐行对比示例见 [reference.md](reference.md)。
