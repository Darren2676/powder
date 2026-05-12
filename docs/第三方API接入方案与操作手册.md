# Seals MES 第三方API接入方案与操作手册

## 一、方案概述

### 1.1 背景

系统需要将**生产工单**、**工序报工**、**按工序备料**、**设计BOM**四个模块的数据提供给第三方系统（如 ERP、WMS 等）对接访问。要求提供长期有效的访问凭证和标准的 RESTful API 接口。

### 1.2 方案选型

| 项目 | 选型 | 说明 |
|------|------|------|
| 认证方式 | API Key 长期密钥 | 一次性配置，无需刷新，适合服务间调用 |
| 权限控制 | 按模块细粒度 | 4个模块 × 读写 = 8个权限位 |
| 数据范围 | 查询 + 写入 | 支持读取和创建/更新操作 |
| 传输安全 | HTTPS + IP白名单 | 双重保障访问安全 |

### 1.3 架构设计

```
第三方系统
    │
    ├── X-API-Key: sk-xxxx ──────┐
    │                            ▼
    │                   ┌─────────────────┐
    │                   │  Open API 网关   │
    │                   │  /api/v1/open/   │
    │                   ├─────────────────┤
    │                   │  速率限制 100/min │
    │                   ├─────────────────┤
    │                   │  apiKeyAuth 中间件│ ← 验证密钥有效性
    │                   ├─────────────────┤
    │                   │  权限检查中间件    │ ← 检查模块+动作权限
    │                   └────────┬────────┘
    │                            │
    │              ┌─────────────┼─────────────┬──────────────┐
    │              ▼             ▼             ▼              ▼
    │         ┌────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐
    │         │  工单   │  │  工序报工 │  │ 按工序备料│  │ 设计BOM │
    │         │ orders │  │workReports│  │preparations│  │   bom  │
    │         └────────┘  └──────────┘  └──────────┘  └─────────┘
    │
 MES 管理后台（JWT 认证）
    │
    ├── 系统设置 → API密钥管理（创建/编辑/禁用/删除密钥）
    └── 查看调用日志和统计
```

## 二、API Key 认证机制

### 2.1 密钥格式

- 前缀：`sk-`
- 长度：48字符随机十六进制字符串
- 示例：`sk-a4f92352a2126695318836e026a78f8e1027fa439f96e1c9`

### 2.2 密钥存储

- 数据库存储 SHA-256 哈希值，不存储明文
- 创建时仅展示一次完整密钥，之后仅显示脱敏格式（`sk-a4****1c9`）
- 支持重新生成密钥（旧密钥立即失效）

### 2.3 认证流程

1. 第三方在请求头中携带 `X-API-Key: sk-xxxx`
2. 服务端对密钥做 SHA-256 哈希，与数据库 `secret_hash` 比对
3. 检查密钥状态：`is_active = true`、未过期、IP 白名单（如有）
4. 记录 `last_used_at` 和调用日志

### 2.4 权限矩阵

| 权限字段 | 说明 | 示例 |
|---------|------|------|
| `perm_order_read` | 读取生产工单 | GET /open/orders |
| `perm_order_write` | 创建/更新工单 | POST/PUT /open/orders |
| `perm_work_report_read` | 读取工序报工 | GET /open/work-reports |
| `perm_work_report_write` | 创建报工 | POST /open/work-reports |
| `perm_prep_read` | 读取备料单 | GET /open/material-preparations |
| `perm_prep_write` | 创建备料单 | POST /open/material-preparations/generate-by-process |
| `perm_bom_read` | 读取BOM | GET /open/bom |
| `perm_bom_write` | （预留） | 暂未实现 |

## 三、API 接口清单

### 3.1 生产工单 `/api/v1/open/orders`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /orders | order:read | 查询工单列表（分页，最大100条/页） |
| GET | /orders/:id | order:read | 查询工单详情 |
| POST | /orders | order:write | 创建工单 |
| PUT | /orders/:id | order:write | 更新工单 |

**查询参数**：`page`, `limit`, `search`, `status`, `start_date`, `end_date`

**创建/更新字段**：
```json
{
  "production_order_number": "PO-2026-001",
  "item_number": "110103",
  "item_name": "油封",
  "quantity": 1000,
  "unit": "PCS",
  "planned_start_date": "2026-05-01",
  "planned_end_date": "2026-05-10",
  "priority": "普通",
  "status": "已下达",
  "remark": ""
}
```

### 3.2 工序报工 `/api/v1/open/work-reports`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /work-reports | work_report:read | 查询报工列表 |
| GET | /work-reports/:id | work_report:read | 查询报工详情 |
| POST | /work-reports | work_report:write | 创建报工 |

**创建字段**：
```json
{
  "production_order_number": "PO-2026-001",
  "process_code": "LH",
  "process_name": "硫化",
  "report_quantity": 500,
  "defect_quantity": 2,
  "worker_name": "张三",
  "work_center_code": "WC-LH01",
  "remark": ""
}
```

### 3.3 按工序备料 `/api/v1/open/material-preparations`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /material-preparations | prep:read | 查询备料单列表 |
| GET | /material-preparations/:id/details | prep:read | 查询备料明细 |
| GET | /material-preparations/:id/details-grouped | prep:read | 按物料分组的明细 |
| POST | /material-preparations/generate-by-process | prep:write | 按工序自动生成备料单 |

**按工序生成备料参数**：
```json
{
  "production_order_number": "PO-2026-001",
  "process_code": "LH",
  "preparation_date": "2026-05-08"
}
```

### 3.4 设计BOM `/api/v1/open/bom`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /bom | bom:read | 查询BOM列表 |
| GET | /bom/:id | bom:read | 查询BOM详情（头+行） |
| GET | /bom/:id/tree | bom:read | 查询BOM树形结构（最多5层） |
| GET | /bom/:id/flatten | bom:read | 查询BOM扁平化展开 |

**查询参数**：`page`, `limit`, `search`, `bom_type`

## 四、安全机制

### 4.1 速率限制

- 默认：100 次/分钟
- 可按密钥自定义 `rate_limit` 值
- 超限返回 `429 Too Many Requests`

### 4.2 IP 白名单

- 可为每个密钥配置 `allowed_ips`（逗号分隔）
- 留空表示不限制来源 IP
- 配置后仅允许指定 IP 访问

### 4.3 密钥过期

- 支持 `expires_at` 设置过期时间
- 过期后返回 `401 Unauthorized`
- 留空表示永不过期

### 4.4 传输安全

- 生产环境必须启用 HTTPS
- API Key 通过 `X-API-Key` 请求头传输（不通过 URL 参数）
- CORS 已配置允许 `X-API-Key` 头

## 五、操作手册

### 5.1 管理员操作

#### 5.1.1 创建 API 密钥

1. 登录 MES 管理后台
2. 进入 **系统设置 → API密钥管理**
3. 点击 **新建密钥** 按钮
4. 填写信息：
   - **密钥名称**：标识用途（如 "ERP系统对接"）
   - **客户端名称**：第三方系统/公司名称
   - **描述**：用途说明
   - **访问权限**：勾选需要的模块读/写权限
   - **频率限制**：设置每分钟最大请求数
   - **IP白名单**：可选，填写第三方服务器 IP
   - **过期时间**：可选，设置密钥有效期
5. 点击确定，**立即复制并保管密钥**（仅显示一次）

#### 5.1.2 编辑/禁用/删除密钥

- **编辑**：修改权限、频率限制、IP 白名单等
- **禁用**：临时停用密钥（不删除，可随时重新启用）
- **重新生成**：旧密钥立即失效，生成新密钥
- **删除**：永久删除密钥（不可恢复）

#### 5.1.3 查看调用日志

1. 在密钥列表中点击 **日志** 按钮
2. 查看该密钥的调用记录（时间、端点、状态码、响应时间、IP）

### 5.2 第三方对接操作

#### 5.2.1 接入步骤

1. 向 MES 管理员申请 API 密钥
2. 获取密钥值（`sk-` 开头的字符串）
3. 在请求头中携带密钥调用接口

#### 5.2.2 请求示例

**cURL 示例**：
```bash
# 查询生产工单列表
curl -X GET "http://mes.company.com/api/v1/open/orders?page=1&limit=20" \
  -H "X-API-Key: sk-your-api-key-here"

# 查询BOM树形结构
curl -X GET "http://mes.company.com/api/v1/open/bom/110103/tree" \
  -H "X-API-Key: sk-your-api-key-here"

# 创建报工记录
curl -X POST "http://mes.company.com/api/v1/open/work-reports" \
  -H "X-API-Key: sk-your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "production_order_number": "PO-2026-001",
    "process_code": "LH",
    "report_quantity": 500,
    "worker_name": "张三"
  }'
```

**Python 示例**：
```python
import requests

API_BASE = "http://mes.company.com/api/v1/open"
API_KEY = "sk-your-api-key-here"
HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 查询工单
resp = requests.get(f"{API_BASE}/orders", headers=HEADERS, params={"page": 1, "limit": 20})
data = resp.json()

# 创建报工
resp = requests.post(f"{API_BASE}/work-reports", headers=HEADERS, json={
    "production_order_number": "PO-2026-001",
    "process_code": "LH",
    "report_quantity": 500,
    "worker_name": "张三"
})
```

#### 5.2.3 错误码说明

| HTTP 状态码 | 说明 | 处理建议 |
|------------|------|---------|
| 200 | 成功 | - |
| 400 | 请求参数错误 | 检查请求体格式 |
| 401 | 未认证/密钥无效 | 检查 X-API-Key 头 |
| 403 | 权限不足 | 联系管理员开通对应权限 |
| 404 | 资源不存在 | 检查请求路径和ID |
| 429 | 请求频率超限 | 降低请求频率或联系管理员提高限制 |
| 500 | 服务器内部错误 | 联系管理员排查 |

#### 5.2.4 最佳实践

1. **安全保管密钥**：不要将密钥硬编码在代码中，使用环境变量或配置文件
2. **使用 IP 白名单**：限定第三方服务器 IP，减少密钥泄露风险
3. **设置过期时间**：定期轮换密钥
4. **合理设置频率限制**：避免过高的请求频率影响系统性能
5. **错误重试**：遇到 429 或 5xx 错误时，采用指数退避策略重试
6. **监控调用日志**：定期查看调用统计，发现异常及时处理

## 六、数据库表结构

### 6.1 api_key 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT IDENTITY | 主键 |
| key_name | NVARCHAR(100) | 密钥名称 |
| api_key | NVARCHAR(200) | 密钥值 |
| secret_hash | NVARCHAR(128) | SHA-256哈希 |
| client_name | NVARCHAR(200) | 客户端名称 |
| description | NVARCHAR(500) | 描述 |
| perm_order_read | BIT | 工单读权限 |
| perm_order_write | BIT | 工单写权限 |
| perm_work_report_read | BIT | 报工读权限 |
| perm_work_report_write | BIT | 报工写权限 |
| perm_prep_read | BIT | 备料读权限 |
| perm_prep_write | BIT | 备料写权限 |
| perm_bom_read | BIT | BOM读权限 |
| perm_bom_write | BIT | BOM写权限 |
| is_active | BIT | 是否启用 |
| rate_limit | INT | 频率限制（次/分钟） |
| allowed_ips | NVARCHAR(500) | IP白名单 |
| expires_at | DATETIME | 过期时间 |
| last_used_at | DATETIME | 最近使用时间 |
| created_by | NVARCHAR(50) | 创建人 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 6.2 api_key_usage_log 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT IDENTITY | 主键 |
| api_key_id | INT | 关联 api_key.id |
| endpoint | NVARCHAR(200) | 请求端点 |
| method | NVARCHAR(10) | HTTP方法 |
| status_code | INT | 响应状态码 |
| ip_address | NVARCHAR(50) | 请求IP |
| response_time | INT | 响应时间(ms) |
| created_at | DATETIME | 调用时间 |

## 七、文件清单

### 后端新增文件

| 文件 | 说明 |
|------|------|
| server/src/middleware/apiKeyAuth.middleware.ts | API Key认证中间件 |
| server/src/middleware/apiKeyPermission.middleware.ts | 权限检查中间件 |
| server/src/modules/open/index.ts | Open API路由入口 |
| server/src/modules/open/orders/orders.controller.ts | 工单控制器 |
| server/src/modules/open/orders/orders.routes.ts | 工单路由 |
| server/src/modules/open/workReports/workReports.controller.ts | 报工控制器 |
| server/src/modules/open/workReports/workReports.routes.ts | 报工路由 |
| server/src/modules/open/preparations/preparations.controller.ts | 备料控制器 |
| server/src/modules/open/preparations/preparations.routes.ts | 备料路由 |
| server/src/modules/open/bom/bom.controller.ts | BOM控制器 |
| server/src/modules/open/bom/bom.routes.ts | BOM路由 |
| server/src/modules/system/apiKey/apiKey.controller.ts | 密钥管理控制器 |
| server/src/modules/system/apiKey/apiKey.routes.ts | 密钥管理路由 |

### 后端修改文件

| 文件 | 修改内容 |
|------|---------|
| server/src/app.ts | 添加 X-API-Key 到 CORS、添加 Open API 速率限制 |
| server/src/routes/index.ts | 注册 /open 路由 |

### 前端新增文件

| 文件 | 说明 |
|------|------|
| client/src/api/system/apiKey.ts | API Key接口层 |
| client/src/views/system/ApiKey/List.vue | 密钥管理页面 |

### 前端修改文件

| 文件 | 修改内容 |
|------|---------|
| client/src/router/system.ts | 添加 api-keys 路由 |
| client/src/router/index.ts | 添加 ApiKeyList 权限映射 |
| client/src/components/Layout/AppSidebar.vue | 添加 api-keys 路由映射 |
