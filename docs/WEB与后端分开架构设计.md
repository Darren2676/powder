# WEB 与后端分开架构设计

## 一、架构概述

Seals MES 系统采用 **前后端分离架构**，将 WEB 前端与后端 API 服务完全独立为两个工程项目，各自拥有独立的代码仓库、依赖管理、构建流程和运行环境。前后端通过 RESTful API（JSON 格式）进行通信。

```
Seals MES System/
├── server/              ← 后端 API 服务 (Node.js + Express + TypeScript)
├── client/              ← WEB 前端 (Vue 3 + Vite + Ant Design Vue)
├── client-mobile/       ← 移动端前端 (独立工程)
└── docs/                ← 项目文档
```

## 二、技术栈说明

### 2.1 后端技术栈

| 技术 | 用途 | 版本 |
|------|------|------|
| Node.js | 运行环境 | - |
| Express | Web 框架 | 5.x |
| TypeScript | 开发语言 | 5.x |
| Sequelize | ORM 框架 | 6.x |
| SQL Server / MySQL | 数据库 | - |
| JWT (jsonwebtoken) | 身份认证 | 9.x |
| bcryptjs | 密码加密 | 3.x |
| helmet | 安全头部 | 8.x |
| cors | 跨域支持 | 2.x |
| morgan | 请求日志 | 1.x |
| multer | 文件上传 | 2.x |
| express-validator | 参数校验 | 7.x |
| dotenv | 环境变量 | 17.x |

### 2.2 前端技术栈

| 技术 | 用途 | 版本 |
|------|------|------|
| Vue 3 | 前端框架 | 3.5.x |
| Vite | 构建工具 | 7.x |
| TypeScript | 开发语言 | 5.x |
| Ant Design Vue | UI 组件库 | 4.x |
| Vue Router | 路由管理 | 4.x |
| Pinia | 状态管理 | 3.x |
| Axios | HTTP 请求 | 1.x |
| ECharts / vue-echarts | 数据图表 | 6.x / 8.x |
| ExcelJS / xlsx | Excel 导入导出 | - |

## 三、后端工程结构

```
server/
├── package.json             # 后端依赖与脚本
├── tsconfig.json            # TypeScript 配置
├── src/
│   ├── server.ts            # 应用入口：启动服务、初始化数据库、创建管理员
│   ├── app.ts               # Express 应用配置：中间件注册、路由挂载、静态文件托管
│   ├── config/              # 配置文件（数据库连接等）
│   ├── routes/              # API 路由定义（70+ 个模块）
│   │   ├── index.ts         # 路由汇总注册
│   │   ├── auth.routes.ts   # 认证路由
│   │   ├── order.routes.ts  # 生产单路由
│   │   └── ...
│   ├── controllers/         # 控制器：处理请求、调用服务、返回响应
│   │   ├── auth.controller.ts
│   │   ├── order.controller.ts
│   │   └── ...
│   ├── services/            # 业务服务层（工作流引擎、外部系统对接等）
│   │   ├── workflow.engine.ts
│   │   ├── workflow.hooks.ts
│   │   └── xinheyun.service.ts
│   ├── models/              # Sequelize 数据模型定义
│   ├── middleware/           # Express 中间件
│   │   ├── auth.middleware.ts    # JWT 身份认证
│   │   ├── role.middleware.ts    # 角色权限校验
│   │   ├── upload.middleware.ts  # 文件上传处理
│   │   └── error.middleware.ts   # 统一错误处理
│   ├── validators/          # 请求参数校验规则
│   ├── types/               # TypeScript 类型扩展
│   │   └── express.d.ts     # Express Request 类型扩展
│   └── utils/               # 工具函数（JWT、密码加密等）
├── sql/                     # 数据库脚本
├── scripts/                 # 运维脚本
├── uploads/                 # 上传文件存储目录
└── dist/                    # 编译输出目录
```

### 3.1 后端分层架构

后端采用经典的 **Route → Controller → Service → Model** 四层架构：

```
HTTP 请求
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  Routes 路由层                                               │
│  职责：定义 URL 路径与 HTTP 方法，挂载中间件，转发到控制器      │
│  示例：router.get('/orders', authenticate, controller.list)  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Middleware 中间件层                                          │
│  职责：认证(JWT)、权限校验、参数验证、文件上传、错误处理        │
│  auth.middleware.ts  →  校验 Bearer Token，注入 req.user      │
│  role.middleware.ts  →  校验用户角色权限                       │
│  error.middleware.ts →  统一异常响应格式                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Controllers 控制器层                                        │
│  职责：接收请求参数，调用业务逻辑，组装并返回 JSON 响应        │
│  不包含直接的数据库操作                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Services 服务层                                             │
│  职责：封装复杂业务逻辑（工作流引擎、外部系统对接等）          │
│  简单 CRUD 可在 Controller 中直接调用 Model                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Models 数据模型层                                           │
│  职责：Sequelize 模型定义、数据库表映射、关联关系定义          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 统一响应格式

后端所有 API 接口采用统一的 JSON 响应格式：

```json
// 成功响应
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}

// 错误响应
{
  "success": false,
  "message": "错误描述",
  "errors": [
    { "field": "字段名", "message": "错误详情" }
  ]
}
```

### 3.3 认证机制

采用 JWT（JSON Web Token）无状态认证：

1. **登录**：用户提交用户名密码 → 后端验证 → 签发 JWT Token 返回
2. **请求**：前端在 HTTP Header 中携带 `Authorization: Bearer <token>`
3. **验证**：`auth.middleware.ts` 解析 Token，查询用户，注入 `req.user`
4. **登出**：前端清除本地存储的 Token

### 3.4 API 路由注册

所有路由在 `routes/index.ts` 中统一注册到 `/api` 前缀下：

```
/api/auth           → 认证相关（登录、注册、个人信息）
/api/users          → 用户管理
/api/orders         → 生产单管理
/api/plans          → 生产计划
/api/process-tasks  → 工序任务
/api/work-reports   → 工序报工
/api/boms           → BOM 管理
/api/routing-masters → 工艺路线
/api/warehouses     → 仓库管理
/api/workflows      → 审批工作流
...（共 70+ 个模块路由）
```

## 四、前端工程结构

```
client/
├── package.json              # 前端依赖与脚本
├── vite.config.ts            # Vite 构建配置（含开发代理）
├── tsconfig.json             # TypeScript 配置
├── index.html                # SPA 入口 HTML
├── public/                   # 静态资源
├── src/
│   ├── main.ts               # 应用入口
│   ├── App.vue               # 根组件
│   ├── style.css             # 全局样式
│   ├── api/                  # API 请求封装层（与后端路由一一对应）
│   │   ├── auth.ts           # 认证接口
│   │   ├── order.ts          # 生产单接口
│   │   ├── material.ts       # 物料接口
│   │   └── ...（70+ 个模块）
│   ├── views/                # 页面视图组件
│   │   ├── Auth/             # 认证页面（Login、Register）
│   │   ├── Dashboard/        # 仪表板
│   │   ├── ItemMaster/       # 物料主数据
│   │   └── ...
│   ├── components/           # 公共组件
│   │   └── Layout/           # 布局组件（AppLayout）
│   ├── router/               # Vue Router 路由配置
│   │   └── index.ts          # 路由定义与导航守卫
│   ├── store/                # Pinia 状态管理
│   │   ├── auth.ts           # 认证状态
│   │   └── notification.ts   # 通知状态
│   ├── composables/          # Vue 组合式函数
│   │   ├── useColumnPreference.ts  # 表格列偏好设置
│   │   └── usePasswordPolicy.ts    # 密码策略
│   ├── types/                # TypeScript 类型定义
│   │   └── index.ts          # 统一类型导出
│   └── utils/                # 工具函数
│       └── request.ts        # Axios 请求封装（拦截器、错误处理）
└── dist/                     # 构建输出目录
```

### 4.1 前端分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  Views 视图层                                                │
│  职责：页面 UI 渲染、用户交互、调用 API 和 Composables        │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────┐
│ Composables   │ │  Store        │ │  Router           │
│ 组合式函数    │ │  状态管理     │ │  路由管理         │
│ 复用业务逻辑  │ │ Pinia 全局态  │ │ 导航守卫/权限控制 │
└───────────────┘ └───────────────┘ └───────────────────┘
              │            │
              ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│  API 请求层                                                  │
│  职责：封装每个模块的 HTTP 请求方法，定义请求/响应类型         │
│  每个文件对应后端一个路由模块                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  request.ts (Axios 封装)                                     │
│  职责：统一 baseURL、超时配置、JWT Token 注入、错误拦截       │
│  - 请求拦截器：自动附加 Authorization Header                  │
│  - 响应拦截器：统一错误处理（401 跳转登录、网络错误提示等）   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Axios 请求封装要点

`utils/request.ts` 是前后端通信的核心桥梁：

- **baseURL**：配置为 `/api`，所有请求自动加上此前缀
- **请求拦截器**：自动从 `localStorage` 读取 JWT Token 并附加到 Header
- **防缓存**：GET 请求自动添加时间戳参数 `_t` 和 `Cache-Control: no-cache`
- **响应拦截器**：
  - 自动提取 `response.data`，简化调用方代码
  - 401 错误自动清除 Token 并跳转登录页
  - 403/404/500/网络错误/超时 统一 `message.error()` 提示

### 4.3 路由与权限控制

前端路由使用 Vue Router，配合导航守卫实现权限控制：

```
/login          → 登录页（未认证可访问，已登录跳转首页）
/register       → 注册页
/               → 主布局（需认证）
  /             → 仪表板
  /users        → 用户管理（需管理员权限）
  /departments  → 部门管理（需管理员权限）
  /item-masters → 物料主数据
  /orders       → 生产单管理
  ...
```

- `meta.requiresAuth: true` → 需要登录才能访问
- `meta.requiresAdmin: true` → 需要管理员角色
- `meta.guestOnly: true` → 仅未登录用户可访问

## 五、前后端通信机制

### 5.1 通信方式

前后端通过 **HTTP RESTful API** 进行通信，数据格式为 **JSON**。

```
┌──────────────┐       HTTP (JSON)       ┌──────────────┐
│              │  ──────────────────────→ │              │
│   前端 WEB   │      Request            │   后端 API   │
│  (Vue 3)     │  ←────────────────────── │  (Express)   │
│              │      Response            │              │
└──────────────┘                          └──────────────┘
```

### 5.2 开发环境代理

开发时，前端运行在 Vite 开发服务器（默认端口 5173），后端运行在 Express（默认端口 3000）。通过 Vite 的 proxy 配置解决跨域问题：

```
浏览器 → http://localhost:5173/api/orders
                    │
                    ▼ (Vite Proxy)
         http://localhost:3000/api/orders
                    │
                    ▼
              Express 后端处理
```

`vite.config.ts` 中的代理配置：

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true
    },
    '/uploads': {
      target: 'http://localhost:3000',
      changeOrigin: true
    }
  }
}
```

### 5.3 生产环境部署

当前系统采用 **后端托管前端静态文件** 的部署方式：

```
              所有请求
                 │
                 ▼
┌─────────────────────────────────────┐
│         Express 后端 (:3000)         │
│                                     │
│  /api/*      → 路由到 API 处理      │
│  /uploads/*  → 静态文件目录         │
│  其他 GET    → 返回 index.html (SPA)│
│  静态资源    → client/dist/ 目录     │
└─────────────────────────────────────┘
```

在 `app.ts` 中实现：

```typescript
// 提供前端静态文件
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// SPA 路由回退：所有非 API/uploads 请求返回 index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  } else {
    next();
  }
});
```

如需更高性能，也可使用 Nginx 反向代理方案：

```
              所有请求
                 │
                 ▼
┌────────────────────────────────────┐
│        Nginx (:80 / :443)          │
│                                    │
│  /api/*     → 反向代理 → Express   │
│  /uploads/* → 反向代理 → Express   │
│  其他       → 直接返回 dist/ 静态  │
└────────────────────────────────────┘
```

## 六、前后端对应关系

### 6.1 模块对应表（部分示例）

前后端按功能模块一一对应，保持命名一致性：

| 功能模块 | 后端路由文件 | 前端 API 文件 | API 前缀 |
|---------|------------|-------------|---------|
| 身份认证 | `routes/auth.routes.ts` | `api/auth.ts` | `/api/auth` |
| 用户管理 | `routes/user.routes.ts` | `api/user.ts` | `/api/users` |
| 物料主数据 | `routes/itemMaster.routes.ts` | `api/itemMaster.ts` | `/api/item-masters` |
| 生产单 | `routes/order.routes.ts` | `api/order.ts` | `/api/orders` |
| 工序任务 | `routes/processTask.routes.ts` | `api/processTask.ts` | `/api/process-tasks` |
| 工序报工 | `routes/workReport.routes.ts` | `api/workReport.ts` | `/api/work-reports` |
| BOM 管理 | `routes/bom.routes.ts` | `api/bom.ts` | `/api/boms` |
| 工艺路线 | `routes/routingMaster.routes.ts` | `api/routingMaster.ts` | `/api/routing-masters` |
| 仓库管理 | `routes/warehouse.routes.ts` | `api/warehouse.ts` | `/api/warehouses` |
| 审批工作流 | `routes/workflow.routes.ts` | `api/workflow.ts` | `/api/workflows` |
| 质量报告 | `routes/qualityReport.routes.ts` | `api/qualityReport.ts` | `/api/quality-report` |
| 采购订单 | `routes/purchaseOrder.routes.ts` | `api/purchaseOrder.ts` | `/api/purchase-orders` |
| 销售订单 | `routes/salesOrder.routes.ts` | `api/salesOrder.ts` | `/api/sales-orders` |

### 6.2 新增模块的标准流程

当需要新增一个业务模块时，按以下步骤分别在前后端创建文件：

**后端（以"检验记录"为例）：**

```
1. models/InspectionRecord.ts        ← 定义数据模型
2. validators/inspectionRecord.ts    ← 定义参数校验规则
3. controllers/inspectionRecord.controller.ts  ← 实现业务逻辑
4. routes/inspectionRecord.routes.ts ← 定义路由并注册中间件
5. routes/index.ts                   ← 注册新路由: router.use('/inspection-records', ...)
```

**前端：**

```
1. types/index.ts                    ← 添加 TypeScript 类型定义
2. api/inspectionRecord.ts           ← 封装 API 请求方法
3. views/InspectionRecord/List.vue   ← 列表页面
4. views/InspectionRecord/Detail.vue ← 详情/编辑页面（如需要）
5. router/index.ts                   ← 注册前端路由
```

## 七、开发与运行指南

### 7.1 启动后端

```bash
cd "Seals MES System/server"
npm install          # 安装依赖
npm run dev          # 开发模式启动（nodemon + ts-node，端口 3000）
```

### 7.2 启动前端

```bash
cd "Seals MES System/client"
npm install          # 安装依赖
npm run dev          # 开发模式启动（Vite，默认端口 5173）
```

### 7.3 构建部署

```bash
# 构建前端
cd "Seals MES System/client"
npm run build        # 输出到 client/dist/

# 构建后端
cd "Seals MES System/server"
npm run build        # TypeScript 编译，输出到 server/dist/

# 生产启动
cd "Seals MES System/server"
npm run start        # 运行 node dist/server.js（同时托管前端静态文件）
```

### 7.4 开发时前后端协作流程

```
1. 先启动后端 (npm run dev) → 端口 3000
2. 再启动前端 (npm run dev) → 端口 5173
3. 浏览器访问 http://localhost:5173
4. 前端 /api/* 请求通过 Vite Proxy 转发到后端 :3000
5. 前后端可独立修改代码，各自热重载
```

## 八、架构优势

| 优势 | 说明 |
|------|------|
| **独立开发** | 前后端可以并行开发，互不阻塞，只需约定 API 接口 |
| **独立部署** | 前端构建为静态文件，后端独立运行，可分别升级 |
| **技术解耦** | 前端可替换 UI 框架，后端可切换数据库，互不影响 |
| **多端复用** | 后端 API 可同时服务于 WEB 端 (`client/`) 和移动端 (`client-mobile/`) |
| **职责清晰** | 前端专注 UI 交互与用户体验，后端专注业务逻辑与数据处理 |
| **易于测试** | 前后端可独立进行单元测试和集成测试 |
| **团队协作** | 前端和后端开发人员可以各自专注擅长的领域 |
