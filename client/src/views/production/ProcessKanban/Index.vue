<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { getKanbanOrders, getKanbanOrderFlow } from '@/api/production/processKanban'
import { getMateriaProperties } from '@/api/master-data/materiaProperty'
import { getFactories } from '@/api/system/factory'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import dayjs from 'dayjs'
import {
  ArrowLeftOutlined, SearchOutlined, ReloadOutlined, SettingOutlined,
  CheckCircleOutlined, ClockCircleOutlined, MinusCircleOutlined,
  CloseCircleOutlined, ThunderboltOutlined
} from '@ant-design/icons-vue'

// ============ 列表视图 ============
const viewMode = ref<'list' | 'flow'>('list')
const loading = ref(false)
const orders = ref<any[]>([])
const pagination = ref({ total: 0, page: 1, limit: 20, totalPages: 0 })
const search = ref('')
const planStatus = ref('')
const itemProperties = ref('产品')
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const materiaPropertyOptions = ref<{value: string; label: string}[]>([])

const fetchMateriaProperties = async () => {
  try {
    const res: any = await getMateriaProperties({ page: 1, limit: 200 })
    if (res.success && res.data?.items) {
      materiaPropertyOptions.value = [
        { value: '', label: '全部' },
        ...res.data.items.map((item: any) => ({
          value: item.materia_properties_name,
          label: item.materia_properties_name
        }))
      ]
    }
  } catch (e) { /* ignore */ }
}

const fetchOrders = async (page = 1) => {
  loading.value = true
  try {
    const res: any = await getKanbanOrders({
      page, limit: pagination.value.limit,
      search: search.value || undefined,
      plan_status: planStatus.value || undefined,
      item_properties: itemProperties.value || undefined,
      factory_id: factoryFilter.value || undefined
    })
    if (res.success) {
      orders.value = res.data.items
      pagination.value = res.data.pagination
    }
  } finally { loading.value = false }
}

const handleSearch = () => fetchOrders(1)
const handleReset = () => { search.value = ''; planStatus.value = ''; itemProperties.value = '产品'; factoryFilter.value = undefined; fetchOrders(1) }
const handlePageChange = (page: number) => fetchOrders(page)

const defaultDataColumns: any[] = [
  { title: '产品编码', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '物料属性', dataIndex: 'item_properties', key: 'item_properties', width: 100, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 150, resizable: true },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true,
    customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100, resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90, align: 'right' as const, resizable: true },
  { title: '工序进度', key: 'step_progress', width: 160, resizable: true },
  { title: '当前工序', dataIndex: 'current_step_name', key: 'current_step_name', width: 110, resizable: true },
  { title: '完成率', key: 'completion_rate', width: 90, align: 'right' as const, resizable: true },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status', width: 80, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('process_kanban_list', defaultDataColumns, {
  fixedLeft: [{ title: '生产单号', key: 'production_order_number', dataIndex: 'production_order_number', width: 160, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

const statusColorMap: Record<string, string> = {
  '未开始': 'default', '已派发': 'processing', '已备料': 'cyan',
  '生产中': 'blue', '已完成': 'green', '已关闭': 'default'
}

// ============ 流程视图 ============
const orderInfo = ref<any>({})
const processFlow = ref<any[]>([])
const reportSummary = ref<any>({})
const currentStepIndex = ref(-1)

const fetchOrderFlow = async (orderNo: string) => {
  loading.value = true
  try {
    const res: any = await getKanbanOrderFlow(orderNo)
    if (res.success) {
      orderInfo.value = res.data.order_info
      processFlow.value = res.data.process_flow
      reportSummary.value = res.data.report_summary
      currentStepIndex.value = res.data.order_info.current_step_index
      viewMode.value = 'flow'
    }
  } finally { loading.value = false }
}

const backToList = () => { viewMode.value = 'list' }

const getStepStatusColor = (status: string) => {
  switch (status) {
    case '已完成': return '#52c41a'
    case '生产中': return '#1677ff'
    case '已关闭': return '#8c8c8c'
    default: return '#d9d9d9'
  }
}

const getStepStatusBg = (status: string, isCurrent: boolean) => {
  if (isCurrent) return '#e6f4ff'
  switch (status) {
    case '已完成': return '#f6ffed'
    case '生产中': return '#f0f5ff'
    case '已关闭': return '#fafafa'
    default: return '#fafafa'
  }
}

const getStepStatusBorder = (status: string, isCurrent: boolean) => {
  if (isCurrent) return '#1677ff'
  switch (status) {
    case '已完成': return '#b7eb8f'
    case '生产中': return '#adc6ff'
    case '已关闭': return '#d9d9d9'
    default: return '#d9d9d9'
  }
}

const getProgressColor = (rate: number) => {
  if (rate >= 100) return '#52c41a'
  if (rate >= 50) return '#1677ff'
  if (rate > 0) return '#faad14'
  return '#d9d9d9'
}

const formatDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-'

onMounted(() => {
  loadColumnPreference()
  fetchMateriaProperties()
  loadFactories()
  fetchOrders()
})

const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}
</script>

<template>
  <div class="kanban-container">
    <!-- ========== 列表视图 ========== -->
    <template v-if="viewMode === 'list'">
      <div class="page-header">
        <span class="page-title">生产单进度看板</span>
      </div>
      <a-card :bodyStyle="{ padding: '12px 16px' }">
        <!-- 搜索栏 -->
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
          <a-input v-model:value="search" placeholder="搜索生产单号/产品" style="width: 220px;" allow-clear @pressEnter="handleSearch">
            <template #prefix><SearchOutlined style="color: #bfbfbf;" /></template>
          </a-input>
          <a-select v-model:value="itemProperties" placeholder="物料属性" allow-clear style="width: 150px;" @change="handleSearch">
            <a-select-option v-for="opt in materiaPropertyOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
          </a-select>
          <a-select v-model:value="factoryFilter" placeholder="全部工厂" allow-clear style="width: 130px;" @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
          <a-select v-model:value="planStatus" placeholder="生产状态" allow-clear style="width: 130px;" @change="handleSearch">
            <a-select-option value="未开始">未开始</a-select-option>
            <a-select-option value="已派发">已派发</a-select-option>
            <a-select-option value="已备料">已备料</a-select-option>
            <a-select-option value="生产中">生产中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
          <a-button type="primary" @click="handleSearch"><SearchOutlined /> 查询</a-button>
          <a-button @click="handleReset">重置</a-button>
          <a-button @click="openColumnSetting"><SettingOutlined /> 列设置</a-button>
        </div>

        <!-- 表格 -->
        <a-table
          :columns="columns"
          :data-source="orders"
          row-key="production_order_number"
          :loading="loading"
          :pagination="{ current: pagination.page, pageSize: pagination.limit, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
          size="small"
          :scroll="{ x: 'max-content' }"
          @change="(p: any) => handlePageChange(p.current)"
          @resizeColumn="handleResizeColumn"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'step_progress'">
              <a-progress
                :percent="record.step_count > 0 ? Math.round(record.completed_steps / record.step_count * 100) : 0"
                :stroke-color="record.completed_steps === record.step_count && record.step_count > 0 ? '#52c41a' : '#1677ff'"
                size="small"
                :format="() => `${record.completed_steps}/${record.step_count}`"
                style="width: 140px;"
              />
            </template>
            <template v-else-if="column.key === 'completion_rate'">
              <span :style="{ color: getProgressColor(record.completion_rate), fontWeight: 600 }">
                {{ record.completion_rate }}%
              </span>
            </template>
            <template v-else-if="column.key === 'plan_status'">
              <a-tag :color="statusColorMap[record.plan_status] || 'default'" style="margin: 0;">{{ record.plan_status }}</a-tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-button type="link" size="small" @click="fetchOrderFlow(record.production_order_number)">流程图</a-button>
            </template>
          </template>
        </a-table>
      </a-card>
    </template>

    <!-- ========== 流程视图 ========== -->
    <template v-if="viewMode === 'flow'">
      <div class="page-header">
        <a-button type="text" @click="backToList"><ArrowLeftOutlined /> 返回列表</a-button>
        <span class="page-title" style="margin-left: 8px;">生产单进度看板</span>
      </div>

      <a-spin :spinning="loading">
        <!-- 生产单基本信息卡片 -->
        <a-card :bodyStyle="{ padding: '12px 20px' }" style="margin-bottom: 12px;">
          <a-descriptions :column="{ xs: 2, sm: 3, md: 5, lg: 6 }" size="small">
            <a-descriptions-item label="生产单号">
              <span style="font-weight: 600; color: #1677ff;">{{ orderInfo.production_order_number }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="产品">{{ orderInfo.item_name }}</a-descriptions-item>
            <a-descriptions-item label="规格">{{ orderInfo.specifications || '-' }}</a-descriptions-item>
            <a-descriptions-item label="计划数量">{{ orderInfo.planned_quantity }} {{ orderInfo.basic_unit }}</a-descriptions-item>
            <a-descriptions-item label="生产状态">
              <a-tag :color="statusColorMap[orderInfo.plan_status] || 'default'">{{ orderInfo.plan_status }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="入库状态">
              <a-tag :color="orderInfo.inbound_status === '全部入库' ? 'green' : orderInfo.inbound_status === '部分入库' ? 'blue' : 'default'">
                {{ orderInfo.inbound_status }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="工厂">{{ orderInfo.factory_short || orderInfo.factory_name || '-' }}</a-descriptions-item>
          </a-descriptions>
        </a-card>

        <!-- 工艺流程图 -->
        <a-card title="工艺流程进度" :headStyle="{ fontWeight: 600, fontSize: '13px', padding: '0 16px', minHeight: '36px' }" :bodyStyle="{ padding: '16px', overflowX: 'auto' }" style="margin-bottom: 12px;">
          <div v-if="processFlow.length === 0" style="text-align: center; color: #8c8c8c; padding: 40px 0;">暂无工序数据</div>
          <div v-else class="flow-container">
            <div
              v-for="(step, idx) in processFlow"
              :key="step.step_number"
              class="flow-step-wrapper"
            >
              <!-- 工序节点 -->
              <div
                class="flow-step-card"
                :style="{
                  borderColor: getStepStatusBorder(step.task_status, idx === currentStepIndex),
                  backgroundColor: getStepStatusBg(step.task_status, idx === currentStepIndex),
                  boxShadow: idx === currentStepIndex ? '0 0 0 2px rgba(22,119,255,0.25)' : 'none'
                }"
              >
                <!-- 当前工序脉冲标记 -->
                <div v-if="idx === currentStepIndex" class="current-badge">当前</div>

                <!-- 头部：工序号 + 状态 -->
                <div class="step-header">
                  <span class="step-number">工序 {{ step.step_number }}</span>
                  <span class="step-status-dot" :style="{ backgroundColor: getStepStatusColor(step.task_status) }"></span>
                  <a-tag :color="step.task_status === '已完成' ? 'green' : step.task_status === '生产中' ? 'blue' : step.task_status === '已关闭' ? 'default' : 'default'" size="small" style="margin: 0; font-size: 11px;">{{ step.task_status }}</a-tag>
                </div>

                <!-- 工序名称 -->
                <div class="step-name">{{ step.process_name }}</div>

                <!-- 工作中心 -->
                <div class="step-center" v-if="step.work_center_name">{{ step.work_center_name }}</div>

                <!-- 数量对比 -->
                <div class="step-qty">
                  <span class="qty-label">计划</span>
                  <span class="qty-value">{{ step.planned_quantity }}</span>
                  <span class="qty-sep">/</span>
                  <span class="qty-label">完成</span>
                  <span class="qty-value" :style="{ color: getProgressColor(step.progress_rate) }">{{ step.completed_quantity }}</span>
                </div>

                <!-- 进度条 -->
                <a-progress
                  :percent="Math.min(step.progress_rate, 100)"
                  :stroke-color="getProgressColor(step.progress_rate)"
                  size="small"
                  :show-info="false"
                  style="margin-top: 6px;"
                />

                <!-- 完成率 + 报工次数 -->
                <div class="step-footer">
                  <span :style="{ color: getProgressColor(step.progress_rate), fontWeight: 600 }">{{ step.progress_rate }}%</span>
                  <span v-if="step.report_count > 0" style="color: #8c8c8c; font-size: 11px;">{{ step.report_count }}次报工</span>
                </div>

                <!-- 检验状态 -->
                <div v-if="step.inspect_status && step.inspect_status !== '无需检'" class="step-inspect">
                  <span style="font-size: 11px; color: #8c8c8c;">检验:</span>
                  <a-tag :color="step.inspect_status === '检验合格' || step.inspect_status === '已处理' ? 'green' : step.inspect_status === '待检' ? 'orange' : 'red'" size="small" style="margin: 0; font-size: 10px;">{{ step.inspect_status }}</a-tag>
                </div>
              </div>

              <!-- 箭头连线 -->
              <div v-if="idx < processFlow.length - 1" class="flow-arrow">
                <svg width="36" height="20" viewBox="0 0 36 20">
                  <line x1="0" y1="10" x2="28" y2="10" :stroke="getStepStatusColor(step.task_status)" stroke-width="2" />
                  <polygon points="28,5 36,10 28,15" :fill="getStepStatusColor(step.task_status)" />
                </svg>
              </div>
            </div>
          </div>
        </a-card>

        <!-- 报工统计汇总 -->
        <a-card title="报工统计" :headStyle="{ fontWeight: 600, fontSize: '13px', padding: '0 16px', minHeight: '36px' }" :bodyStyle="{ padding: '12px 20px' }">
          <a-row :gutter="16">
            <a-col :span="6">
              <a-statistic title="报工总次数" :value="reportSummary.total_report_count" :value-style="{ fontSize: '20px', color: '#1677ff' }">
                <template #suffix><span style="font-size: 12px; color: #8c8c8c;">次</span></template>
              </a-statistic>
            </a-col>
            <a-col :span="6">
              <a-statistic title="合格数量" :value="reportSummary.total_qualified_qty" :value-style="{ fontSize: '20px', color: '#52c41a' }" />
            </a-col>
            <a-col :span="6">
              <a-statistic title="不合格数量" :value="reportSummary.total_unqualified_qty" :value-style="{ fontSize: '20px', color: '#ff4d4f' }" />
            </a-col>
            <a-col :span="6">
              <a-statistic title="合格率" :value="reportSummary.total_reported_qty > 0 ? Math.round(reportSummary.total_qualified_qty / reportSummary.total_reported_qty * 10000) / 100 : 0" :precision="2" :value-style="{ fontSize: '20px', color: '#52c41a' }">
                <template #suffix><span style="font-size: 12px; color: #8c8c8c;">%</span></template>
              </a-statistic>
            </a-col>
          </a-row>
        </a-card>
      </a-spin>
    </template>
    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
.kanban-container {
  background: #f7f8fa;
  min-height: 100%;
}
.page-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 0 2px;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
}

/* ====== 流程图样式 ====== */
.flow-container {
  display: flex;
  align-items: flex-start;
  gap: 0;
  padding: 8px 0;
  min-width: max-content;
}

.flow-step-wrapper {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.flow-step-card {
  position: relative;
  width: 160px;
  border: 2px solid #d9d9d9;
  border-radius: 8px;
  padding: 10px 12px;
  transition: all 0.3s;
}

.flow-step-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}

.current-badge {
  position: absolute;
  top: -10px;
  right: -4px;
  background: #1677ff;
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}

.step-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.step-number {
  font-size: 11px;
  color: #8c8c8c;
  font-weight: 500;
}

.step-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: auto;
}

.step-name {
  font-size: 14px;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-center {
  font-size: 11px;
  color: #8c8c8c;
  margin-bottom: 4px;
}

.step-qty {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  margin-top: 4px;
}

.qty-label {
  color: #8c8c8c;
}

.qty-value {
  font-weight: 600;
  color: #1d2129;
}

.qty-sep {
  color: #d9d9d9;
  margin: 0 2px;
}

.step-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}

.step-inspect {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #f0f0f0;
}

.flow-arrow {
  display: flex;
  align-items: center;
  margin: 0 2px;
  padding-top: 30px;
}
</style>
