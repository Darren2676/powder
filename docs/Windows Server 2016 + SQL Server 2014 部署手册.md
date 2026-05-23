# Seals MES 系统 — Windows Server 2016 + SQL Server 2014 部署手册

> 最后更新：2026-05-12  
> 适用环境：Windows Server 2016 Standard/Datacenter + SQL Server 2014 SP3  
> 项目：Seals MES 系统（Node.js + Vue 3 前后端分离架构）

---

## 目录

- [一、Windows Server 2016 基础配置](#一windows-server-2016-基础配置)
- [二、SQL Server 2014 安装与配置](#二sql-server-2014-安装与配置)
- [三、MES 系统部署步骤](#三mes-系统部署步骤)
- [四、运维与安全配置](#四运维与安全配置)
- [五、常见问题排查](#五常见问题排查)

---

## 一、Windows Server 2016 基础配置

### 1.1 系统初始化

#### 计算机名与网络

```powershell
# 设置计算机名（需重启生效）
Rename-Computer -NewName "MES-SERVER" -Force -Restart

# 配置静态 IP（示例）
New-NetIPAddress -InterfaceAlias "Ethernet" -IPAddress 192.168.1.100 -PrefixLength 24 -DefaultGateway 192.168.1.1
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses 192.168.1.1,8.8.8.8
```

#### 时区与时间同步

```powershell
# 设置时区为中国标准时间
Set-TimeZone -Id "China Standard Time"

# 配置 NTP 时间同步
w32tm /config /manualpeerlist:"ntp.aliyun.com" /syncfromflags:manual /reliable:yes /update
Restart-Service w32time
w32tm /resync
```

#### 系统更新

1. 打开 **服务器管理器** → **本地服务器** → **Windows 更新**
2. 安装所有关键更新和安全更新
3. 重启服务器

---

### 1.2 安装角色与功能

#### 安装 .NET Framework 3.5（SQL Server 依赖）

```powershell
# 方法1：通过 PowerShell 安装（需挂载系统安装镜像）
Install-WindowsFeature Net-Framework-Core -Source D:\sources\sxs

# 方法2：通过服务器管理器
# 服务器管理器 → 添加角色和功能 → 功能 → .NET Framework 3.5
```

> **注意**：安装 .NET Framework 3.5 可能需要 Windows Server 2016 安装光盘/ISO 的 `sources\sxs` 目录。

#### 安装 IIS 10.0 Web 服务器

```powershell
# 安装 IIS 及必要功能
Install-WindowsFeature Web-Server -IncludeManagementTools
Install-WindowsFeature Web-Default-Doc, Web-Static-Content, Web-Http-Redirect
Install-WindowsFeature Web-Request-Monitor, Web-Http-Logging
Install-WindowsFeature Web-Filtering, Web-IP-Security
Install-WindowsFeature Web-Windows-Auth, Web-ISAPI-Ext, Web-ISAPI-Filter
Install-WindowsFeature Web-Asp-Net45, Web-Net-Ext45
```

验证安装：

```powershell
Get-WindowsFeature Web-Server | Select Name, Installed
# 应返回 Installed = True
```

#### 安装 URL Rewrite 模块 2.1

1. 下载 URL Rewrite Module 2.1：  
   `https://www.iis.net/downloads/microsoft/url-rewrite`
2. 运行安装程序 → 默认选项安装

#### 安装 Application Request Routing (ARR) 3.0

1. 下载 ARR 3.0：  
   `https://www.iis.net/downloads/microsoft/application-request-routing`
2. 运行安装程序 → 默认选项安装
3. 打开 IIS 管理器 → 服务器节点 → **Application Request Routing Cache** → 勾选 **Enable proxy**

---

### 1.3 关闭 IE 增强安全配置（部署期间）

```powershell
# 管理员用户关闭 IE ESC
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Active Setup\Installed Components\{A509B1A7-37EF-4b3f-8CFC-4F3A74704073}" -Name "IsInstalled" -Value 0

# 普通用户关闭 IE ESC
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Active Setup\Installed Components\{A509B1A8-37EF-4b3f-8CFC-4F3A74704073}" -Name "IsInstalled" -Value 0

# 立即生效
Stop-Process -Name Explorer -Force
```

> 部署完成后建议重新启用。

---

### 1.4 创建项目目录

```powershell
# 创建标准部署目录
New-Item -ItemType Directory -Path "D:\SealsMES" -Force
New-Item -ItemType Directory -Path "D:\SealsMES\server" -Force
New-Item -ItemType Directory -Path "D:\SealsMES\client" -Force
New-Item -ItemType Directory -Path "D:\SealsMES\backup" -Force
New-Item -ItemType Directory -Path "D:\SealsMES\logs" -Force
```

---

## 二、SQL Server 2014 安装与配置

### 2.1 先决条件

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows Server 2016 Standard/Datacenter |
| .NET Framework | 3.5 SP1 + 4.0（系统已自带 4.6） |
| 内存 | 最低 1 GB，建议 4 GB 以上 |
| 磁盘空间 | 系统盘 6 GB + 数据盘建议 50 GB 以上 |
| 处理器 | x64 兼容，1.4 GHz 以上 |
| 安装版本 | SQL Server 2014 SP3（推荐） |

#### 下载地址

- SQL Server 2014 SP3：Microsoft 官方评估中心下载
- SQL Server Management Studio (SSMS)：建议安装 SSMS 18.x 或 19.x

---

### 2.2 安装步骤

#### 步骤 1：启动安装程序

1. 挂载 SQL Server 2014 SP3 ISO 文件
2. 运行 `setup.exe`
3. 选择左侧 **安装** → **全新 SQL Server 独立安装或向现有安装添加功能**

#### 步骤 2：功能选择

勾选以下功能：

| 功能 | 说明 |
|------|------|
| **数据库引擎服务** | 核心数据库（必选） |
| **SQL Server 复制** | 数据复制支持 |
| **全文和语义提取搜索** | 全文检索（可选） |
| **管理工具 - 基本** | SSMS 基本工具 |
| **管理工具 - 完整** | 包含 SQL Server Agent、Profiler 等 |

#### 步骤 3：实例配置

| 配置项 | 设置 |
|--------|------|
| 实例类型 | **默认实例**（MSSQLSERVER） |
| 实例 ID | MSSQLSERVER |
| 实例根目录 | `D:\Microsoft SQL Server\`（建议非系统盘） |

#### 步骤 4：服务器配置

| 服务 | 账户 | 启动类型 |
|------|------|---------|
| SQL Server 数据库引擎 | NT Service\MSSQLSERVER | 自动 |
| SQL Server Agent | NT Service\SQLSERVERAGENT | 自动 |
| SQL Server Browser | NT AUTHORITY\LOCAL SERVICE | 自动 |

#### 步骤 5：数据库引擎配置

| 配置项 | 设置 |
|--------|------|
| **身份验证模式** | **混合模式**（SQL Server 和 Windows 身份验证） |
| sa 密码 | 设置强密码（大小写 + 数字 + 特殊字符，≥12位） |
| SQL Server 管理员 | 添加当前 Windows 管理员账户 |
| 数据目录 | `D:\MSSQL\Data\`（建议） |
| 日志目录 | `D:\MSSQL\Log\`（建议） |
| 备份目录 | `D:\MSSQL\Backup\`（建议） |
| TempDB 目录 | `D:\MSSQL\TempDB\`（建议） |

> **重要**：必须选择 **混合模式**，MES 系统使用 SQL Server 身份验证连接。

#### 步骤 6：完成安装

等待安装完成，确认所有组件显示"成功"。

---

### 2.3 安装后配置

#### 2.3.1 启用 TCP/IP 协议

1. 打开 **SQL Server 配置管理器**
2. 展开 **SQL Server 网络配置** → **MSSQLSERVER 的协议**
3. 右键 **TCP/IP** → **启用**
4. 双击 **TCP/IP** → **IP 地址** 选项卡：
   - 滚动到最底部 **IPAll** 部分
   - **TCP 端口**：填入 `1433`
   - **TCP 动态端口**：**清空**（删除 0）

```
IPAll 配置：
  TCP 动态端口：（留空）
  TCP 端口：1433
```

5. 重启 SQL Server 服务：

```powershell
Restart-Service MSSQLSERVER
```

#### 2.3.2 确认 sa 账户已启用

```sql
-- 在 SSMS 中执行
ALTER LOGIN sa ENABLE;
ALTER LOGIN sa WITH PASSWORD = '你的强密码';
GO
```

#### 2.3.3 配置 SQL Server Agent 自动启动

```powershell
Set-Service -Name "SQLSERVERAGENT" -StartupType Automatic
Start-Service SQLSERVERAGENT
```

#### 2.3.4 创建 MES 数据库

打开 SSMS，连接到 SQL Server，执行：

```sql
-- 创建数据库
CREATE DATABASE SEALSMES
ON PRIMARY (
    NAME = N'SEALSMES',
    FILENAME = N'D:\MSSQL\Data\SEALSMES.mdf',
    SIZE = 100MB,
    MAXSIZE = UNLIMITED,
    FILEGROWTH = 64MB
)
LOG ON (
    NAME = N'SEALSMES_log',
    FILENAME = N'D:\MSSQL\Log\SEALSMES_log.ldf',
    SIZE = 50MB,
    MAXSIZE = UNLIMITED,
    FILEGROWTH = 32MB
);
GO

-- 设置恢复模式为简单（生产环境建议完整模式）
ALTER DATABASE SEALSMES SET RECOVERY SIMPLE;
GO

-- 验证
SELECT name, state_desc, recovery_model_desc FROM sys.databases WHERE name = 'SEALSMES';
GO
```

#### 2.3.5 验证连接

```powershell
# 使用 sqlcmd 验证（如果已安装）
sqlcmd -S 127.0.0.1,1433 -U sa -P "你的密码" -Q "SELECT @@VERSION"
```

预期输出应包含：`Microsoft SQL Server 2014`

---

## 三、MES 系统部署步骤

### 3.1 安装 Node.js 20.x LTS

1. 下载 Node.js 20.x LTS Windows Installer (64-bit .msi)：  
   `https://nodejs.org/en/download/`
2. 运行安装程序：
   - 安装路径：`C:\Program Files\nodejs\`（默认）
   - 勾选 **Add to PATH**
   - 勾选 **Automatically install necessary tools**
3. 验证安装：

```powershell
node -v    # 应显示 v20.x.x
npm -v     # 应显示 10.x.x
```

### 3.2 安装全局工具

```powershell
# 安装 PM2 进程管理器
npm install -g pm2

# 安装 TypeScript（构建需要）
npm install -g typescript

# 验证
pm2 --version
tsc --version
```

---

### 3.3 后端部署

#### 3.3.1 复制项目文件

将项目 `server/` 目录复制到 `D:\SealsMES\server\`：

```powershell
# 从开发机复制（或从 Git 拉取）
# 方式1：Git 克隆
cd D:\SealsMES
git clone https://github.com/Darren2676/rubber.git .

# 方式2：手动复制 server 目录（不包含 node_modules）
```

#### 3.3.2 安装依赖

```powershell
cd D:\SealsMES\server
npm install --production
```

#### 3.3.3 构建 TypeScript

```powershell
cd D:\SealsMES\server
npm run build
```

构建成功后会生成 `dist/` 目录。

#### 3.3.4 配置环境变量

创建 `D:\SealsMES\server\.env` 文件：

```ini
# 服务端口
PORT=3000

# 数据库连接
DB_HOST=127.0.0.1
DB_PORT=1433
DB_NAME=SEALSMES
DB_USER=sa
DB_PASSWORD=你的强密码

# JWT 安全配置（生产环境必须修改！）
JWT_SECRET=生成一个32位以上随机字符串
JWT_EXPIRES_IN=24h

# 文件上传
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760

# 运行环境
NODE_ENV=production
```

> **安全提醒**：`JWT_SECRET` 必须使用高强度随机字符串，切勿使用默认值。

#### 3.3.5 创建上传目录

```powershell
New-Item -ItemType Directory -Path "D:\SealsMES\server\uploads" -Force
```

#### 3.3.6 初次启动测试

```powershell
cd D:\SealsMES\server
node dist/server.js
```

预期输出：
```
数据库连接成功
数据库同步完成
服务器运行在端口 3000
API地址: http://localhost:3000/api
```

按 `Ctrl+C` 停止后，配置 PM2 进程管理。

#### 3.3.7 配置 PM2 进程管理

确保 `D:\SealsMES\ecosystem.config.js` 内容如下：

```javascript
module.exports = {
  apps: [{
    name: 'seals-mes-server',
    script: 'dist/server.js',
    cwd: './server',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

启动服务：

```powershell
cd D:\SealsMES
pm2 start ecosystem.config.js --env production

# 保存进程列表
pm2 save

# 设置开机自启（Windows 下需配合 pm2-startup 或使用 NSSM）
```

#### 3.3.8 NSSM 注册 Windows 服务（推荐生产环境）

PM2 在 Windows 下开机自启不够可靠，推荐使用 NSSM：

1. 下载 NSSM：`https://nssm.cc/download`
2. 解压到 `D:\Tools\nssm\`
3. 注册服务：

```powershell
D:\Tools\nssm\win64\nssm.exe install SealsMES-API "C:\Program Files\nodejs\node.exe"
D:\Tools\nssm\win64\nssm.exe set SealsMES-API AppParameters "D:\SealsMES\server\dist\server.js"
D:\Tools\nssm\win64\nssm.exe set SealsMES-API AppDirectory "D:\SealsMES\server"
D:\Tools\nssm\win64\nssm.exe set SealsMES-API AppEnvironmentExtra "NODE_ENV=production"
D:\Tools\nssm\win64\nssm.exe set SealsMES-API DisplayName "Seals MES API Server"
D:\Tools\nssm\win64\nssm.exe set SealsMES-API Description "Seals MES System Backend API (Port 3000)"
D:\Tools\nssm\win64\nssm.exe set SealsMES-API Start SERVICE_AUTO_START
D:\Tools\nssm\win64\nssm.exe set SealsMES-API AppStdout "D:\SealsMES\logs\api-stdout.log"
D:\Tools\nssm\win64\nssm.exe set SealsMES-API AppStderr "D:\SealsMES\logs\api-stderr.log"
D:\Tools\nssm\win64\nssm.exe set SealsMES-API AppRotateFiles 1
D:\Tools\nssm\win64\nssm.exe set SealsMES-API AppRotateBytes 10485760

# 启动服务
D:\Tools\nssm\win64\nssm.exe start SealsMES-API
```

验证服务状态：

```powershell
Get-Service SealsMES-API | Select Name, Status, StartType
```

---

### 3.4 前端部署

#### 3.4.1 构建前端（在开发机执行）

```powershell
cd "d:\rubber\Seals MES System\client"
npm run build
```

构建完成后，`client/dist/` 目录即为待部署的前端文件。

#### 3.4.2 复制到服务器

将 `client/dist/` 目录复制到服务器 `D:\SealsMES\client\dist\`。

#### 3.4.3 创建 IIS 网站

1. 打开 **IIS 管理器**
2. 右键 **网站** → **添加网站**：

| 配置项 | 值 |
|--------|-----|
| 网站名称 | SealsMES |
| 物理路径 | `D:\SealsMES\client\dist` |
| 绑定类型 | http |
| IP 地址 | 全部未分配 |
| 端口 | 80 |
| 主机名 | （留空） |

3. 停止 **Default Web Site**（避免端口冲突）

#### 3.4.4 配置 web.config

在 `D:\SealsMES\client\dist\` 目录下创建 `web.config`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <!-- URL 重写规则 -->
    <rewrite>
      <rules>
        <!-- API 反向代理到 Node.js 后端 -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3000/api/{R:1}" />
        </rule>

        <!-- 文件上传目录代理 -->
        <rule name="Uploads Proxy" stopProcessing="true">
          <match url="^uploads/(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3000/uploads/{R:1}" />
        </rule>

        <!-- Vue Router HTML5 History 模式 -->
        <rule name="SPA Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>

    <!-- 静态文件 MIME 类型 -->
    <staticContent>
      <remove fileExtension=".json" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <remove fileExtension=".woff" />
      <mimeMap fileExtension=".woff" mimeType="font/woff" />
      <remove fileExtension=".woff2" />
      <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
    </staticContent>

    <!-- 默认文档 -->
    <defaultDocument>
      <files>
        <clear />
        <add value="index.html" />
      </files>
    </defaultDocument>
  </system.webServer>
</configuration>
```

#### 3.4.5 设置目录权限

```powershell
# 给 IIS 应用程序池用户读取权限
icacls "D:\SealsMES\client\dist" /grant "IIS_IUSRS:(OI)(CI)(RX)" /T
```

---

### 3.5 部署验证清单

| 检查项 | 验证方法 | 预期结果 |
|--------|---------|---------|
| 后端 API 可访问 | 浏览器打开 `http://localhost:3000/api` | 返回 JSON 数据 |
| 前端页面加载 | 浏览器打开 `http://localhost` | 显示登录页面 |
| API 代理正常 | 前端登录操作 | 登录成功跳转 |
| 数据库连接 | 登录后查看列表数据 | 正常显示数据 |
| 文件上传 | 上传附件/图片 | 上传成功并可预览 |
| 远程访问 | 局域网其他电脑访问 `http://192.168.1.100` | 页面正常加载 |

默认管理员账号：`admin` / `admin123`

> **首次登录后请立即修改管理员密码！**

---

## 四、运维与安全配置

### 4.1 防火墙规则

```powershell
# 开放 HTTP 端口 (IIS 前端)
New-NetFirewallRule -DisplayName "Seals MES - HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# 开放 HTTPS 端口 (如配置 SSL)
New-NetFirewallRule -DisplayName "Seals MES - HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# 开放 SQL Server 端口（仅在数据库需要外部访问时开放）
New-NetFirewallRule -DisplayName "SQL Server" -Direction Inbound -Protocol TCP -LocalPort 1433 -Action Allow

# 后端 API 端口（通常不需要直接对外，由 IIS 代理）
# 如需直接访问后端：
# New-NetFirewallRule -DisplayName "Seals MES - API" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

> **安全建议**：SQL Server 端口 1433 仅在数据库需要被外部服务器访问时才开放。单机部署无需开放。

---

### 4.2 数据库定时备份

#### 方式 1：SQL Server 维护计划（推荐）

1. 打开 SSMS → 连接到服务器
2. 展开 **管理** → 右键 **维护计划** → **维护计划向导**
3. 选择 **完整数据库备份**：
   - 数据库：SEALSMES
   - 备份到磁盘：`D:\SealsMES\backup\`
   - 计划：每天凌晨 2:00
4. 选择 **清除维护任务**：
   - 删除 7 天前的备份文件

#### 方式 2：SQL 脚本 + 计划任务

创建 `D:\SealsMES\scripts\backup.sql`：

```sql
DECLARE @BackupFile NVARCHAR(500)
SET @BackupFile = N'D:\SealsMES\backup\SEALSMES_' 
    + REPLACE(REPLACE(REPLACE(CONVERT(NVARCHAR(19), GETDATE(), 120), '-', ''), ' ', '_'), ':', '')
    + N'.bak'

BACKUP DATABASE [SEALSMES] TO DISK = @BackupFile
WITH COMPRESSION, INIT, STATS = 10;
GO
```

创建 `D:\SealsMES\scripts\backup.bat`：

```bat
@echo off
sqlcmd -S 127.0.0.1 -U sa -P "你的密码" -i "D:\SealsMES\scripts\backup.sql"

:: 删除 7 天前的备份
forfiles /p "D:\SealsMES\backup" /s /m *.bak /d -7 /c "cmd /c del @path"
```

通过 Windows 任务计划程序设置每日执行。

---

### 4.3 PM2 / NSSM 监控与日志管理

#### PM2 监控

```powershell
# 查看进程状态
pm2 list

# 实时日志
pm2 logs seals-mes-server

# 监控面板
pm2 monit

# 查看详细信息
pm2 describe seals-mes-server
```

#### NSSM 服务管理

```powershell
# 查看服务状态
Get-Service SealsMES-API

# 重启服务
Restart-Service SealsMES-API

# 停止服务
Stop-Service SealsMES-API

# 查看日志
Get-Content "D:\SealsMES\logs\api-stdout.log" -Tail 50
Get-Content "D:\SealsMES\logs\api-stderr.log" -Tail 50
```

#### 日志轮转

NSSM 已配置日志轮转（每 10MB 一个文件）。建议定期清理旧日志：

```powershell
# 删除 30 天前的日志
forfiles /p "D:\SealsMES\logs" /m *.log /d -30 /c "cmd /c del @path"
```

---

### 4.4 SSL/HTTPS 配置（可选）

#### 方式 1：使用自签名证书（内网环境）

```powershell
# 创建自签名证书
New-SelfSignedCertificate -DnsName "mes.company.local", "192.168.1.100" `
  -CertStoreLocation "cert:\LocalMachine\My" `
  -NotAfter (Get-Date).AddYears(5)
```

在 IIS 中绑定 HTTPS：

1. IIS 管理器 → SealsMES 网站 → **绑定**
2. **添加** → 类型：https → 端口：443 → SSL 证书：选择刚创建的证书

#### 方式 2：使用 CA 签发证书（公网环境）

1. 从 CA 获取证书文件（.pfx 格式）
2. 双击 .pfx 文件导入到 **本地计算机\个人** 证书存储
3. 在 IIS 中绑定该证书

#### 配置 HTTP 到 HTTPS 重定向

在 `web.config` 的 `<rules>` 节点最前面添加：

```xml
<rule name="HTTP to HTTPS" stopProcessing="true">
  <match url="(.*)" />
  <conditions>
    <add input="{HTTPS}" pattern="off" />
  </conditions>
  <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
</rule>
```

---

### 4.5 系统版本更新流程

```powershell
# 1. 停止后端服务
Stop-Service SealsMES-API  # 或 pm2 stop seals-mes-server

# 2. 备份当前版本
Copy-Item -Recurse "D:\SealsMES\server\dist" "D:\SealsMES\backup\dist_$(Get-Date -Format 'yyyyMMdd')"

# 3. 拉取最新代码
cd D:\SealsMES
git pull origin main

# 4. 安装依赖并构建
cd D:\SealsMES\server
npm install --production
npm run build

# 5. 更新前端
cd D:\SealsMES\client
npm install
npm run build

# 6. 重启后端服务
Start-Service SealsMES-API  # 或 pm2 restart seals-mes-server

# 7. 验证
curl http://localhost:3000/api
```

---

## 五、常见问题排查

### 5.1 数据库连接失败

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| `Connection refused` | TCP/IP 未启用 | SQL Server 配置管理器 → 启用 TCP/IP |
| `Login failed for user 'sa'` | sa 未启用或密码错误 | SSMS 中启用 sa 并重置密码 |
| `Port 1433 unreachable` | 防火墙阻止 | 添加入站规则开放 1433 |
| `Connection timeout` | SQL Server 服务未运行 | `Get-Service MSSQLSERVER` 检查并启动 |
| `TDS version mismatch` | 驱动版本不兼容 | SQL Server 2014 无需设置 tdsVersion |

### 5.2 前端页面空白

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| 空白页面 | dist 目录无 index.html | 确认前端构建成功并复制到正确路径 |
| 404 错误 | URL Rewrite 未安装 | 安装 URL Rewrite Module 2.1 |
| API 请求 502 | 后端未启动 | 检查 SealsMES-API 服务状态 |
| 静态资源 404 | MIME 类型未配置 | 检查 web.config 中的 staticContent |

### 5.3 后端启动失败

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| `Port 3000 in use` | 端口被占用 | `netstat -ano | findstr :3000` 查找并关闭占用进程 |
| `MODULE_NOT_FOUND` | 依赖未安装 | 重新执行 `npm install --production` |
| `.env not found` | 环境变量文件缺失 | 复制 `.env.example` 为 `.env` 并填写配置 |
| `ECONNREFUSED 127.0.0.1:1433` | 数据库不可达 | 检查 SQL Server 服务和 TCP/IP 配置 |

### 5.4 文件上传失败

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| 413 Request Too Large | IIS 请求大小限制 | web.config 添加 `<requestLimits maxAllowedContentLength="104857600" />` |
| 权限拒绝 | uploads 目录无写权限 | `icacls uploads /grant "IIS_IUSRS:(OI)(CI)(M)"` |
| 上传后无法访问 | 代理规则缺失 | 确认 web.config 中有 uploads 代理规则 |

---

## 附录

### A. 部署检查清单

```
□ Windows Server 2016 已安装最新补丁
□ .NET Framework 3.5 已启用
□ SQL Server 2014 SP3 已安装
□ SQL Server TCP/IP 已启用，端口 1433
□ SQL Server 混合模式身份验证
□ SEALSMES 数据库已创建
□ Node.js 20.x 已安装
□ PM2 / NSSM 已配置
□ IIS 10.0 已安装
□ URL Rewrite 2.1 已安装
□ ARR 3.0 已安装并启用代理
□ 后端 .env 已配置
□ 后端服务正常运行 (port 3000)
□ 前端 dist 已部署到 IIS
□ web.config 已配置
□ 防火墙规则已添加
□ 定时备份已设置
□ 管理员密码已修改
□ 远程访问测试通过
```

### B. 端口使用汇总

| 端口 | 服务 | 对外访问 |
|------|------|---------|
| 80 | IIS（前端 + API 代理） | 是 |
| 443 | IIS HTTPS（可选） | 是 |
| 1433 | SQL Server 数据库 | 仅内部 |
| 3000 | Node.js 后端 API | 仅内部（由 IIS 代理） |

### C. 服务管理命令速查

```powershell
# SQL Server
Get-Service MSSQLSERVER, SQLSERVERAGENT | Select Name, Status
Restart-Service MSSQLSERVER

# MES 后端 (NSSM)
Get-Service SealsMES-API | Select Name, Status
Restart-Service SealsMES-API

# MES 后端 (PM2)
pm2 list
pm2 restart seals-mes-server

# IIS
iisreset
Get-Website | Select Name, State
Start-Website -Name "SealsMES"
```
