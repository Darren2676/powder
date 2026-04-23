# Seals MES System - 编码规范一致性分析报告

> 分析日期：2026-04-20
> 分析范围：前端 client/src（124个Vue组件）+ 后端 server/src（164个TypeScript文件）

---

## 一、总体评分

| 维度 | 前端 | 后端 | 说明 |
|------|------|------|------|
| 组件/模块结构 | 8/10 | 7/10 | 前端结构高度一致，后端目录规范好但内部实现有差异 |
| 命名规范 | 9/10 | 5/10 | 前端命名统一，后端参数命名不一致 |
| 代码风格 | 9/10 | 6/10 | 前端2空格+单引号+分号统一，后端无格式化工具 |
| 类型安全 | 7/10 | 4/10 | 前端接口定义好但有 any，后端大量 any 且无 DTO |
| 可复用性 | 5/10 | 4/10 | composable 存在但未广泛使用，后端无公共工具提取 |
| 工具链强制 | 2/10 | 2/10 | 无 ESLint/Prettier/Husky，纯靠人工自律 |

**综合评分：前端 7/10，后端 5/10**

---

## 二、已做好的部分（优势）

### 2.1 架构级规范（AGENTS.md）
- 已定义清晰的目录结构、业务域划分
- 已定义 Controller 签名、路由规范、审核流程
- 已定义 Vue 组件规范、API 封装方式

### 2.2 前端一致性（高分项）

| 项目 | 状态 | 详情 |
|------|------|------|
| 组件结构 | 高度一致 | 全部使用 `<script setup lang="ts">` 组合式 API |
| import 顺序 | 高度一致 | vue → vue-router → antd → icons → api → composables → utils |
| 代码风格 | 高度一致 | 2 空格缩进、单引号、带分号、尾逗号 |
| 变量命名 | 高度一致 | `handle*` 前缀、`*Visible`/`*Loading` 状态、`emptyForm()` 工厂 |
| 表格模式 | 一致 | a-table + pagination reactive + handleTableChange |
| 表单模式 | 一致 | a-modal + a-form + v-model:value |
| 删除确认 | 一致 | Modal.confirm + createVNode(ExclamationCircleOutlined) |
| 路由路径 | 一致 | kebab-case，带 meta.title |

### 2.3 后端一致性（高分项）

| 项目 | 状态 | 详情 |
|------|------|------|
| 目录结构 | 一致 | 每个模块含 .controller.ts + .routes.ts |
| 中间件 | 一致 | 全部路由挂载 authenticate |
| 响应格式 | 基本一致 | `{ success: true/false, data, message }` |
| SQL 参数化 | 一致 | 使用 sequelize.query() + replacements |
| 字段命名 | 一致 | 数据库字段统一 snake_case |

---

## 三、主要问题（影响 AI 生成一致性）

### 3.1 高风险问题

#### 问题 1：无自动化工具强制

**现状：**
- 无 ESLint 配置（前后端均无）
- 无 Prettier 配置
- 无 .editorconfig
- 无 Git Hooks（Husky）
- 无 lint-staged

**影响：** 规范完全依赖人工遵守，随时间推移必然退化。AI 生成代码后无法自动检测是否合规。

---

#### 问题 2：后端路由参数命名不一致

**现状：**
```typescript
// Customer 模块 - 使用 customerId
const { customerId } = req.params;

// Employee/Equipment/Finance 模块 - 使用 id
const { id } = req.params;
```

**影响：** AI 不知道该用 `:id` 还是 `:entityId`，会随机选择。

**建议：** 统一为 `:id`，已在 AGENTS.md 中明确路由定义为 `/:id`。

---

#### 问题 3：useTableList composable 使用率低

**现状：**
| 组件 | 是否使用 useTableList |
|------|---------------------|
| quality/Defect/List.vue | 是 |
| master-data/Customer/List.vue | 否（手写重复逻辑） |
| sales/SalesOrder/List.vue | 否（手写重复逻辑） |
| equipment/Equipment/List.vue | 否（手写重复逻辑） |
| production/Order/List.vue | 否（手写重复逻辑） |

**影响：** AI 无法判断应该使用 composable 还是手写 pagination/search/fetch 逻辑。

**重复代码模式（在 4+ 文件中重复出现）：**
```typescript
const pagination = reactive({
  current: 1, pageSize: 10, total: 0,
  showSizeChanger: true, showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})
const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}
```

---

#### 问题 4：后端 TypeScript 类型缺失

**现状：**
- 无 DTO（Data Transfer Object）定义
- 无 API 响应类型接口
- 查询结果全部 `const [rows]: any = await sequelize.query(...)`
- 仅有一个 `express.d.ts`，内容为 `req.user?: any`
- tsconfig.json 开启 strict 但关闭了 noUnusedLocals/noUnusedParameters

**影响：** AI 会继续生成 `any` 类型代码，TypeScript 的类型安全形同虚设。

---

#### 问题 5：状态魔法字符串散落

**现状：** 以下字符串在多个文件中直接硬编码：
```typescript
'已审核'   // 多处
'未审核'   // 多处
'启用'     // 多处
'禁用'     // 多处
'草稿'     // 采购模块
'已关闭'   // 生产模块
'未到货'   // 采购模块
```

**影响：** 无常量定义，AI 每次都要猜测正确的字符串值，且容易拼写错误。

---

### 3.2 中风险问题

#### 问题 6：日期格式化方式不统一

**现状：** 三种方式共存
```typescript
// 方式 1：dayjs（推荐）
dayjs(date).format('YYYY-MM-DD')

// 方式 2：手写 Date 对象
const d = new Date(val)
`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-...`

// 方式 3：constants 定义但未统一使用
export const DATE_FORMAT = 'YYYY-MM-DD'
```

---

#### 问题 7：后端错误处理模式混乱

**现状：** 三种模式混用
```typescript
// 模式 1：inline 400 响应 + return
if (!valid) { res.status(400).json({ success: false, message: '...' }); return; }

// 模式 2：全部交给 next(err)
catch (err) { next(err); }

// 模式 3：validator 中间件处理
router.post('/', authenticate, validateCreateCustomer, createCustomer);
```

**影响：** AI 不确定验证逻辑应放在 validator 中间件还是 controller 内。

---

#### 问题 8：事务使用不一致

**现状：**
- Finance/PurchaseOrder 模块：使用 `sequelize.transaction()`
- Customer/Employee/Equipment 模块：多步操作无事务包裹

---

#### 问题 9：请求体变量缩写不统一

**现状：**
```typescript
// Customer/Supplier - 统一缩写
const b = req.body;

// Employee - 完整解构
const { employee_number, employee_name, ... } = req.body;
```

---

#### 问题 10：前端目录大小写混用

**现状：**
- 大多数：PascalCase（`Customer/`, `SalesOrder/`, `Defect/`）
- 例外：`equipment/equipment/List.vue`（全小写）

---

## 四、工具链配置现状

| 配置文件 | Client | Server | Root |
|----------|--------|--------|------|
| ESLint | 无 | 无 | 无 |
| Prettier | 无 | 无 | 无 |
| EditorConfig | 无 | 无 | 无 |
| Husky | - | - | 无 |
| lint-staged | 无 | 无 | - |
| tsconfig.json | 有（strict） | 有（strict, 但宽松） | - |
| AGENTS.md | - | - | 有 |

**package.json scripts 现状：**

```json
// client/package.json - 无 lint/format 脚本
{ "dev": "vite", "build": "vite build", "preview": "vite preview" }

// server/package.json - 无 lint/format 脚本
{ "dev": "nodemon --exec ts-node src/server.ts", "build": "tsc", "start": "node dist/server.js" }
```

---

## 五、改进方案（按优先级排列）

### 优先级 1：完善 AGENTS.md 规范（零成本，立即生效）

在 AGENTS.md 中补充以下明确规定：

1. **路由参数统一使用 `:id`**（而非 `:customerId`）
2. **所有列表页必须使用 `useTableList` composable**
3. **请求体标准：`const b = req.body`**
4. **日期格式化统一使用 dayjs**：`dayjs(val).format('YYYY-MM-DD')`
5. **错误处理标准**：业务验证 inline 返回 400，异常 catch 调用 next(err)
6. **多步写操作必须使用 transaction**

### 优先级 2：添加状态常量文件

**后端：** `server/src/shared/constants/statuses.ts`
```typescript
export const APPROVAL_STATUS = {
  APPROVED: '已审核',
  UNAPPROVED: '未审核'
} as const

export const CONDITION_STATUS = {
  ENABLED: '启用',
  DISABLED: '禁用'
} as const
```

**前端：** `client/src/constants/statuses.ts`
```typescript
export const APPROVAL_STATUS = {
  APPROVED: '已审核',
  UNAPPROVED: '未审核'
} as const
```

### 优先级 3：添加自动化工具链

1. **ESLint + Prettier 配置**
2. **EditorConfig 文件**
3. **Husky + lint-staged**（pre-commit 自动格式化）
4. **package.json 添加 lint/format 脚本**

### 优先级 4：统一现有代码

1. 将剩余列表页迁移到 `useTableList`
2. 后端参数命名统一为 `:id`
3. 日期格式化统一到 dayjs
4. 目录名统一 PascalCase

### 优先级 5：增强类型安全

1. 后端创建 DTO interfaces
2. 封装 typedQuery 工具函数替代 `[rows]: any`
3. 前端 catch 块统一使用 `catch (error: unknown)`

---

## 六、对 AI 代码生成的影响评估

### 当前状态

| 场景 | AI 一致性 | 原因 |
|------|-----------|------|
| 新建前端列表页 | 中等 | 不确定是否用 useTableList |
| 新建前端表单页 | 高 | 模式清晰一致 |
| 新建后端 Controller | 低 | 参数命名、错误处理、事务使用不确定 |
| 新建后端路由 | 高 | AGENTS.md 定义清晰 |
| 修改现有代码 | 中等 | 需要遵循文件已有风格 |

### 实施优先级 1 后预期

| 场景 | AI 一致性 | 提升原因 |
|------|-----------|----------|
| 新建前端列表页 | 高 | 明确规定使用 useTableList |
| 新建后端 Controller | 中高 | 明确参数、错误处理、事务规则 |
| 所有场景 | 高 | AGENTS.md 规则足够具体 |

---

## 七、结论

项目在**架构层面**规范做得好（AGENTS.md 定义了合理的结构），前端代码风格一致性较高。主要短板在于：

1. **无自动化强制手段** - 完全靠人工/AI 自觉遵守
2. **后端实现细节不统一** - Controller 内部写法差异大
3. **composable 复用不足** - 好的抽象已有但推广不够
4. **类型安全薄弱** - 后端几乎全是 any

**最低成本最高收益的改进**：完善 AGENTS.md 中的细节规定（优先级 1），这对 AI 生成代码的一致性提升最大，且不需要修改任何现有代码。
