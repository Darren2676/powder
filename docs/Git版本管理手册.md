# Seals MES 系统 — Git 版本管理手册

> 最后更新：2026-04-29  
> 仓库路径：`d:\rubber\Seals MES System`  
> 远程仓库：https://github.com/Darren2676/rubber.git

---

## 一、什么是 Git

### 1.1 定义

Git 是一个**分布式版本控制系统**，由 Linus Torvalds 于 2005 年创建。它记录代码的每一次修改历史，让多人协作开发时不会互相覆盖，且可随时回退到任意历史版本。

### 1.2 为什么需要版本控制

| 场景 | 没有版本控制 | 有版本控制 |
|------|-------------|-----------|
| 改坏了代码 | 无法回退，只能手动恢复 | `git revert` 一键回退 |
| 多人改同一文件 | 互相覆盖，代码丢失 | 自动合并或提示冲突 |
| 想知道谁改了什么 | 只能口头问 | `git log` + `git blame` 精确追溯 |
| 服务器硬盘坏了 | 代码全部丢失 | 从远程仓库重新克隆 |
| 同时开发多个功能 | 复制文件夹管理 | 分支隔离，互不影响 |

### 1.3 核心概念

```
工作区 (Working Directory)     暂存区 (Staging Area)      本地仓库 (Local Repo)      远程仓库 (Remote)
                                                                                    
  修改代码 ──git add──→ 暂存修改 ──git commit──→ 保存快照 ──git push──→ 团队共享
                          ↑                        │                        
                          └── git restore --staged─┘                        
                                                                                    
  代码 ←──git pull── 远程仓库 ←─────────────────────────────────────────────
```

| 概念 | 说明 | 类比 |
|------|------|------|
| **仓库 (Repository)** | 存放项目代码及其完整历史的目录 | 一本书的所有手稿 |
| **提交 (Commit)** | 一个快照，记录"谁、何时、改了什么" | 一本书的某一版次 |
| **分支 (Branch)** | 独立的开发线，互不影响 | 同一本书的不同章节并行写作 |
| **合并 (Merge)** | 将分支的修改合到一起 | 把各章节合成完整书稿 |
| **标签 (Tag)** | 给某个提交起名字（如 v1.0.0） | 书的正式出版版次 |
| **远程 (Remote)** | 托管在服务器上的仓库 | 出版社的档案室 |

### 1.4 常用命令速查

| 命令 | 作用 | 使用频率 |
|------|------|---------|
| `git status` | 查看当前修改状态 | 每天多次 |
| `git add .` | 暂存所有修改 | 每次提交前 |
| `git commit -m "说明"` | 提交快照 | 每完成一个功能 |
| `git push` | 推送到远程 | 每次提交后 |
| `git pull` | 拉取远程最新 | 每天开始工作前 |
| `git log --oneline` | 查看提交历史 | 需要回顾时 |
| `git diff` | 查看具体修改内容 | 提交前检查 |
| `git branch feature-x` | 创建分支 | 开始新功能时 |
| `git checkout feature-x` | 切换分支 | 切换工作内容 |
| `git merge feature-x` | 合并分支 | 功能完成时 |
| `git stash` | 临时保存当前修改 | 紧急切分支时 |
| `git revert <hash>` | 撤销某次提交 | 发现问题时 |

### 1.5 Git Flow 分支策略

对于 MES 系统项目，推荐使用 **Git Flow** 工作流：

```
main (生产环境 - 稳定版本)
  │
  └── develop (开发环境 - 集成最新功能)
       │
       ├── feature/xxx (功能开发分支)
       ├── bugfix/xxx (Bug 修复分支)
       ├── release/x.x (发布准备分支)
       └── hotfix/xxx (紧急修复分支，从 main 直接拉出)
```

#### 分支说明

| 分支 | 用途 | 生命周期 | 保护级别 |
|------|------|---------|---------|
| **main** | 生产环境代码，只接受稳定版本 | 永久 | 🔴 严格保护 |
| **develop** | 开发环境代码，集成所有功能 | 永久 | 🟡 适度保护 |
| **feature/*** | 开发新功能 | 临时，功能完成后合并到 develop | 🟢 自由 |
| **bugfix/*** | 修复非紧急 Bug | 临时，修复后合并到 develop | 🟢 自由 |
| **release/*** | 发布准备，进行测试和文档 | 临时，发布后合并到 main 和 develop | 🟡 适度保护 |
| **hotfix/*** | 紧急修复生产问题 | 临时，修复后合并到 main 和 develop | 🟡 适度保护 |

#### 分支命名规范

```
feature/user-authentication      # 用户认证功能
feature/menu-optimization        # 菜单优化功能
bugfix/login-error               # 登录错误修复
bugfix/report-export             # 报表导出修复
release/1.2.0                    # 1.2.0 版本发布准备
hotfix/critical-security         # 紧急安全修复
```

### 1.6 版本标签管理

#### 语义化版本控制 (SemVer)

版本格式：`MAJOR.MINOR.PATCH`（主版本号.次版本号.修订号）

- **MAJOR**：不兼容的 API 变更
- **MINOR**：向后兼容的功能新增
- **PATCH**：向后兼容的问题修正

#### 标签命名规范

```
v1.0.0    # 初始版本
v1.1.0    # 新增功能
v1.1.1    # Bug 修复
v2.0.0    # 重大更新
```

#### 标签操作

```bash
# 创建标签
git tag -a v1.0.0 -m "发布版本 1.0.0 - MES系统初始版本"

# 查看标签
git tag -l
git tag -l -n1  # 显示标签说明

# 推送标签到远程
git push origin v1.0.0
git push origin --tags  # 推送所有标签

# 切换到某个标签
git checkout v1.0.0

# 删除标签
git tag -d v1.0.0  # 本地
git push origin --delete v1.0.0  # 远程
```

### 1.7 推荐的提交规范

```
<类型>(<范围>): <简要描述>

类型：
  feat     - 新功能
  fix      - 修复Bug
  refactor - 重构（不改变功能）
  docs     - 文档
  test     - 测试
  chore    - 构建/工具
  perf     - 性能优化

示例：
  feat(warehouse): 成品仓入库支持批次FIFO
  fix(workReport): 修复报工数量为0时的状态异常
  refactor(service): 拆分warehouse.service巨型文件
  docs(api): 更新API版本化迁移指南
```

---

## 二、当前仓库版本状态评估

### 2.1 仓库基本信息

| 项目 | 值 | 说明 |
|------|-----|------|
| 仓库路径 | `d:\rubber\Seals MES System` | 本地仓库 |
| 当前分支 | `main` | 唯一分支 |
| 远程仓库 | **未配置** | ⚠️ 无任何远程备份 |
| 标签 | `v1.0.0` | 初始版本标签 |
| 总提交数 | 20 个 | 均在 2026-03-17 ~ 2026-04-23 期间 |
| 最近提交 | `1b5c51a` 2026-04-23 | 销售管理冒烟测试 |
| `.gitignore` | 已配置 | 排除 node_modules/dist/.env/uploads 等 |

### 2.2 提交历史时间线

```
v1.0.0 ───────────────────────────────────────────────────────────────→ main
  │                                                                     HEAD
  │  2026-03-17  初始版本 v1.0.0                                        │
  │                                                                     │
  │  2026-04-23  生产检验模块 + 模块化重构 + 移动端                      │
  │  2026-04-23  来料检验 + 不合格品处理                                 │
  │  2026-04-23  单元测试 (生产检验/来料检验)                            │
  │  2026-04-23  MRP运算/销售预测/发货计算 流程图文档                    │
  │  2026-04-23  销售全流程方案 (P0/P1/P2/P3 逐步交付)                  │
  │  2026-04-23  销售管理冒烟测试                                        │
  │                                                                     │
  │  ⚠️ 2026-04-23 以后的所有改动均未提交                                │
  └─────────────────────────────────────────────────────────────────────┘
```

### 2.3 未提交变更统计

| 类别 | 数量 | 详情 |
|------|------|------|
| **已修改文件** | 71 个 | +9,947 行 / -7,688 行 |
| **新增文件（未跟踪）** | ~95 个 | 包含大量新代码和文档 |
| 合计变更行数 | **17,635 行** | 极大量未保存的代码 |

### 2.4 未提交的关键改动（按改进计划分类）

#### 中期改进计划成果（已落地但未提交）

| 改进项 | 涉及文件 | 状态 |
|--------|---------|------|
| 拆分巨型 Service | `workReport.service.ts`, `warehouse.service.ts`, `orderDispatch.service.ts` + 新增子目录 | ✅ 已完成 |
| 引入 umzug 迁移框架 | `config/umzug.ts`, `config/logger.ts` | ✅ 已完成 |
| 核心API单元测试 | `tests/unit/` 下测试文件 | ✅ 已完成 |
| APP端 SSE/WebSocket | `modules/system/sse/`, `services/sse.service.ts` | ✅ 已完成 |
| 结构化日志 (Pino) | `error.middleware.ts`, `permission.middleware.ts`, `eventWorker.service.ts` 等 14 个文件 | ✅ 已完成 |

#### 长期改进计划成果（已落地但未提交）

| 改进项 | 涉及文件 | 状态 |
|--------|---------|------|
| API 版本化 /api/v1 | `app.ts`, `request.ts` × 2, `vite.config.ts` × 2 | ✅ 已完成 |
| APP 离线能力 | `offlineDB.ts`, `offlineSync.ts`, `useNetworkStatus.ts`, `OfflineStatus.vue`, `request.ts`, `App.vue` | ✅ 已完成 |

#### 其他未提交的功能改动

| 功能 | 涉及文件 |
|------|---------|
| 模具BOM映射 | `mfgBom.controller.ts`, `mfgBom.routes.ts`, `MouldMapping.vue`, `MouldMRPComparisonModal.vue` |
| 发货预警 | `ShippingWarning/`, `salesReport.controller.ts` |
| 发货按订单汇总 | `ShippingByOrderSummary/` |
| 甘特图优化 | `Gantt/Index.vue` (710行变更) |
| 工艺路线重构 | `RoutingMaster/List.vue` (519行变更) |
| 生产调度单打印 | `DispatchPrint/Index.vue` |
| 文档与流程图 | `docs/` 下约 30 个新文件 |

### 2.5 风险评估

| 风险等级 | 问题 | 影响 | 建议 |
|---------|------|------|------|
| 🔴 **严重** | 大量变更未提交 | 17,635 行代码无版本记录，误操作或硬盘故障将永久丢失 | **立即提交** |
| 🔴 **严重** | 无远程仓库 | 本地是唯一副本，硬盘损坏=代码全丢 | **立即配置远程仓库** |
| 🟡 **高** | 单分支开发 | 无法回滚到特定功能节点，无法并行开发 | 使用功能分支 |
| 🟡 **高** | 一次性提交量过大 | 71+95 个文件一次性提交，难以按功能回滚 | 分批提交 |
| 🟠 **中** | `server/uploads/` 含用户文件 | 图片/PDF 可能被误提交到仓库 | 已在 `.gitignore` 排除，确认生效 |
| 🟢 **低** | `nul`/`NUL` 文件 | Windows 特殊文件名误创建 | 已在 `.gitignore` 排除 |

---

## 三、改进建议与操作指南

### 3.1 立即执行：分批提交

建议按功能模块分批提交，保留清晰的历史记录：

```bash
cd "d:\rubber\Seals MES System"

# 第1批：服务端基础设施（结构化日志 + API版本化 + 迁移框架）
git add server/src/config/logger.ts server/src/config/umzug.ts
git add server/src/middleware/requestLogger.middleware.ts
git add server/src/middleware/error.middleware.ts server/src/middleware/permission.middleware.ts
git add server/src/app.ts server/src/routes/index.ts
git add server/src/services/eventWorker.service.ts server/src/services/approval.service.ts
git add server/src/services/workflow.engine.ts server/src/services/mouldMRP.service.ts
git add server/src/services/xinheyun.service.ts server/src/services/salesOrderSync.service.ts
git add server/src/services/linesideMovement.service.ts
git add server/src/services/subscribers/ server/src/services/orderDispatch/ server/src/services/warehouse/ server/src/services/workReport/
git add server/src/shared/ server/src/services/eventStore.service.ts
git add server/package.json server/package-lock.json server/tsconfig.json server/vitest.config.ts
git commit -m "refactor(server): 结构化日志(Pino)+API版本化(/api/v1)+umzug迁移框架+Service拆分"

# 第2批：服务端功能扩展
git add server/src/modules/ server/src/models/ server/src/validators/
git add server/src/services/sse.service.ts server/src/modules/quality/productionInspection/subscriber.ts
git add server/src/sql/migrations/
git add server/tests/
git commit -m "feat(server): 模具BOM映射+发货预警+发货汇总报表+事件驱动+迁移脚本+单元测试"

# 第3批：WEB前端
git add client/src/ client/vite.config.ts client/package.json client/package-lock.json
git commit -m "feat(client): API版本化+模具BOM映射+发货预警+路由/侧边栏/甘特图优化"

# 第4批：APP移动端（含离线能力）
git add client-mobile/
git commit -m "feat(mobile): API版本化+PWA离线能力+备料出库+报工优化"

# 第5批：文档
git add docs/
git commit -m "docs: 业务流程图+架构评估+方案文档"
```

### 3.2 配置远程仓库

推荐使用 Gitee（国内速度快）或 GitHub：

```bash
# Gitee 示例
git remote add origin https://gitee.com/<你的用户名>/seals-mes.git
git push -u origin main

# GitHub 示例
git remote add origin https://github.com/<你的用户名>/seals-mes.git
git push -u origin main
```

### 3.3 日常开发工作流

#### 完整 Git Flow 工作流程

```
【功能开发流程】

1. 从 develop 创建功能分支
   git checkout develop
   git pull origin develop
   git checkout -b feature/user-authentication

2. 开发过程中（每完成一个小步骤）
   git status                    # 查看修改状态
   git diff                      # 查看具体修改
   git add .                     # 暂存所有修改
   git commit -m "feat(auth): 添加用户登录功能"

3. 功能完成，合并回 develop
   git checkout develop
   git pull origin develop       # 确保 develop 是最新的
   git merge feature/user-authentication --no-ff
   git push origin develop
   git branch -d feature/user-authentication  # 删除本地功能分支

【Bug 修复流程】

1. 从 develop 创建修复分支
   git checkout develop
   git checkout -b bugfix/login-error

2. 修复并提交
   git add .
   git commit -m "fix(auth): 修复登录页面空白问题"

3. 合并回 develop
   git checkout develop
   git merge bugfix/login-error --no-ff
   git push origin develop

【发布流程】

1. 从 develop 创建发布分支
   git checkout develop
   git checkout -b release/1.2.0

2. 进行测试和文档更新
   # 修复发现的问题
   git commit -m "fix: 修复发布前发现的问题"

3. 发布到生产环境
   git checkout main
   git merge release/1.2.0 --no-ff
   git tag -a v1.2.0 -m "发布版本 1.2.0"
   git push origin main
   git push origin v1.2.0

4. 合并回 develop
   git checkout develop
   git merge release/1.2.0 --no-ff
   git push origin develop
   git branch -d release/1.2.0

【紧急修复流程 (Hotfix)】

1. 从 main 创建紧急修复分支
   git checkout main
   git checkout -b hotfix/critical-security

2. 修复问题
   git add .
   git commit -m "hotfix: 修复安全漏洞"

3. 合并到 main 和 develop
   git checkout main
   git merge hotfix/critical-security --no-ff
   git tag -a v1.2.1 -m "紧急修复安全漏洞"
   git push origin main
   git push origin v1.2.1
   
   git checkout develop
   git merge hotfix/critical-security --no-ff
   git push origin develop
   git branch -d hotfix/critical-security
```

#### 简化工作流（个人项目）

如果是个人开发，可以简化为：

```
1. 开始新功能前
   git checkout -b feature/xxx          # 从 develop 创建功能分支

2. 开发过程中
   git add .
   git commit -m "feat(xxx): 具体描述"

3. 功能完成
   git checkout develop                 # 切回开发分支
   git pull origin develop              # 拉取最新代码
   git merge feature/xxx --no-ff        # 合并功能分支
   git push origin develop              # 推送到远程

4. 定期发布到生产
   git checkout main                    # 切到生产分支
   git merge develop --no-ff            # 合并开发分支
   git tag -a v1.x.0 -m "发布版本"
   git push origin main
   git push origin v1.x.0
   git checkout develop                 # 切回开发分支
```

#### 常用快捷命令

```bash
# 查看当前分支和状态
git status
git branch

# 查看提交历史
git log --oneline -10                   # 最近 10 条提交
git log --graph --oneline --all         # 图形化显示分支

# 撤销操作
git restore <file>                      # 撤销工作区修改
git restore --staged <file>             # 取消暂存
git reset --hard HEAD~1                 # 回退到上一次提交（危险！）
git revert <commit-hash>                # 安全撤销某次提交

# 临时保存修改
git stash                               # 保存当前修改
git stash list                          # 查看保存的列表
git stash pop                           # 恢复并删除

# 同步远程
git fetch origin                        # 拉取远程信息
git pull origin develop                 # 拉取并合并
git push origin develop                 # 推送到远程
```

### 3.4 `.gitignore` 补充建议

当前 `.gitignore` 已排除 `node_modules/`, `dist/`, `.env`, `uploads/*`, `nul`, `NUL`。建议补充：

```gitignore
# 构建产物
*.js.map
*.d.ts.map

# IDE
.vscode/
.idea/

# 临时文件
*.tmp
*.bak
*.swp

# 百度云临时文件
*.baiduyun.uploading.cfg

# 调试脚本（一次性）
server/check_*.ts
server/check_*.js
server/src/check-*.ts
server/src/migrate-*.ts
server/src/fix-*.ts
server/src/update-*.ts
server/src/debug_*.ts
```

---

## 四、总结

### 4.1 版本管理最佳实践

| 维度 | 建议 | 说明 |
|------|------|------|
| **分支策略** | Git Flow | main + develop + feature/bugfix/release/hotfix |
| **提交频率** | 小而频繁 | 每个提交应该是完整的工作单元 |
| **提交信息** | 规范化 | 使用 `type(scope): description` 格式 |
| **版本标签** | 语义化版本 | vMAJOR.MINOR.PATCH，重要里程碑打标签 |
| **远程备份** | 定期推送 | 每天至少推送一次到 GitHub |
| **代码审查** | Pull Request | 团队协作时使用 PR 进行代码审查 |

### 4.2 当前仓库状态

| 项目 | 状态 | 说明 |
|------|------|------|
| 远程仓库 | ✅ 已配置 | https://github.com/Darren2676/rubber.git |
| GitHub CLI | ✅ 已安装 | 路径：`C:\Program Files\GitHub CLI\gh.exe` |
| 主分支 | ✅ main | 生产环境代码 |
| 开发分支 | ✅ develop | 开发环境代码 |
| 版本标签 | ✅ v1.0.0, v1.1.0 | 重要版本已标记 |
| .gitignore | ✅ 已配置 | 排除不必要的文件 |

### 4.3 快速参考卡片

```bash
# 每天开始工作
git checkout develop
git pull origin develop

# 开发新功能
git checkout -b feature/xxx
# ... 开发 ...
git add .
git commit -m "feat(xxx): 描述"
git checkout develop
git merge feature/xxx --no-ff
git push origin develop

# 发布新版本
git checkout main
git merge develop --no-ff
git tag -a v1.x.0 -m "发布版本"
git push origin main
git push origin v1.x.0

# 查看状态
git status
git log --oneline -10
git branch -a
git tag -l
```

### 4.4 历史状态对比

| 维度 | 初始状态 | 当前状态 |
|------|---------|---------|
| 版本记录 | ❌ 17,635 行代码未提交 | ✅ 按功能分批提交，历史清晰 |
| 远程备份 | ❌ 无远程仓库 | ✅ 推送到 GitHub |
| 分支策略 | ❌ 单分支 main | ✅ main + develop + 功能分支 |
| 提交规范 | ⚠️ 部分提交格式良好 | ✅ 统一 `type(scope): desc` 格式 |
| .gitignore | ✅ 基本覆盖 | ✅ 补充 server/uploads 等 |
| 版本标签 | ⚠️ 仅 v1.0.0 | ✅ 完整的版本标签体系 |

**🎉 版本管理已完善，可以安心开发了！**
