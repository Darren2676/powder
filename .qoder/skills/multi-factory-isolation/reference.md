# 多工厂隔离 — 详细参考

本文档提供 customer 模块的完整改造前后对比，作为其他主数据模块改造的逐行参考。

---

## 后端 Controller 改造（customer.controller.ts）

### 改动 1：添加 import

```typescript
// 在现有 import 后追加
import { getFactoryId } from '../../../utils/factoryWhere.util';
```

### 改动 2：export fields/headers 追加 factory_id

```typescript
// 改造前
const fields = ['customer_number', 'customer_name', ..., 'payment_terms'];
const headers = ['客户编号', '客户名称', ..., '付款条件'];

// 改造后
const fields = ['customer_number', 'customer_name', ..., 'payment_terms', 'factory_id'];
const headers = ['客户编号', '客户名称', ..., '付款条件', '所属工厂'];
```

### 改动 3：getList — 添加工厂过滤 + LEFT JOIN

**改造前（无工厂过滤）：**
```typescript
const conditions: string[] = [];
// ... 仅 search 条件
let whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

const dataSql = `
  SELECT *, ROW_NUMBER() OVER (ORDER BY customer_number) AS _row_num
  FROM customer
  ${whereClause}
`;
```

**改造后（加工厂过滤 + JOIN）：**
```typescript
const conditions: string[] = [];
// ... search 条件 ...

// 多工厂数据隔离过滤
const _factoryId = getFactoryId(req);
if (_factoryId !== null) {
  conditions.push(`c.factory_id = :_factoryId`);
  replacements._factoryId = _factoryId;
}

let whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

const countSql = `SELECT COUNT(*) as total FROM customer c ${whereClause}`;

const dataSql = `
  SELECT * FROM (
    SELECT c.*, f.factory_name, f.factory_short,
      ROW_NUMBER() OVER (ORDER BY c.customer_number) AS _row_num
    FROM customer c
    LEFT JOIN factory f ON c.factory_id = f.id
    ${whereClause}
  ) AS t
  WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
`;
```

**关键要点：**
- COUNT 查询改成 `FROM customer c`（带别名）
- 子查询内使用 LEFT JOIN 获取工厂名称
- factory_id 过滤条件在子查询 WHERE 中（非外层）

### 改动 4：create — INSERT 加 factory_id

**改造前：**
```sql
INSERT INTO customer (customer_number, ..., payment_terms, condition, created_by, created_at, updated_at)
VALUES (:customer_number, ..., :payment_terms, :condition, :created_by, GETDATE(), GETDATE())
```
```typescript
replacements: {
  ..., payment_terms: b.payment_terms || '',
  condition: b.condition || CONDITION_STATUS.ENABLED, created_by: username
}
```

**改造后：**
```sql
INSERT INTO customer (customer_number, ..., payment_terms,
  factory_id, condition, created_by, created_at, updated_at)
VALUES (:customer_number, ..., :payment_terms,
  :factory_id, :condition, :created_by, GETDATE(), GETDATE())
```
```typescript
replacements: {
  ..., payment_terms: b.payment_terms || '',
  factory_id: b.factory_id || null,
  condition: b.condition || CONDITION_STATUS.ENABLED, created_by: username
}
```

### 改动 5：update — UPDATE 加 factory_id

**改造前：**
```sql
UPDATE customer SET
  customer_name = :customer_name, ..., payment_terms = :payment_terms,
  updated_at = GETDATE()
WHERE customer_number = :id
```

**改造后：**
```sql
UPDATE customer SET
  customer_name = :customer_name, ..., payment_terms = :payment_terms,
  factory_id = :factory_id,
  updated_at = GETDATE()
WHERE customer_number = :id
```
```typescript
replacements: {
  ..., payment_terms: b.payment_terms,
  factory_id: b.factory_id || null
}
```

### 改动 6：导入 — UPDATE 路径

**改造前：**
```sql
UPDATE customer SET
  customer_name = :customer_name, ..., payment_terms = :payment_terms,
  updated_at = GETDATE()
WHERE customer_number = :customer_number
```

**改造后：**
```sql
UPDATE customer SET
  customer_name = :customer_name, ..., payment_terms = :payment_terms,
  factory_id = :factory_id,
  updated_at = GETDATE()
WHERE customer_number = :customer_number
```
```typescript
replacements: {
  ..., payment_terms: item.payment_terms || '',
  factory_id: item.factory_id || null
}
```

### 改动 7：导入 — INSERT 路径

**改造前：**
```sql
INSERT INTO customer (customer_number, ..., payment_terms, condition, created_by, created_at, updated_at)
VALUES (:customer_number, ..., :payment_terms, N'启用', :created_by, GETDATE(), GETDATE())
```

**改造后：**
```sql
INSERT INTO customer (customer_number, ..., payment_terms,
  factory_id, condition, created_by, created_at, updated_at)
VALUES (:customer_number, ..., :payment_terms,
  :factory_id, N'启用', :created_by, GETDATE(), GETDATE())
```
```typescript
replacements: {
  ..., payment_terms: item.payment_terms || '',
  factory_id: item.factory_id || null,
  created_by: username
}
```

---

## 前端 List.vue 改造

### 改动 1：添加 import

```typescript
import { getFactories } from '@/api/system/factory'
```

### 改动 2：interface 加 factory_id

```typescript
interface Customer {
  // ... existing fields ...
  factory_id?: number | null
}
```

### 改动 3：emptyForm 加 factory_id

```typescript
const emptyForm = (): Customer => ({
  // ... existing fields ...
  factory_id: null
})
```

### 改动 4：添加工厂列表加载

```typescript
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) {
      factoryList.value = res.data.items || []
    }
  } catch (e) { /* ignore */ }
}
```

### 改动 5：onMounted 调用

```typescript
onMounted(() => {
  loadFactories()
  fetchData()
  loadColumnPreference()
})
```

### 改动 6：表格列加"工厂"

```typescript
const defaultDataColumns: any[] = [
  {
    title: '工厂',
    dataIndex: 'factory_short',
    key: 'factory_short',
    width: 80,
    resizable: true,
    customRender: ({ record }: any) => record.factory_short || record.factory_name || '-'
  },
  // ... other columns ...
]
```

### 改动 7：新建/编辑表单加"所属工厂"下拉

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

### 改动 8：搜索栏添加工厂筛选（可选）

```html
<a-col :span="6">
  <a-form-item label="工厂">
    <a-select v-model:value="searchFilters.factory_id" placeholder="全部" allow-clear @change="fetchData">
      <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">
        {{ f.factory_short || f.factory_name }}
      </a-select-option>
    </a-select>
  </a-form-item>
</a-col>
```

---

## 验证清单（执行顺序）

1. **数据库列检查**：
   ```sql
   SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = '<table>' AND COLUMN_NAME = 'factory_id'
   ```

2. **后端重启**：确认 nodemon 无编译错误

3. **API 验证**：
   - `GET /api/<entity>?page=1&limit=5` → 200，含 `factory_short` 字段
   - `POST /api/<entity>` → 可传入 `factory_id` 并返回 200
   - `PUT /api/<entity>/:id` → 可修改 `factory_id` 并返回 200

4. **前端验证**：
   - 表格显示"工厂"列
   - 新建/编辑弹窗有"所属工厂"下拉
   - 保存后表格数据正确显示工厂简称

5. **数据迁移验证**：
   ```sql
   SELECT COUNT(*) FROM <table> WHERE factory_id IS NULL
   ```
   应为 0（所有记录已分配工厂）。
