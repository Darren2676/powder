<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, SearchOutlined, CheckOutlined, CloseOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getDetailsByOrder, updateDetailAutoWeigh } from '@/api/production/materialPreparation'
import { getFactories } from '@/api/system/factory'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'

interface PrepDetailRow {
  id: number
  preparation_number: string
  line_number: number
  material_number: string
  material_name: string
  material_type: string
  material_unit: string
  bom_actual_quantity: number
  required_quantity: number
  issued_quantity: number
  step_number: number | null
  standard_process_name: string
  work_center_number: string
  work_center_name: string
  auto_weigh: string
  remark: string
  production_order_number: string
  item_number: string
  item_name: string
  preparation_status: string
  approval_status: string
  factory_id?: number | null
  factory_short?: string
  factory_name?: string
}

const loading = ref(false)
const dataSource = ref<PrepDetailRow[]>([])
const searchText = ref('')
const autoWeighFilter = ref<string | undefined>(undefined)
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const selectedRowKeys = ref<number[]>([])

const pagination = reactive({
  current: 1, pageSize: 100, total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
})

const fetchData = async () => {
  const orderNo = searchText.value.trim()
  if (!orderNo) {
    dataSource.value = []
    pagination.total = 0
    return
  }
  loading.value = true
  try {
    const res: any = await getDetailsByOrder({
      production_order_number: orderNo,
      page: pagination.current,
      limit: pagination.pageSize,
      auto_weigh: autoWeighFilter.value || undefined,
      factory_id: factoryFilter.value || undefined,
    })
    if (res.success && res.data) {
      dataSource.value = res.data.items || []
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
  autoWeighFilter.value = undefined
  factoryFilter.value = undefined
  pagination.current = 1
  dataSource.value = []
  pagination.total = 0
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
  // 按备料单编号分组，每组分开调用更新接口
  const selectedRows = dataSource.value.filter(r => selectedRowKeys.value.includes(r.id))
  const grouped: Record<string, number[]> = {}
  for (const row of selectedRows) {
    if (!grouped[row.preparation_number]) grouped[row.preparation_number] = []
    grouped[row.preparation_number].push(row.id)
  }
  let totalUpdated = 0
  try {
    for (const [prepNumber, ids] of Object.entries(grouped)) {
      const res: any = await updateDetailAutoWeigh(prepNumber, ids, value)
      if (res.success) totalUpdated += res.data?.updatedCount || ids.length
      else { message.error(res.message || '更新失败'); return }
    }
    message.success(`已更新 ${totalUpdated} 条记录`)
    selectedRowKeys.value = []
    fetchData()
  } catch { message.error('更新失败') }
}

// ==================== 列个性化 ====================
const defaultDataColumns: any[] = [
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 150, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 110, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120, resizable: true },
  { title: '备料单号', dataIndex: 'preparation_number', key: 'preparation_number', width: 170, resizable: true },
  { title: '工序号', dataIndex: 'step_number', key: 'step_number', width: 70, resizable: true },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 110, resizable: true },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 120, resizable: true },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 80, resizable: true },
  { title: '单位', dataIndex: 'material_unit', key: 'material_unit', width: 60, resizable: true },
  { title: 'BOM用量', dataIndex: 'bom_actual_quantity', key: 'bom_actual_quantity', width: 90, resizable: true },
  { title: '需求量', dataIndex: 'required_quantity', key: 'required_quantity', width: 90, resizable: true },
  { title: '已发料', dataIndex: 'issued_quantity', key: 'issued_quantity', width: 80, resizable: true },
  { title: '自动称量', dataIndex: 'auto_weigh', key: 'auto_weigh', width: 90, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, resizable: true, ellipsis: true },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('split_backflush_task_list', defaultDataColumns, {
  fixedLeft: [{ title: '#', key: 'rowIndex', width: 50, fixed: 'left' as const, align: 'center' as const }],
})

const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) factoryList.value = res.data.items || []
  } catch { /* ignore */ }
}

onMounted(() => {
  loadColumnPreference()
  loadFactories()
})
</script>

<template>
  <div class="split-backflush-task-page">
    <a-card :bordered="false" size="small">
      <!-- 搜索栏 -->
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
        <a-input-search v-model:value="searchText" placeholder="请输入生产单号" style="width:240px" @search="handleSearch" />
        <a-select v-model:value="autoWeighFilter" placeholder="自动称量" allowClear style="width:120px" @change="handleSearch">
          <a-select-option value="Y">是</a-select-option>
          <a-select-option value="N">否</a-select-option>
        </a-select>
        <a-select v-model:value="factoryFilter" placeholder="全部工厂" allow-clear style="width: 120px" @change="handleSearch">
          <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
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
        :row-key="(record: PrepDetailRow) => record.id"
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
          <template v-if="column.key === 'auto_weigh'">
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
