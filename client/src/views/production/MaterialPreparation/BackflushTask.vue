<script setup lang="ts">
import { ref, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, SearchOutlined, DownloadOutlined, EyeOutlined, RedoOutlined, SettingOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { getBackflushTasks, getBackflushTaskDetail, retryDeduction, exportBackflushTasks } from '@/api/production/backflushTask'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'

interface BackflushTask {
  id: number
  backflush_task_number: string
  production_order_number: string
  item_number: string
  item_name: string
  specifications: string
  basic_unit: string
  planned_quantity: number
  bom_number: string
  bom_base_quantity: number
  step_number: number | null
  standard_process_name: string
  work_center_number: string
  work_center_name: string
  material_number: string
  material_name: string
  material_type: string
  material_unit: string
  bom_actual_quantity: number
  required_quantity: number
  deducted_quantity: number
  deduction_status: string
  warehouse_number: string
  warehouse_name: string
  error_message: string
  remark: string
  creation_date: string
  creation_man: string
}

interface DeductionLog {
  id: number
  backflush_task_id: number
  backflush_task_number: string
  production_order_number: string
  material_number: string
  inbound_quantity: number
  deduction_quantity: number
  batch_deductions: string
  transaction_number: string
  warehouse_number: string
  status: string
  error_message: string
  operator: string
  deduction_date: string
}

const loading = ref(false)
const dataSource = ref<BackflushTask[]>([])
const searchText = ref('')
const statusFilter = ref<string | undefined>(undefined)
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` })

const deductionStatusColors: Record<string, string> = {
  '待扣减': 'warning',
  '部分扣减': 'processing',
  '已完成': 'success'
}

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getBackflushTasks({
      page: pagination.current,
      pageSize: pagination.pageSize,
      keyword: searchText.value || undefined,
      deduction_status: statusFilter.value || undefined,
    })
    if (res.success && res.data) {
      dataSource.value = res.data.rows || []
      pagination.total = res.data.total || 0
    }
  } catch { message.error('查询失败') }
  finally { loading.value = false }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => {
  searchText.value = ''
  statusFilter.value = undefined
  pagination.current = 1
  fetchData()
}

// ==================== 列个性化 ====================
const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '任务编号', dataIndex: 'backflush_task_number', key: 'backflush_task_number', width: 170, resizable: true },
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120, resizable: true },
  { title: '工序号', dataIndex: 'step_number', key: 'step_number', width: 80, resizable: true },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 110, resizable: true },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 120, resizable: true },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 80, resizable: true },
  { title: 'BOM用量', dataIndex: 'bom_actual_quantity', key: 'bom_actual_quantity', width: 90, resizable: true },
  { title: '需求量', dataIndex: 'required_quantity', key: 'required_quantity', width: 90, resizable: true },
  { title: '已扣减', dataIndex: 'deducted_quantity', key: 'deducted_quantity', width: 90, resizable: true },
  { title: '扣减状态', dataIndex: 'deduction_status', key: 'deduction_status', width: 100, resizable: true },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 100, resizable: true },
  { title: '错误信息', dataIndex: 'error_message', key: 'error_message', width: 160, resizable: true, ellipsis: true },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 140, resizable: true },
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('backflush_task_list', defaultDataColumns, {
  fixedLeft: [{ title: '#', key: 'rowIndex', width: 50, fixed: 'left' as const, align: 'center' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

// ==================== 详情抽屉 ====================
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailTask = ref<BackflushTask | null>(null)
const detailLogs = ref<DeductionLog[]>([])

const handleViewDetail = async (record: BackflushTask) => {
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res = await getBackflushTaskDetail(record.id)
    if (res.success && res.data) {
      detailTask.value = res.data.task
      detailLogs.value = res.data.logs || []
    }
  } catch { message.error('查询详情失败') }
  finally { detailLoading.value = false }
}

// ==================== 手动重试 ====================
const handleRetry = (record: BackflushTask) => {
  Modal.confirm({
    title: '手动重试扣减',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要重试物料 "${record.material_name || record.material_number}" 的倒冲扣减吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res = await retryDeduction(record.id)
        if (res.success) {
          message.success(`重试完成：成功 ${res.data?.deductedCount || 0} 项，失败 ${res.data?.failedCount || 0} 项`)
          fetchData()
        } else {
          message.error(res.message || '重试失败')
        }
      } catch { message.error('重试失败') }
    }
  })
}

// ==================== 导出 ====================
const handleExport = async () => {
  try {
    const res = await exportBackflushTasks({
      keyword: searchText.value || undefined,
      deduction_status: statusFilter.value || undefined,
    })
    const blob = new Blob([res.data], { type: 'text/csv; charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `倒冲任务清单_${Date.now()}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

onMounted(() => {
  loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div class="backflush-task-page">
    <a-card :bordered="false" size="small">
      <!-- 搜索栏 -->
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
        <a-input-search v-model:value="searchText" placeholder="生产单号/物料编号/名称" style="width:240px" @search="handleSearch" />
        <a-select v-model:value="statusFilter" placeholder="扣减状态" allowClear style="width:120px" @change="handleSearch">
          <a-select-option value="待扣减">待扣减</a-select-option>
          <a-select-option value="部分扣减">部分扣减</a-select-option>
          <a-select-option value="已完成">已完成</a-select-option>
        </a-select>
        <a-button @click="handleSearch"><template #icon><SearchOutlined /></template>查询</a-button>
        <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
        <div style="flex:1" />
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
        <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
      </div>

      <!-- 数据表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        row-key="id"
        size="small"
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'deduction_status'">
            <a-tag :color="deductionStatusColors[record.deduction_status] || 'default'">{{ record.deduction_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'bom_actual_quantity' || column.key === 'required_quantity' || column.key === 'deducted_quantity' || column.key === 'planned_quantity'">
            {{ record[column.dataIndex] != null ? Number(record[column.dataIndex]).toFixed(4) : '' }}
          </template>
          <template v-else-if="column.key === 'error_message'">
            <a-tooltip v-if="record.error_message" :title="record.error_message">
              <span style="color:#ff4d4f;cursor:pointer;">{{ record.error_message.substring(0, 30) }}{{ record.error_message.length > 30 ? '...' : '' }}</span>
            </a-tooltip>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleViewDetail(record)"><EyeOutlined /> 详情</a-button>
              <a-button
                v-if="record.deduction_status !== '已完成' && record.error_message"
                type="link"
                size="small"
                style="color:#fa8c16"
                @click="handleRetry(record)"
              >
                <RedoOutlined /> 重试
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 详情抽屉 -->
    <a-drawer
      v-model:open="detailVisible"
      title="倒冲任务详情"
      width="640"
      :destroy-on-close="true"
    >
      <a-spin :spinning="detailLoading">
        <template v-if="detailTask">
          <a-descriptions :column="2" size="small" bordered>
            <a-descriptions-item label="任务编号">{{ detailTask.backflush_task_number }}</a-descriptions-item>
            <a-descriptions-item label="生产单号">{{ detailTask.production_order_number }}</a-descriptions-item>
            <a-descriptions-item label="产品编号">{{ detailTask.item_number }}</a-descriptions-item>
            <a-descriptions-item label="产品名称">{{ detailTask.item_name }}</a-descriptions-item>
            <a-descriptions-item label="工序号">{{ detailTask.step_number }}</a-descriptions-item>
            <a-descriptions-item label="工序名称">{{ detailTask.standard_process_name }}</a-descriptions-item>
            <a-descriptions-item label="物料编号">{{ detailTask.material_number }}</a-descriptions-item>
            <a-descriptions-item label="物料名称">{{ detailTask.material_name }}</a-descriptions-item>
            <a-descriptions-item label="BOM用量">{{ Number(detailTask.bom_actual_quantity).toFixed(4) }}</a-descriptions-item>
            <a-descriptions-item label="需求量">{{ Number(detailTask.required_quantity).toFixed(4) }}</a-descriptions-item>
            <a-descriptions-item label="已扣减量">{{ Number(detailTask.deducted_quantity).toFixed(4) }}</a-descriptions-item>
            <a-descriptions-item label="扣减状态">
              <a-tag :color="deductionStatusColors[detailTask.deduction_status] || 'default'">{{ detailTask.deduction_status }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="仓库">{{ detailTask.warehouse_name || detailTask.warehouse_number || '-' }}</a-descriptions-item>
            <a-descriptions-item label="创建时间">{{ detailTask.creation_date }}</a-descriptions-item>
            <a-descriptions-item v-if="detailTask.error_message" label="错误信息" :span="2">
              <span style="color:#ff4d4f">{{ detailTask.error_message }}</span>
            </a-descriptions-item>
          </a-descriptions>

          <a-divider>扣减日志</a-divider>
          <a-table
            :columns="[
              { title: '时间', dataIndex: 'deduction_date', width: 140 },
              { title: '入库量', dataIndex: 'inbound_quantity', width: 80 },
              { title: '扣减量', dataIndex: 'deduction_quantity', width: 80 },
              { title: '状态', dataIndex: 'status', width: 80 },
              { title: '流水号', dataIndex: 'transaction_number', width: 150, ellipsis: true },
              { title: '操作人', dataIndex: 'operator', width: 80 },
              { title: '错误', dataIndex: 'error_message', width: 140, ellipsis: true },
            ]"
            :data-source="detailLogs"
            :pagination="false"
            row-key="id"
            size="small"
            :scroll="{ x: 'max-content' }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'status'">
                <a-tag :color="record.status === '成功' ? 'success' : 'error'">{{ record.status }}</a-tag>
              </template>
              <template v-else-if="column.dataIndex === 'inbound_quantity' || column.dataIndex === 'deduction_quantity'">
                {{ Number(record[column.dataIndex]).toFixed(4) }}
              </template>
            </template>
          </a-table>
        </template>
      </a-spin>
    </a-drawer>

    <!-- 列设置抽屉 -->
    <ColumnSettingDrawer
      v-model:visible="columnSettingVisible"
      :column-list="columnSettingList"
      :saving="columnSettingSaving"
      @move-up="moveColumnUp"
      @move-down="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<script lang="ts">
import { reactive } from 'vue'
export default { name: 'BackflushTaskList' }
</script>

<style scoped>
.backflush-task-page {
  padding: 0;
}
</style>
