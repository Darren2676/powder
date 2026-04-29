# Seals MES 系统 — Git 版本管理手册

> 生成日期：2026-03-17  
> 仓库路径：`d:\rubber\Seals MES System`

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

### 1.5 推荐的提交规范

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

```
1. 开始新功能前
   git checkout -b feat/xxx          # 创建功能分支

2. 开发过程中（每完成一个小步骤）
   git add .
   git commit -m "feat(xxx): 具体描述"

3. 功能完成
   git checkout main                 # 切回主分支
   git merge feat/xxx                # 合并功能分支
   git push                          # 推送远程

4. 每天开始工作
   git pull                          # 拉取最新代码
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

| 维度 | 当前状态 | 目标状态 |
|------|---------|---------|
| 版本记录 | ❌ 17,635 行代码未提交 | ✅ 按功能分批提交，历史清晰 |
| 远程备份 | ❌ 无远程仓库 | ✅ 推送到 Gitee/GitHub |
| 分支策略 | ❌ 单分支 main | ✅ 功能分支 + 主分支 |
| 提交规范 | ⚠️ 部分提交格式良好 | ✅ 统一 `type(scope): desc` 格式 |
| .gitignore | ✅ 基本覆盖 | ✅ 补充 IDE/临时文件 |

**最紧急操作：立即执行分批提交，防止代码丢失。**
