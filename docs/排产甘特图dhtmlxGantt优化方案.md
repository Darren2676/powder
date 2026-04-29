# 排产甘特图 dhtmlxGantt 优化方案

## 一、现状分析

| 维度 | 当前实现（ECharts） | 瓶颈 |
|------|-------------------|------|
| 交互能力 | 纯展示，仅支持点击查看 Tooltip | 无法拖拽调整排期 |
| 资源视图 | 设备+班次二维 Y 轴（自定义渲染） | 扩展性差，新增维度成本高 |
| 依赖关系 | 无 | 无法可视化工序前后序 |
| 编辑能力 | 无 | 调整日期必须回到列表页 |
| 导出能力 | 无 | 无法满足车间打印需求 |
| 视图切换 | 手动选择日期范围 | 无内置日/周/月/年视图 |

## 二、选型理由：dhtmlxGantt

| 能力 | 说明 | 对本系统的价值 |
|------|------|--------------|
| **拖拽编辑** | 直接拖拽任务条调整起止时间 | 计划员可直接在甘特图上排产 |
| **资源视图** | 内置 Resource View / Histogram | 原生支持"设备+班次"资源分配视图 |
| **依赖连线** | 任务间 FS/SS/FF/SF 关系 | 可视化工序工艺路线前后序 |
| **关键路径** | 自动计算并高亮 | 识别瓶颈订单 |
| **Baseline** | 计划 vs 实际对比线 | 追踪排期偏差 |
| **内联编辑** | lightbox / inline edit | 双击修改数量、设备、班次 |
| **导出** | PDF/PNG/Excel/MS Project/iCal | 车间现场打印、汇报 |
| **多视图** | 日/周/月/年/季度 | 不同角色按需切换时间粒度 |

## 三、功能增强规划（分三阶段）

### 第一阶段：基础替换（保持现有功能 + 核心增强）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| dhtmlxGantt 替换 ECharts | P0 | 保持现有设备+班次资源视图 |
| 任务拖拽调整日期 | P0 | 拖拽后自动保存回 `production_date` |
| 状态颜色映射 | P0 | 延续现有 5 色状态体系 |
| 日期范围工具栏 | P0 | 保留本周/本月/前后翻页 |
| 全屏模式 | P0 | 保留现有全屏交互 |
| Tooltip 信息卡 | P0 | 保持产品/模具/数量/班产展示 |
| 图例统计 | P1 | 各状态任务数量汇总 |

### 第二阶段：生产场景增强

| 功能 | 优先级 | 说明 |
|------|--------|------|
| **资源分配视图** | P1 | 按设备/班次/人员展示任务负载直方图 |
| **计划 vs 实际对比线** | P1 | Baseline：原始 `production_date` vs 调整后 |
| **任务依赖关系** | P2 | 关联工序任务表，绘制 FS 前后序连线 |
| **关键路径** | P2 | 自动高亮影响交期的任务链 |
| **里程碑标记** | P2 | 标记计划完成节点 |

### 第三阶段：高级交互

| 功能 | 优先级 | 说明 |
|------|--------|------|
| **内联编辑** | P2 | 双击任务条直接修改数量、设备、班次 |
| **拖拽分配资源** | P3 | 跨设备/跨班次拖拽任务 |
| **导出 PDF/Excel** | P3 | 车间现场打印、邮件汇报 |
| **分屏对比** | P3 | 左右分屏对比两个排期方案 |

## 四、技术架构方案

### 4.1 前端依赖

```bash
npm install dhtmlx-gantt
```

### 4.2 组件架构

```
views/production/Gantt/
├── Index.vue              # 页面容器（工具栏 + 全屏控制）
├── components/
│   ├── DhtmlxGantt.vue    # dhtmlxGantt 核心封装
│   ├── GanttToolbar.vue   # 日期范围/视图切换/刷新
│   ├── ResourcePanel.vue  # 资源负载侧边栏（第二阶段）
│   └── TaskLightbox.vue   # 任务编辑弹窗（Ant Design Vue）
├── composables/
│   ├── useGanttConfig.ts  # 配置映射（状态色、字段、模板）
│   ├── useGanttData.ts    # 数据转换（后端数据 ↔ gantt 格式）
│   └── useGanttDrag.ts    # 拖拽事件处理 + 保存回后端
└── types/
    └── gantt.ts           # Gantt 任务/链接/资源类型定义
```

### 4.3 数据模型映射

| dhtmlxGantt 字段 | 映射到 `production_order` | 说明 |
|-----------------|------------------------|------|
| `id` | `production_order_number` | 主键 |
| `text` | `item_name` + 单号 | 显示文本 |
| `start_date` | `production_date` | 生产日期 |
| `end_date` | `planned_completion_time` 或推算 | 完成时间 |
| `duration` | `planned_quantity / actual_daily_output` | 根据班产推算天数 |
| `owner`（resource） | `equipment_number` | 设备资源 |
| `section_id` | `schedule_id` | 班次分组 |
| `progress` | `completed_quantity / planned_quantity` | 完成进度 |
| `color` | 根据 `plan_status` 动态映射 | 状态颜色 |

**依赖关系映射（新增表）：**

```sql
CREATE TABLE production_order_link (
  id INT IDENTITY(1,1) PRIMARY KEY,
  source VARCHAR(50) NOT NULL,      -- 前序生产单号
  target VARCHAR(50) NOT NULL,      -- 后序生产单号
  type VARCHAR(10) DEFAULT '0',     -- 0=FS, 1=SS, 2=FF, 3=SF
  lag INT DEFAULT 0,                -- 间隔天数
  created_at DATETIME DEFAULT GETDATE()
);
```

## 五、后端接口调整

### 5.1 改造现有接口：`GET /api/production/orders/gantt`

**调整后返回格式（dhtmlxGantt 标准）：**

```json
{
  "data": [
    {
      "id": "PO20250317001",
      "text": "密封圈A型 (PO20250317001)",
      "start_date": "2025-03-17",
      "end_date": "2025-03-18",
      "duration": 1,
      "progress": 0.3,
      "owner": "EQ001",
      "color": "#1890ff",
      "planned_quantity": 1000,
      "item_number": "ITEM001",
      "mould_number": "M001",
      "plan_status": "已派发"
    }
  ],
  "links": [
    { "id": 1, "source": "PO20250317001", "target": "PO20250317002", "type": "0" }
  ]
}
```

### 5.2 新增接口：`PUT /api/production/orders/:id/gantt-drag`

**用途：** 拖拽调整任务后保存

```typescript
// 请求体
{
  "production_date": "2025-03-20",
  "planned_completion_time": "2025-03-21",
  "equipment_number": "EQ002",
  "schedule_id": "S002"
}

// 权限校验：plan_status 为 '未开始' 或 '已派发' 时才允许拖拽
```

### 5.3 新增接口：`GET /api/production/orders/gantt-resources`

**用途：** 资源视图所需数据

```json
{
  "resources": [
    { "id": "EQ001", "text": "1号机", "type": "equipment" },
    { "id": "S001", "text": "早班", "parent": "EQ001", "type": "schedule" }
  ]
}
```

## 六、前端核心实现要点

### 6.1 dhtmlxGantt 配置（Resource View）

```typescript
// 启用资源视图
gantt.config.layout = {
  css: "gantt_container",
  cols: [
    {
      width: 400,
      min_width: 300,
      rows: [
        { view: "grid", scrollX: "gridScroll", scrollable: true, config: { columns } },
        { view: "scrollbar", id: "gridScroll" }
      ]
    },
    { resizer: true, width: 1 },
    {
      rows: [
        { view: "timeline", scrollX: "scrollHor", scrollY: "scrollVer" },
        { view: "scrollbar", id: "scrollHor" }
      ]
    },
    { view: "scrollbar", id: "scrollVer" }
  ]
};

// 资源分组：按设备+班次
gantt.config.resource_property = "owner";
gantt.config.resource_store = "resource";
gantt.config.order_branch = true; // 允许同层级拖拽排序
```

### 6.2 状态颜色映射

```typescript
const statusColorMap: Record<string, string> = {
  '未开始': '#d9d9d9',
  '已派发': '#1890ff',
  '已备料': '#faad14',
  '生产中': '#52c41a',
  '已完成': '#8c8c8c'
};

gantt.templates.task_class = (start, end, task) => {
  const statusClass = `gantt-status-${task.plan_status}`;
  return statusClass;
};
```

### 6.3 拖拽保存事件

```typescript
gantt.attachEvent("onAfterTaskDrag", async (id, mode, task, original) => {
  if (mode === gantt.config.drag_mode.move) {
    // 校验权限：只允许调整未开始/已派发的任务
    if (!['未开始', '已派发'].includes(task.plan_status)) {
      message.warning('仅"未开始"或"已派发"状态的任务可调整排期');
      gantt.undo(); // 回滚
      return;
    }
    
    await updateTaskSchedule(id, {
      production_date: dayjs(task.start_date).format('YYYY-MM-DD'),
      equipment_number: task.owner,
      schedule_id: task.section_id
    });
    
    message.success('排期调整已保存');
  }
});
```

### 6.4 Tooltip 模板

```typescript
gantt.templates.tooltip_text = (start, end, task) => {
  return `
    <div style="font-weight:600;margin-bottom:6px">${task.production_order_number}</div>
    <div>产品: ${task.item_name || '-'}</div>
    <div>数量: ${task.planned_quantity || '-'}</div>
    <div>模具: ${task.mould_number || '-'}</div>
    <div>班产: ${task.actual_daily_output || '-'}</div>
    <div>日期: ${dayjs(start).format('YYYY-MM-DD')}</div>
    <div>状态: <span style="color:${task.color}">${task.plan_status}</span></div>
  `;
};
```

## 七、实施计划

| 阶段 | 周期 | 交付物 | 关键里程碑 |
|------|------|--------|-----------|
| **Phase 1** | 3~4 天 | dhtmlxGantt 基础替换 | 保持现有全部功能，任务可拖拽调整日期 |
| **Phase 2** | 4~5 天 | 资源视图 + Baseline + 依赖关系 | 资源负载直方图、计划实际对比线 |
| **Phase 3** | 3~4 天 | 内联编辑 + 导出 + 高级交互 | 双击编辑、PDF导出、跨设备拖拽 |

## 八、风险评估与回退策略

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| dhtmlxGantt 商业授权 | 中 | 高 | 评估 GPL 开源版是否满足；如需商业版评估成本 |
| 大量任务渲染性能 | 中 | 中 | 启用 `smart_rendering`、`static_background`；分页加载 |
| 拖拽保存并发冲突 | 低 | 中 | 后端加乐观锁（version 字段）或排他锁 |
| 现有用户习惯改变 | 低 | 低 | 保留日期工具栏位置，颜色体系不变 |

**回退策略：** 保留 `Index.vue` 当前 ECharts 实现作为 `Index-legacy.vue`，如 dhtmlxGantt 上线后有问题可快速切回。

## 九、已实施的第一阶段变更清单

### 后端变更
- 文件：`server/src/modules/production/order/order.controller.ts`
  - `getGanttData` 接口返回格式从 `{ equipments }` 改为 dhtmlxGantt 标准 `{ data, links }`
  - 新增 `updateGanttTask` 接口（`PUT /orders/:id/gantt-drag`）
  - 自动计算 `duration`、`progress`、`end_date`
  - 状态校验：仅允许 `未开始`/`已派发` 状态的任务拖拽调整

- 文件：`server/src/modules/production/order/order.routes.ts`
  - 新增路由：`PUT /:id/gantt-drag`

- 文件：`client/src/api/production/order.ts`
  - 新增 `updateGanttTask` API 方法

### 前端变更
- 文件：`client/src/views/production/Gantt/Index.vue`
  - 重写为 dhtmlxGantt 实现
  - 保留原有功能：日期范围切换、图例统计、全屏、Tooltip
  - 左侧列表增加设备/班次/数量/状态列
  - 实现拖拽调整生产日期，自动保存回后端

- 文件：`client/src/views/production/Gantt/Index-echarts.vue`
  - 旧版 ECharts 实现备份

### 依赖变更
- `client/package.json`：新增 `dhtmlx-gantt`
