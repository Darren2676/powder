<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, SearchOutlined, CheckOutlined, CloseOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getBackflushTasks, updateAutoWeigh } from '@/api/production/backflushTask'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'

interface BackflushTaskRow {
  id: number
  backflush_task_number: string
  production_order_number: string
  item_number: string
  item_name: string
  specifications: string
  basic_unit: string
  planned_quantity: number
  bom_number: string
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
  auto_weigh: string
  remark: string
  creation_date: string
  creation_man: string
}

const loading = ref(false)
const dataSource = ref<BackflushTaskRow[]>([])
const searchText = ref('')
const statusFilter = ref<string | undefined>(undefined)
const autoWeighFilter = ref<string | undefined>(undefined)
const selectedRowKeys = ref<number[]>([])

const pagination = reactive({
  current: 1, pageSize: 20, total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
})

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getBackflushTasks({
      page: pagination.current,
      pageSize: pagination.pageSize,
      keyword: searchText.value || undefined,
      deduction_status: statusFilter.value || undefined,
      auto_weigh: autoWeighFilter.value || undefined,
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
  autoWeighFilter.value = undefined
  pagination.current = 1
  fetchData()
}

// ==================== 行选择 ====================
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: number[]) => { selectedRowKeys.value = keys },
}))

// ==================== 批量修改自动称量 ====================
const handleSetAutoWeigh = async (value: 'Y' | 'N') => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择记录')
    return
  }
  try {
    const res: any = await updateAutoWeigh(selectedRowKeys.value, value)
    if (res.success) {
      message.success(`已更新 ${res.data?.updatedCount || selectedRowKeys.value.length} 条记录`)
      selectedRowKeys.value = []
      fetchData()
    } else {
      message.error(res.message || '更新失败')
    }
  } catch { message.error('更新失败') }
}

// ==================== 列个性化 ====================
const defaultDataColumns: any[] = [
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
  { title: '自动称量', dataIndex: 'auto_weigh', key: 'auto_weigh', width: 100, resizable: true },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 100, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, resizable: true, ellipsis: true },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 140, resizable: true },
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('split_backflush_task_list', defaultDataColumns, {
  fixedLeft: [{ title: '#', key: 'rowIndex', width: 50, fixed: 'left' as const, align: 'center' as const }],
})

onMounted(() => {
  loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div class="split-backflush-task-page">
    <a-card :bordered="false" size="small">
      <!-- 搜索栏 -->
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
        <a-input-search v-model:value="searchText" placeholder="生产单号/物料编号/名称" style="width:240px" @search="handleSearch" />
        <a-select v-model:value="statusFilter" placeholder="扣减状态" allowClear style="width:120px" @change="handleSearch">
          <a-select-option value="待扣减">待扣减</a-select-option>
          <a-select-option value="部分扣减">部分扣减</a-select-option>
          <a-select-option value="已完成">已完成</a-select-option>
        </a-select>
        <a-select v-model:value="autoWeighFilter" placeholder="自动称量" allowClear style="width:120px" @change="handleSearch">
          <a-select-option value="Y">是</a-select-option>
          <a-select-option value="N">否</a-select-option>
        </a-select>
        <a-button @click="handleReset">重置</a-button>

        <div style="flex:1" />
        <a-button type="primary" :disabled="selectedRowKeys.length === 0" @click="handleSetAutoWeigh('Y')">
          <template #icon><CheckOutlined /></template>
          设为自动称量
        </a-button>
        <a-button :disabled="selectedRowKeys.length === 0" @click="handleSetAutoWeigh('N')">
          <template #icon><CloseOutlined /></template>
          取消自动称量
        </a-button>
        <a-button @click="fetchData"><template #icon><ReloadOutlined /></template></a-button>
        <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template></a-button>
      </div>

      <!-- 已选提示 -->
      <div v-if="selectedRowKeys.length > 0" style="margin-bottom:8px;color:#1890ff;font-size:12px;">
        已选择 {{ selectedRowKeys.length }} 条记录
      </div>

      <!-- 数据表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :row-key="(record: BackflushTaskRow) => record.id"
        :row-selection="rowSelection"
        :pagination="pagination"
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
        size="small"
        bordered
        :scroll="{ x: 'max-content' }"
      >
        <template #bodyCell="{ column, text, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'deduction_status'">
            <a-tag :color="text === '已完成' ? 'success' : text === '部分扣减' ? 'processing' : 'warning'">{{ text }}</a-tag>
          </template>
          <template v-else-if="column.key === 'auto_weigh'">
            <a-tag :color="text === 'Y' ? 'blue' : 'default'">{{ text === 'Y' ? '是' : '否' }}</a-tag>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 列设置抽屉 -->
    <ColumnSettingDrawer
      v-model:visible="columnSettingVisible"
      :list="columnSettingList"
      :saving="columnSettingSaving"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
.split-backflush-task-page {
  padding: 0;
}
</style>
