# Seals MES System - Windows 11 + SQL Server 2008 部署指南

> 本文档为《安装与部署手册》的补充文档，针对 **Windows 11 + SQL Server 2008** 环境的差异进行说明。  
> 通用部署步骤（Node.js 安装、前端构建、PM2/NSSM 服务管理等）请参照主手册《安装与部署手册.md》。

---

## 一、环境兼容性总览

| 组件 | 版本 | 兼容性 | 说明 |
|------|------|--------|------|
| **操作系统** | Windows 11 | ✅ 完全兼容 | Node.js、IIS 均可在 Windows 11 上运行 |
| **数据库** | SQL Server 2008 / 2008 R2 | ✅ 兼容（需配置） | 需设置 TDS 协议版本为 7_2 |
| **Node.js** | 20.x LTS | ✅ 完全兼容 | Windows 11 完整支持 |
| **tedious 驱动** | v19.x | ⚠️ 需配置 TDS 版本 | 默认 TDS 版本高于 SQL Server 2008 支持范围 |
| **Sequelize ORM** | v6.37.x | ✅ 兼容 | 可能出现版本提示警告，不影响功能 |
| **SQL 语法** | 项目使用的全部语法 | ✅ 完全兼容 | 详见第三节 |
| **IIS** | Windows 11 内置 | ✅ 兼容 | 需手动启用 IIS 功能 |

---

## 二、与主手册的关键差异

| 差异项 | 主手册（Server 2016 + SQL 2014） | 本文档（Windows 11 + SQL 2008） |
|--------|-------------------------------|-------------------------------|
| .NET Framework | 需手动启用 3.5 | SQL Server 2008 依赖 .NET 3.5 SP1，Windows 11 需手动启用 |
| SQL Server 安装 | SQL Server 2014 安装向导 | SQL Server 2008 安装向导（步骤类似，界面略有不同） |
| SQL 配置管理器 | SQLServerManager12.msc | SQLServerManager10.msc |
| SSMS 版本 | 2014 自带或独立 SSMS 18/19 | 建议下载 SSMS 18.x（SQL Server 2008 自带的 SSMS 版本较旧） |
| **数据库连接配置** | 默认即可 | **必须添加 `tdsVersion: '7_2'`** |
| IIS 启用方式 | 服务器管理器 → 添加角色 | 控制面板 → 启用或关闭 Windows 功能 |
| TLS 加密 | 项目已配置 encrypt: false | 同上，已兼容（SQL 2008 默认不支持 TLS 1.2） |

---

## 三、SQL 语法兼容性确认

以下是项目中使用的所有 SQL Server 特性及其在 SQL Server 2008 中的支持情况：

| SQL 特性 | 项目使用场景 | SQL Server 2008 | 说明 |
|----------|------------|:---------------:|------|
| `ROW_NUMBER() OVER` | 所有列表分页查询 | ✅ | 2005 起支持 |
| `CASE WHEN ... THEN ... END` | 检验报工汇总、条件聚合 | ✅ | 全版本支持 |
| `IDENTITY(1,1)` | 表主键自增 | ✅ | 全版本支持 |
| `NVARCHAR / NVARCHAR(MAX)` | 所有文本字段 | ✅ | 2005 起支持 MAX |
| `DECIMAL(18,4)` | 数量、金额字段 | ✅ | 全版本支持 |
| `DATETIME` | 日期时间字段 | ✅ | 全版本支持 |
| `GETDATE()` | 默认值 | ✅ | 全版本支持 |
| `CONVERT()` | 日期格式化 | ✅ | 全版本支持 |
| `BIT` | 布尔字段 | ✅ | 全版本支持 |
| `GROUP BY / HAVING` | 汇总报表 | ✅ | 全版本支持 |
| `SUM / MAX / COUNT(DISTINCT)` | 聚合函数 | ✅ | 全版本支持 |
| `IF NOT EXISTS ... BEGIN ... END` | 动态迁移 | ✅ | 全版本支持 |
| `INFORMATION_SCHEMA.COLUMNS` | 检查列是否存在 | ✅ | 全版本支持 |
| `SELECT TOP N` | 限制结果集 | ✅ | 全版本支持 |
| `子查询 / IN (SELECT ...)` | 报工时间范围过滤 | ✅ | 全版本支持 |
| `ALTER TABLE ... ADD` | 动态添加列 | ✅ | 全版本支持 |
| `CREATE TABLE` | 动态建表 | ✅ | 全版本支持 |

> **结论**：项目未使用任何 SQL Server 2012+ 专有语法（如 `OFFSET FETCH`、`STRING_AGG`、`FORMAT`、`TRY_CONVERT` 等），所有 SQL 语句在 SQL Server 2008 上完全兼容。

---

## 四、SQL Server 2008 安装（Windows 11 环境）

### 4.1 兼容性模式运行安装程序

SQL Server 2008 的安装程序可能无法直接在 Windows 11 上运行。需要以兼容模式启动：

1. 右键 SQL Server 2008 安装介质中的 `setup.exe`
2. 点击**属性** → **兼容性**标签
3. 勾选**以兼容模式运行这个程序**，选择 **Windows 7**
4. 勾选**以管理员身份运行此程序**
5. 点击**确定**，然后双击运行

> **重要提示**：如果安装过程中出现 `.NET Framework 3.5` 相关错误，请先安装 .NET 3.5（见 4.2 节）。

### 4.2 安装 .NET Framework 3.5

Windows 11 默认未启用 .NET Framework 3.5，SQL Server 2008 需要此组件：

1. 打开**设置** → **应用** → **可选功能** → **更多 Windows 功能**
2. 或直接运行：按 `Win+R`，输入 `optionalfeatures`
3. 勾选 **.NET Framework 3.5（包括 .NET 2.0 和 3.0）**
4. 点击**确定**，等待安装完成

也可通过命令行安装（需管理员权限）：

```cmd
DISM /Online /Enable-Feature /FeatureName:NetFx3 /All
```

### 4.3 安装 SQL Server 2008

1. 以兼容模式运行 `setup.exe`
2. 选择**全新安装**
3. **功能选择**：至少勾选：
   - 数据库引擎服务
   - 管理工具 - 基本
4. **实例配置**：选择**默认实例** (MSSQLSERVER)
5. **数据库引擎配置**：
   - 身份验证模式选择**混合模式**
   - 设置 **sa** 账户密码
   - 添加当前 Windows 用户为管理员
6. 完成安装

### 4.4 安装 SQL Server 2008 SP4

强烈建议安装最新的 Service Pack 以获得最佳兼容性和安全性：

- **SQL Server 2008 SP4**：KB2979596
- **SQL Server 2008 R2 SP3**：KB2979597

> 安装 SP 后重启 SQL Server 服务。

### 4.5 启用 TCP/IP 协议

1. 打开 **SQL Server 配置管理器**（搜索 `SQLServerManager10.msc`）
2. 展开 **SQL Server 网络配置** → **MSSQLSERVER 的协议**
3. 确认 **TCP/IP** 状态为**已启用**
4. 双击 TCP/IP → **IP 地址**标签 → **IPAll**：
   - TCP 端口：`1433`
   - 清空 TCP 动态端口
5. 重启 SQL Server 服务

### 4.6 创建数据库

打开 SSMS，连接到本地 SQL Server，执行：

```sql
CREATE DATABASE SEALSMES;
GO
```

---

## 五、关键配置：数据库连接

### 5.1 配置 TDS 协议版本（已完成）

文件位置：`server\src\config\database.ts`

```typescript
const sequelize = new Sequelize({
  dialect: 'mssql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'XYMES',
  username: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  logging: false,
  dialectOptions: {
    options: {
      encrypt: false,                // SQL Server 2008 不需要加密
      trustServerCertificate: true,  // 信任服务器证书
      tdsVersion: '7_2',            // ★ 关键：兼容 SQL Server 2008
    }
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});
```

**TDS 版本与 SQL Server 对照表**：

| TDS 版本 | 对应 SQL Server |
|----------|----------------|
| 7_1 | SQL Server 2000 |
| **7_2** | **SQL Server 2005 / 2008** |
| 7_3_A | SQL Server 2008 R2 |
| 7_3_B | SQL Server 2012 |
| 7_4 | SQL Server 2014+ |

> 如果使用的是 SQL Server 2008 R2，可将 `tdsVersion` 设置为 `'7_3_A'`。

### 5.2 配置 .env 文件

```ini
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=1433
DB_NAME=SEALSMES
DB_USER=sa
DB_PASSWORD=你的sa密码
JWT_SECRET=请替换为一个随机的长字符串
JWT_EXPIRES_IN=24h
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
```

---

## 六、Windows 11 启用 IIS

Windows 11 的 IIS 启用方式与 Windows Server 不同：

### 6.1 启用 IIS 功能

1. 按 `Win+R`，输入 `optionalfeatures`，回车
2. 找到 **Internet Information Services**，展开并勾选：
   - **Web 管理工具** → **IIS 管理控制台**
   - **万维网服务** → **应用程序开发功能** → **ISAPI 扩展**、**ISAPI 筛选器**
   - **万维网服务** → **常见 HTTP 功能** → **静态内容**、**默认文档**
   - **万维网服务** → **安全性** → **请求筛选**
3. 点击**确定**，等待安装完成

### 6.2 安装 URL Rewrite 和 ARR

与主手册相同，下载安装：
- **URL Rewrite Module 2.1**
- **Application Request Routing 3.0**

### 6.3 后续配置

网站创建、`web.config` 配置、反向代理等步骤与主手册完全一致，请参照主手册第五部分。

---

## 七、启动验证

### 7.1 启动后端服务

```cmd
cd /d D:\SealsMES\server
node dist/server.js
```

正常输出：
```
数据库连接成功
数据库同步完成
服务器运行在端口 3000
API地址: http://localhost:3000/api
```

> 首次启动可能出现 Sequelize 的版本兼容警告：
> ```
> DeprecationWarning: This database engine version is not supported
> ```
> 这是 Sequelize 对 SQL Server 2008 版本的提示，**不影响任何功能**，可安全忽略。

### 7.2 验证清单

| 检查项 | 验证方式 | 预期结果 |
|--------|----------|----------|
| .NET 3.5 已安装 | `optionalfeatures` 中查看 | 已勾选 |
| SQL Server 2008 服务运行 | `services.msc` 中查看 | MSSQLSERVER 已启动 |
| TCP/IP 已启用 | SQL Server 配置管理器 | TCP 端口 1433 |
| 数据库已创建 | SSMS 连接查看 | SEALSMES 存在 |
| Node.js 已安装 | `node -v` | 显示版本号 |
| 后端连接数据库 | 启动后端查看日志 | "数据库连接成功" |
| 后端 API 可访问 | 浏览器访问 `http://localhost:3000/api` | 返回 JSON |
| 前端页面可访问 | 浏览器访问 `http://localhost` | 显示登录页 |
| 用户可登录 | admin / admin123 | 进入仪表板 |
| 数据查询正常 | 进入各管理页面 | 正常显示数据 |
| 报表图表正常 | 包装质量报表页面 | 图表正常渲染 |
| Excel 导出正常 | 点击导出按钮 | 下载含图表的 Excel |

---

## 八、已知限制与注意事项

### 8.1 SQL Server 2008 生命周期

| 版本 | 主流支持结束 | 扩展支持结束 |
|------|------------|------------|
| SQL Server 2008 | 2014-07-08 | 2019-07-09 |
| SQL Server 2008 R2 | 2014-07-08 | 2019-07-09 |

> SQL Server 2008/R2 已于 2019 年结束扩展支持，不再获得安全更新。建议在条件允许时升级到 SQL Server 2014 或更高版本。当前系统兼容 SQL Server 2008 仅作为过渡方案。

### 8.2 性能注意

- SQL Server 2008 的查询优化器较旧，复杂聚合查询（如检验报工汇总）在大数据量时可能比新版本慢
- 建议为 `xhy_inspect_line` 表的 `work_order_number`、`procedure_name`、`job_booking_time` 列创建索引：

```sql
-- 优化报工汇总查询性能
CREATE INDEX IX_xhy_inspect_line_wo ON xhy_inspect_line (work_order_number);
CREATE INDEX IX_xhy_inspect_line_proc ON xhy_inspect_line (procedure_name, inspect_type, status);
CREATE INDEX IX_xhy_inspect_line_time ON xhy_inspect_line (job_booking_time);
```

### 8.3 Windows 11 特有注意

- Windows 11 家庭版不包含 IIS，需要 **专业版** 或 **企业版**
- 如果不使用 IIS，也可以直接通过 Node.js 后端的 3000 端口访问（需配置前端静态文件托管）
- Windows Defender 防火墙默认可能阻止 Node.js 网络访问，首次启动时注意允许网络访问

---

## 九、升级路径

当条件允许时，可按以下路径升级数据库版本：

```
SQL Server 2008 → SQL Server 2008 R2 → SQL Server 2014 → SQL Server 2016+
```

升级步骤：
1. 备份当前数据库：`BACKUP DATABASE SEALSMES TO DISK = 'backup.bak'`
2. 安装新版本 SQL Server
3. 还原数据库到新实例
4. 修改 `database.ts` 中的 `tdsVersion`（升级到 2014+ 后可移除此配置）
5. 验证系统功能正常

---

## 附录：快速部署检查清单

- [ ] Windows 11 专业版或企业版
- [ ] .NET Framework 3.5 已启用
- [ ] SQL Server 2008 已安装（建议安装 SP4）
- [ ] SQL Server 混合认证模式，sa 账户已启用
- [ ] TCP/IP 已启用，端口 1433
- [ ] 数据库 SEALSMES 已创建
- [ ] Node.js 20.x LTS 已安装
- [ ] `server/.env` 已配置正确的数据库连接信息
- [ ] `database.ts` 中已添加 `tdsVersion: '7_2'`
- [ ] 后端依赖已安装，TypeScript 已编译
- [ ] 后端启动日志显示"数据库连接成功"
- [ ] 前端已构建（`client/dist/` 存在）
- [ ] IIS 已启用（仅专业版/企业版），或使用其他方式托管前端
- [ ] URL Rewrite 和 ARR 已安装配置
- [ ] 防火墙已允许 80 和 3000 端口
- [ ] 浏览器可正常访问系统并登录
