# Seals MES系统API接口体系与金蝶/用友接口模式对比分析

## 一、Seals MES系统API接口体系

### 1.1 基础架构

| 项目 | 说明 |
|------|------|
| 协议 | HTTP/HTTPS |
| 数据格式 | JSON |
| Base URL | `/api/v1` |
| 认证方式 | JWT Bearer Token |
| 分页方式 | `ROW_NUMBER()`（兼容SQL Server 2008） |
| 事务控制 | `sequelize.transaction()` 多表写操作 |
| 审批状态锁 | 草稿可编辑/删除，已提交/已审批禁止修改 |

### 1.2 接口种类（按HTTP方法分类）

| HTTP方法 | 路径模式 | 用途 | 说明 |
|----------|----------|------|------|
| `GET` | `/资源名` | 分页列表 | 支持 `page`/`limit`/`search`/`approval_status` 等查询参数 |
| `GET` | `/资源名/:id` | 详情查询 | 按主键获取单条记录含关联明细 |
| `POST` | `/资源名` | 新建 | 创建表头+表体，自动生成编号 |
| `PUT` | `/资源名/:id` | 更新 | 先删后插明细行，审批状态校验 |
| `DELETE` | `/资源名/:id` | 删除 | 级联删除明细，审批状态校验 |
| `GET` | `/资源名/export` | 导出Excel | 返回blob流，支持搜索过滤 |
| `POST` | `/资源名/import` | 导入Excel | multipart/form-data上传 |
| `POST` | `/资源名/:id/confirm` | 业务确认 | 委外回收确认、入库确认等 |
| `POST` | `/资源名/:id/complete` | 业务完成 | 委外质检完成等 |

### 1.3 通用审批接口（跨模块统一）

| 接口 | 路径 | 说明 |
|------|------|------|
| 提交审批 | `POST /approval/submit` | 参数：module_name + record_id |
| 审批通过 | `POST /approval/approve` | 参数：module_name + record_id |
| 撤回 | `POST /approval/withdraw` | 参数：module_name + record_id |
| 反审批 | `POST /approval/reverse` | 参数：module_name + record_id |

### 1.4 11大业务域接口一览

| 业务域 | 子模块数 | 主要路由前缀 |
|--------|---------|-------------|
| 系统管理 | 12 | `/auth`, `/users`, `/roles`, `/permissions`, `/departments`, `/approval`, `/workflows`... |
| 基础数据 | 22 | `/customers`, `/suppliers`, `/item-masters`, `/boms`, `/procedures`, `/work-centers`... |
| 销售管理 | 7 | `/sales-orders`, `/sales-prices`, `/forecasts`, `/shipping-orders`, `/return-orders`... |
| 计划管理 | 3 | `/plans`, `/mps`, `/mrp` |
| 生产管理 | 14+ | `/orders`, `/work-reports`, `/outsourcing-reqs`, `/outsourcing-prices`... |
| 采购管理 | 5 | `/purchase-reqs`, `/purchase-orders`, `/purchase-prices`, `/piece-rate-prices`... |
| 仓库管理 | 5 | `/material-warehouse`, `/finished-goods`, `/stock-ins`, `/stock-counts`... |
| 质量管理 | 13 | `/defects`, `/inspection-specs`, `/production-inspections`, `/nonconforming-products`... |
| 设备管理 | 6 | `/equipments`, `/moulds`, `/equipment-oee`... |
| 财务管理 | 1 | `/accounting-periods` |
| 集成对接 | 3 | `/xhy-inspect`, `/xhy-inventory`, `/batch-trace` |

---

## 二、金蝶云星空（K/3 Cloud）WebAPI接口体系

### 2.1 基础架构

| 项目 | 说明 |
|------|------|
| 协议 | HTTP/HTTPS |
| 数据格式 | JSON |
| Base URL | `/K3Cloud/Kingdee.BOS.WebApi.ServicesStub` |
| 认证方式 | Cookie/Session（先调用登录接口获取会话） |
| 核心特点 | **模拟前端录单操作**，按字段逐一填充触发业务逻辑 |

### 2.2 核心接口方法（操作导向型）

金蝶的API设计理念是**操作驱动**，而非RESTful的资源驱动。所有操作通过同一个服务端点不同方法名调用：

| 接口方法 | 功能 | 说明 |
|----------|------|------|
| `Save` | 保存 | 新增或修改单据，传入完整JSON数据包 |
| `Submit` | 提交 | 将草稿单据提交审核 |
| `Audit` | 审核 | 审批通过单据 |
| `Delete` | 删除 | 删除单据 |
| `View` | 查看 | 按ID获取单据完整数据 |
| `Execute` | 执行 | 执行自定义操作 |
| `Draft` | 暂存 | 保存为草稿 |
| `Allocate` | 分配 | 分配基础资料到组织 |
| `BillQuery` | 单据查询 | 按条件查询单据列表 |
| `ExecuteBillQuery` | 表单查询 | 执行表单数据查询 |
| `BatchSave` | 批量保存 | 大数据量场景批量创建单据 |

### 2.3 金蝶接口调用流程

```
1. 登录 → AuthService.ValidateUser → 获取Cookie
2. 保存 → DynamicFormService.Save → 传入JSON数据包
3. 提交 → DynamicFormService.Submit → 传入单据ID
4. 审核 → DynamicFormService.Audit → 传入单据ID
```

### 2.4 金蝶特殊参数

| 参数 | 说明 |
|------|------|
| `IsDeleteEntry` | 修改时是否删除未传入的分录行 |
| `IsVerifyBaseDataField` | 是否校验基础资料合法性 |
| `IsAutoSubmitAndAudit` | 是否自动提交审核（已废弃） |
| `IsEntryBatchFill` | 是否批量填充分录 |
| `SubSystemId` | 子系统ID（模块授权校验） |
| `InterationFlags` | 交互校验忽略标识 |
| `NeedUpDateFields` | 需更新的字段列表 |
| `NeedReturnFields` | 需返回的字段列表 |

---

## 三、用友U8/U9C API接口体系

### 3.1 五种接口方式

用友U8提供了**五种**不同技术路线的接口，各有适用场景：

| 方式 | 协议 | 数据格式 | 适用场景 | 官方推荐 |
|------|------|---------|---------|---------|
| **EAI** | COM+组件 | XML/Excel | 数据初始化、批量导入 | ✅ |
| **U8 API** | COM+组件 | XML/BO | 全功能二次开发 | ✅（最强大） |
| **OpenAPI** | HTTP/HTTPS | JSON | 外部系统互联 | ✅（需外网） |
| **CO** | 内部COM | XML(DOM) | 用友内部调用 | ❌ 不开放 |
| **SQL直连** | 数据库连接 | SQL | 临时数据修改 | ❌ 不推荐 |

### 3.2 U8 API（最强大方式）

| 操作 | 支持 | 说明 |
|------|------|------|
| 增/删/改/查 | ✅ | 完整CRUD |
| 审核/弃审 | ✅ | 审批流程操作 |
| 事件处理 | ✅ | 保存前/后、删除前/后、审核前/后 |
| 上下游关联 | ✅ | 生成的单据支持上下游单据关联 |
| 自定义项 | ✅ | XML格式支持扩展自定义字段 |

### 3.3 用友OpenAPI方式

| 操作 | 支持 | 说明 |
|------|------|------|
| 增/删/改 | ✅ | 基本数据操作 |
| 审核/弃审 | ✅ | 审批操作 |
| 事件处理 | ❌ | 不支持事件 |
| 上下游关联 | ❌ | 不支持 |
| 部署要求 | 需外网 | 请求经用友服务器中转 |

### 3.4 用友U9C OpenAPI

U9C较U8现代化，主要方式：

| 方式 | 协议 | 说明 |
|------|------|------|
| OpenAPI | HTTPS/JSON | RESTful风格，需用友云中转 |
| SVC接口 | SOAP/WCF | 直接调用U9C服务 |
| DBSession | 数据库 | 直接操作数据库 |
| REST API | HTTP/JSON | 自定义开发 |

---

## 四、三方对比分析

### 4.1 架构理念对比

| 维度 | Seals MES | 金蝶云星空 | 用友U8/U9C |
|------|-----------|-----------|------------|
| **设计理念** | RESTful资源导向 | 操作模拟导向 | 多方式并存 |
| **接口风格** | 标准 REST（GET/POST/PUT/DELETE） | RPC式（统一端点+方法名） | COM组件 + OpenAPI混合 |
| **数据格式** | JSON | JSON | XML/JSON（视方式） |
| **认证方式** | JWT Bearer Token | Cookie/Session | API Key + Token |
| **版本管理** | URL路径 `/api/v1` | 无显式版本 | 无显式版本 |
| **状态码** | HTTP标准状态码 | 统一200+业务码 | HTTP标准 + 业务码 |

### 4.2 操作能力对比

| 操作 | Seals MES | 金蝶云星空 | 用友U8 API | 用友OpenAPI |
|------|-----------|-----------|-----------|-------------|
| 新增 | `POST /资源` | `Save` | `Add` | `POST` |
| 修改 | `PUT /资源/:id` | `Save`（传FID） | `Update` | `PUT` |
| 删除 | `DELETE /资源/:id` | `Delete` | `Delete` | `DELETE` |
| 查询列表 | `GET /资源?page=&limit=` | `BillQuery` | `Load` | `GET` |
| 查询详情 | `GET /资源/:id` | `View` | `GetById` | `GET /:id` |
| 提交审批 | `POST /approval/submit` | `Submit` | `Verify/Submit` | `POST` |
| 审批通过 | `POST /approval/approve` | `Audit` | `Approve` | `POST` |
| 撤回 | `POST /approval/withdraw` | — | `UnApprove` | — |
| 反审批 | `POST /approval/reverse` | — | `UnApprove` | — |
| 导出 | `GET /资源/export` | — | — | — |
| 导入 | `POST /资源/import` | — | EAI导入 | — |
| 批量操作 | 逐条调用 | `BatchSave` | EAI批量 | — |
| 事件钩子 | EventBus（内部） | 插件事件 | 保存前/后事件 | ❌ |

### 4.3 数据交互模式对比

| 维度 | Seals MES | 金蝶云星空 | 用友U8 |
|------|-----------|-----------|--------|
| **交互模式** | 前后端分离API | 模拟前端录单 | 组件调用/API |
| **字段填充** | 前端构造→后端校验→入库 | 按顺序逐一模拟填充字段 | 整包传入 |
| **业务逻辑触发** | Controller层显式编码 | 字段值变更事件自动触发 | 事件驱动 |
| **修改方式** | 全量替换明细（先删后插） | 传FID+需改字段（差异更新） | 全量/增量 |
| **上下游关联** | 业务逻辑中显式处理 | 自动建立关联 | API方式支持 |
| **性能优化** | 精简SQL + 分页 | 精简JSON + 批量接口 | 批量导入 |

### 4.4 扩展与集成能力对比

| 维度 | Seals MES | 金蝶云星空 | 用友U8/U9C |
|------|-----------|-----------|------------|
| **新增业务模块** | Controller + Routes + Vue页面 | BOSIDE开发 + 插件 | UAP开发 + API |
| **自定义字段** | 数据库直接加列 | BOSIDE添加 | 自定义项 |
| **第三方对接** | RESTful API直接调用 | WebAPI + OpenAPI | OpenAPI（需外网中转） |
| **移动端** | 独立Vite APP（5175端口） | 金蝶云APP | 用友云APP |
| **事件驱动** | EventBus + Subscriber | 插件事件 | COM事件 |
| **实时推送** | SSE（Server-Sent Events） | WebSocket | — |
| **离线能力** | 暂无 | 暂无 | 暂无 |

---

## 五、Seals MES系统改进建议

### 5.1 相比金蝶/用友的不足

| 方面 | 现状 | 改进方向 |
|------|------|---------|
| **批量操作** | 逐条CRUD | 增加BatchSave/BatchDelete批量接口 |
| **差异更新** | 明细行先删后插 | 支持按EntryId差异更新 |
| **字段级事件** | 无自动触发 | 考虑字段变更事件通知机制 |
| **上下游关联** | 显式编码 | 自动关联链路 |
| **接口版本化** | `/api/v1` | 完善版本路由策略 |

### 5.2 相比金蝶/用友的优势

| 方面 | 优势说明 |
|------|---------|
| **RESTful标准** | 符合现代Web标准，第三方对接零学习成本 |
| **前后端分离** | 独立部署、独立扩展 |
| **JWT认证** | 无状态Token，横向扩展友好 |
| **统一审批** | 跨模块通用审批接口，无需每个模块单独实现 |
| **导入导出** | 每个模块标配Excel导入导出 |
| **实时推送** | SSE机制支持待办即时推送 |
| **移动端独立** | 独立APP端，不依赖PC端 |

---

## 六、总结

| 系统 | 核心特点 | 适用场景 |
|------|---------|---------|
| **Seals MES** | RESTful + JWT + 前后端分离 | 制造执行系统，生产现场管理 |
| **金蝶云星空** | 操作模拟 + 字段事件 + 插件体系 | 大中型企业ERP，财务供应链一体化 |
| **用友U8** | 多方式并存（COM/OpenAPI/SQL） | 中小型企业ERP，灵活二开 |
| **用友U9C** | 开放API + 云原生 | 大型集团企业，多组织协同 |

三套系统在接口设计上各有侧重：Seals MES追求**轻量、标准、易对接**；金蝶追求**业务逻辑完整性**（模拟录单）；用友追求**方式多样、灵活选择**。对于MES系统与ERP的集成对接，建议采用**RESTful API + 消息队列**的松耦合模式。
