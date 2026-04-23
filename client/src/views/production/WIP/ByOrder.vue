<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="WIP报告(按生产单)" style="padding: 0; margin: 0 0 8px 0;" />

    <a-card :bordered="false" size="small" style="margin-bottom:8px;">
      <a-row :gutter="12" align="middle">
        <a-col :span="6">
          <a-input-search v-model:value="searchText" placeholder="搜索生产单号/产品编号/产品名称" enter-button size="small" @search="handleSearch" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterStatus" placeholder="生产状态" allow-clear size="small" style="width:100%;" @change="handleSearch">
            <a-select-option value="已派发">已派发</a-select-option>
            <a-select-option value="生产中">生产中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
        </a-col>
        <a-col>
          <a-button type="primary" :loading="exportLoading" :disabled="!selectedRowKeys.length" size="small" @click="handleExportSelected"><DownloadOutlined /> 导出选中</a-button>
        </a-col>
      </a-row>
    </a-card>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="rowSelection"
      size="small"
      bordered
      row-key="production_order_number"
      :scroll="{ x: 1200 }"
      :expandedRowKeys="expandedKeys"
      @change="handleTableChange"
      @expand="handleExpand"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'plan_status'">
          <a-tag :color="statusColor(record.plan_status)">{{ record.plan_status }}</a-tag>
        </template>
        <template v-if="column.key === 'completion_rate'">
          <a-progress :percent="record.completion_rate" :size="'small'" :stroke-color="record.completion_rate >= 100 ? '#52c41a' : '#1890ff'" />
        </template>
        <template v-if="column.key === 'total_wip'">
          <span :style="{ color: record.total_wip > 0 ? '#fa8c16' : '#999', fontWeight: record.total_wip > 0 ? 'bold' : 'normal' }">{{ record.total_wip }}</span>
        </template>
      </template>
      <template #expandedRowRender="{ record }">
        <a-table
          v-if="detailMap[record.production_order_number]"
          :columns="stepColumns"
          :data-source="detailMap[record.production_order_number]"
          :pagination="false"
          size="small"
          bordered
          row-key="process_task_number"
        >
          <template #bodyCell="{ column, record: step }">
            <template v-if="column.key === 'task_status'">
              <a-tag :color="taskStatusColor(step.task_status)">{{ step.task_status }}</a-tag>
            </template>
            <template v-if="column.key === 'lineside_wip'">
              <span :style="{ color: step.lineside_wip > 0 ? '#fa8c16' : '#999', fontWeight: step.lineside_wip > 0 ? 'bold' : 'normal' }">{{ step.lineside_wip }}</span>
            </template>
          </template>
        </a-table>
        <a-spin v-else />
      </template>
    </a-table>

    <div v-if="selectedRowKeys.length" style="margin-top: 8px; color: #666; font-size: 13px">
      已选择 <span style="color: #1677ff; font-weight: 600">{{ selectedRowKeys.length }}</span> 条记录
      <a style="margin-left: 8px" @click="selectedRowKeys = []">清空选择</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { DownloadOutlined } from '@ant-design/icons-vue'
import { getWipByOrder, getWipByOrderDetail, exportWipByOrderSelected } from '@/api/production/wipReport'
import { generateExportFilename } from '@/utils/exportFilename'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterStatus = ref<string | undefined>(undefined)
const expandedKeys = ref<string[]>([])
const detailMap = ref<Record<string, any[]>>({})
const selectedRowKeys = ref<string[]>([])
const exportLoading = ref(false)

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))

const pagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` })

const columns = [
  { title: '生产单编号', dataIndex: 'production_order_number', width: 170 },
  { title: '产品编号', dataIndex: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '计划数量', dataIndex: 'planned_quantity', width: 90, align: 'right' as const },
  { title: '当前工序', dataIndex: 'current_step_name', width: 100 },
  { title: '总在制数量', key: 'total_wip', dataIndex: 'total_wip', width: 100, align: 'right' as const },
  { title: '已入库', dataIndex: 'inbound_quantity', width: 80, align: 'right' as const },
  { title: '完成率', key: 'completion_rate', width: 140 },
  { title: '生产状态', key: 'plan_status', width: 90 }
]

const stepColumns = [
  { title: '工序序号', dataIndex: 'step_number', width: 80, align: 'center' as const },
  { title: '工序名称', dataIndex: 'standard_process_name', width: 120 },
  { title: '工作中心', dataIndex: 'work_center_name', width: 120 },
  { title: '计划数量', dataIndex: 'planned_quantity', width: 90, align: 'right' as const },
  { title: '已完成', dataIndex: 'completed_quantity', width: 90, align: 'right' as const },
  { title: '线边在制', key: 'lineside_wip', dataIndex: 'lineside_wip', width: 90, align: 'right' as const },
  { title: '待加工', dataIndex: 'waiting_quantity', width: 90, align: 'right' as const },
  { title: '状态', key: 'task_status', width: 80 }
]

const statusColor = (s: string) => {
  const map: Record<string, string> = { '已派发': 'blue', '生产中': 'orange', '已完成': 'green' }
  return map[s] || 'default'
}

const taskStatusColor = (s: string) => {
  const map: Record<string, string> = { '未开始': 'default', '进行中': 'processing', '已完成': 'green', '已关闭': 'red' }
  return map[s] || 'default'
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getWipByOrder({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, plan_status: filterStatus.value || ''
    })
    dataSource.value = res?.data?.items || []
    pagination.total = res?.data?.pagination?.total || 0
  } catch { message.error('查询WIP报告失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; expandedKeys.value = []; fetchData() }
const handleTableChange = (p: any) => { pagination.current = p.current; pagination.pageSize = p.pageSize; fetchData() }

const handleExpand = async (expanded: boolean, record: any) => {
  const key = record.production_order_number
  if (expanded) {
    if (!detailMap.value[key]) {
      try {
        const res: any = await getWipByOrderDetail(key)
        detailMap.value[key] = res?.data?.steps || []
      } catch { message.error('获取工序明细失败') }
    }
    expandedKeys.value = [...expandedKeys.value, key]
  } else {
    expandedKeys.value = expandedKeys.value.filter(k => k !== key)
  }
}

const handleExportSelected = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要导出的行')
    return
  }
  exportLoading.value = true
  try {
    const res = await exportWipByOrderSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('wip_by_order_selected')
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch {
    message.error('导出选中行失败')
  } finally {
    exportLoading.value = false
  }
}

onMounted(() => { fetchData() })
</script>
