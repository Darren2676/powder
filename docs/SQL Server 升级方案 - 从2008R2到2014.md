# SQL Server 数据库升级方案

## 从 SQL Server 2008 R2 升级到 SQL Server 2014

---

## 一、当前环境信息

| 项目 | 信息 |
|------|------|
| 服务器名称 | RIXIN |
| 当前版本 | Microsoft SQL Server 2008 R2 (RTM) - 10.50.1600.1 (X64) Enterprise Edition |
| 数据库名称 | RubberMES |
| 连接地址 | 127.0.0.1:1433 |
| 认证方式 | SQL Server 认证 (sa) |
| 应用系统 | Seals MES System（Node.js + Sequelize + Vue 3） |

---

## 二、升级方式对比

### 方式一：就地升级（In-Place Upgrade）

直接在现有服务器上运行 SQL Server 2014 安装程序，选择"升级"选项。

**优点：**
- 操作简单，一次完成
- 服务器名、实例名不变，应用程序连接信息无需修改
- 所有数据库、登录名、作业等自动迁移

**缺点：**
- 升级过程中服务不可用（停机时间较长）
- 无法回退，出问题后恢复困难
- 需要确保服务器硬件满足 SQL Server 2014 要求

**适用场景：** 测试环境、对停机时间不敏感的场景

---

### 方式二：并行安装 + 数据迁移（推荐 ✅）

在新服务器或新实例上安装 SQL Server 2014，然后迁移数据。

**优点：**
- 安全可靠，随时可回退到旧版本
- 升级过程中旧系统可继续运行，减少停机时间
- 可先在新环境充分测试，确认无误后再切换

**缺点：**
- 需要额外的服务器资源（或临时资源）
- 切换时需修改应用连接配置

**适用场景：** 生产环境（强烈推荐）

---

## 三、升级路径说明

SQL Server 2008 R2 → SQL Server 2014 是微软官方支持的直接升级路径，无需中间版本过渡。

**兼容性级别变化：**

| 版本 | 兼容性级别 |
|------|-----------|
| SQL Server 2008 R2 | 100 |
| SQL Server 2014 | 120 |

还原后数据库兼容性级别仍为 100，可在验证完成后手动提升至 120：
```sql
ALTER DATABASE RubberMES SET COMPATIBILITY_LEVEL = 120;
```

---

## 四、详细升级步骤（推荐方式二）

### 第1步：环境准备

1. 确认目标服务器操作系统满足 SQL Server 2014 要求：
   - Windows Server 2008 SP2 及以上
   - Windows 7 SP1 及以上
2. 确认目标服务器硬件：
   - 内存：至少 1GB（建议 4GB 以上）
   - 磁盘：至少 6GB 可用空间
   - CPU：1.4 GHz 以上 x64 处理器
3. 下载 SQL Server 2014 安装介质

### 第2步：安装 SQL Server 2014

1. 在目标服务器上运行 SQL Server 2014 安装程序
2. 选择"全新 SQL Server 独立安装"
3. 功能选择：至少勾选"数据库引擎服务"
4. 实例配置：
   - 如在同一台服务器：选择"命名实例"（如 MSSQLSERVER2014）
   - 如在新服务器：可使用默认实例
5. 服务器配置：设置服务账户
6. 数据库引擎配置：
   - 选择"混合模式"认证
   - 设置 sa 密码
   - 添加当前用户为管理员
7. 完成安装

### 第3步：备份源数据库

在 SQL Server 2008 R2 上执行完整备份：

```sql
-- 完整备份
BACKUP DATABASE RubberMES
TO DISK = N'D:\backup\RubberMES_full.bak'
WITH INIT, COMPRESSION, STATS = 10;

-- 验证备份完整性
RESTORE VERIFYONLY FROM DISK = N'D:\backup\RubberMES_full.bak';
```

> 备注：如数据量较大，建议在业务低峰期执行备份。

### 第4步：还原到 SQL Server 2014

将备份文件复制到目标服务器后执行还原：

```sql
-- 还原数据库
RESTORE DATABASE RubberMES
FROM DISK = N'D:\backup\RubberMES_full.bak'
WITH MOVE 'RubberMES' TO N'D:\SQLData\RubberMES.mdf',
     MOVE 'RubberMES_log' TO N'D:\SQLData\RubberMES_log.ldf',
     RECOVERY, STATS = 10;

-- 验证还原成功
SELECT name, state_desc, compatibility_level
FROM sys.databases WHERE name = 'RubberMES';
```

> 注意：MOVE 子句中的逻辑文件名需根据实际备份文件调整，可通过以下命令查看：
> ```sql
> RESTORE FILELISTONLY FROM DISK = N'D:\backup\RubberMES_full.bak';
> ```

### 第5步：还原后检查

```sql
-- 检查数据库状态
SELECT name, state_desc FROM sys.databases WHERE name = 'RubberMES';

-- 检查所有表是否正常
SELECT TABLE_NAME FROM RubberMES.INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;

-- 检查登录名和用户映射
USE RubberMES;
EXEC sp_change_users_login 'Report';

-- 如有孤立用户，修复映射
-- EXEC sp_change_users_login 'Auto_Fix', 'sa';
```

### 第6步：迁移登录名（如需要）

如果在新服务器上还原，需要重新创建登录名：

```sql
-- 在新实例上创建 sa 登录或其他应用登录名
-- sa 通常在安装时已创建，确认密码一致即可

-- 如使用其他登录名：
-- CREATE LOGIN [app_user] WITH PASSWORD = 'your_password';
-- USE RubberMES;
-- CREATE USER [app_user] FOR LOGIN [app_user];
-- ALTER ROLE db_owner ADD MEMBER [app_user];
```

### 第7步：修改应用配置

修改 `Seals MES System/server/.env` 文件：

```env
# 如果服务器地址或端口有变化，修改以下配置
DB_HOST=新服务器IP地址
DB_PORT=新端口号
DB_NAME=RubberMES
DB_USER=sa
DB_PASSWORD=新密码
```

如果在同一台服务器上使用命名实例：
```env
DB_HOST=127.0.0.1\MSSQLSERVER2014
DB_PORT=1433
```

### 第8步：应用代码可选优化

升级完成后，可进行以下可选优化（非必须，不改也完全正常运行）：

**1. 更新 TDS 版本（推荐）**

修改 `server/src/config/database.ts`：
```typescript
dialectOptions: {
  options: {
    encrypt: false,
    trustServerCertificate: true,
    tdsVersion: '7_4',  // 从 '7_2' 升级到 '7_4'
  }
}
```

**2. 提升数据库兼容性级别（可选）**

```sql
ALTER DATABASE RubberMES SET COMPATIBILITY_LEVEL = 120;
```

**3. 分页语法优化（可选，后续逐步优化）**

升级后可将 `ROW_NUMBER()` 分页方式逐步迁移为更简洁的 `OFFSET...FETCH NEXT` 语法：

```sql
-- 旧方式（2008 R2 兼容）
SELECT * FROM (
  SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC) AS _row_num
  FROM production_inbound_order
) t WHERE t._row_num > 0 AND t._row_num <= 10

-- 新方式（2014 支持）
SELECT * FROM production_inbound_order
ORDER BY creation_date DESC
OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY
```

> 注意：此优化非必须，现有代码在 2014 上完全兼容运行。

### 第9步：功能验证

1. 重启后端服务
2. 逐项验证以下核心功能：

| 验证模块 | 验证内容 | 通过 |
|---------|---------|------|
| 用户登录 | 登录/登出正常 | ☐ |
| 销售管理 | 销售订单列表、新建、编辑 | ☐ |
| 生产管理 | 生产计划、生产单列表 | ☐ |
| 成品库管理 | 生产完工入库 | ☐ |
| 成品库管理 | 发货出库 | ☐ |
| 成品库管理 | 库存流水记录 | ☐ |
| 成品库管理 | 生产入库单 | ☐ |
| 成品库管理 | 异常出入库 | ☐ |
| 成品库管理 | 退货入库 | ☐ |
| 物料仓库 | 入库/出库/库存查询 | ☐ |
| 会计期间 | 期间管理列表 | ☐ |
| 质量管理 | 检验规范、检验计划 | ☐ |

### 第10步：切换生产（正式上线）

确认所有功能验证通过后：

1. 通知相关人员系统将短暂停机
2. 在旧数据库上做最终增量备份（如有增量数据）
3. 还原增量到新数据库
4. 将应用配置指向新数据库
5. 重启所有服务
6. 确认系统正常运行
7. 保留旧数据库一段时间（建议至少保留 30 天）作为回退保障

---

## 五、回退方案

如升级后发现严重问题，可按以下步骤回退：

1. 停止应用服务
2. 修改 `.env` 配置指回原 SQL Server 2008 R2 实例
3. 重启应用服务
4. 确认系统恢复正常

> 注意：回退期间在新数据库上产生的数据将丢失，需评估数据同步方案。

---

## 六、升级对应用的影响评估

| 评估项 | 结果 | 说明 |
|--------|------|------|
| SQL 语法兼容性 | ✅ 完全兼容 | 2008 R2 语法在 2014 上全部支持 |
| 数据类型兼容性 | ✅ 完全兼容 | 所有使用的数据类型均向上兼容 |
| Sequelize ORM | ✅ 完全兼容 | Sequelize 对 2014 支持更好 |
| 应用代码改动 | ✅ 无需改动 | 可选优化但非必须 |
| 性能表现 | ✅ 有提升 | 查询优化器改进、内存管理优化 |
| 停机时间 | 约 30-60 分钟 | 取决于数据量大小和网络传输速度 |

---

## 七、时间计划（建议）

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| 准备期 | 安装 SQL Server 2014、环境配置 | 1-2 小时 |
| 测试期 | 备份还原、应用连接测试、功能验证 | 2-4 小时 |
| 切换期 | 最终数据同步、配置切换、上线确认 | 30-60 分钟 |
| 观察期 | 监控运行状况、保留旧环境 | 1-2 周 |

---

**文档编制日期：** 2026年4月16日
**适用系统：** Seals MES System (RubberMES)
