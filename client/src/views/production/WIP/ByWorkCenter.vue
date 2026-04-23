<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="WIP报告(按工作中心)" style="padding: 0; margin: 0 0 8px 0;" />

    <a-card :bordered="false" size="small" style="margin-bottom:8px;">
      <a-row :gutter="12" align="middle">
        <a-col :span="6">
          <a-input-search v-model:value="searchText" placeholder="搜索工作中心编号/名称" enter-button size="small" @search="handleSearch" />
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
      :pagination="false"
      :row-selection="rowSelection"
      size="small"
      bordered
      row-key="work_center_number"
      :scroll="{ x: 800 }"
      :expandedRowKeys="expandedKeys"
      @expand="handleExpand"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'total_wip_quantity'">
          <span :style="{ color: record.total_wip_quantity > 0 ? '#fa8c16' : '#999', fontWeight: record.total_wip_quantity > 0 ? 'bold' : 'normal' }">{{ record.total_wip_quantity }}</span>
        </template>
      </template>
      <template #expandedRowRender="{ record }">
        <a-table
          v-if="detailMap[record.work_center_number]"
          :columns="detailColumns"
          :data-source="detailMap[record.work_center_number]"
          :pagination="false"
          size="small"
          bordered
          row-key="process_task_number"
        >
          <template #bodyCell="{ column, record: task }">
            <template v-if="column.key === 'task_status'">
              <a-tag :color="taskStatusColor(task.task_status)">{{ task.task_status }}</a-tag>
            </template>
            <template v-if="column.key === 'lineside_wip'">
              <span :style="{ color: task.lineside_wip > 0 ? '#fa8c16' : '#999', fontWeight: task.lineside_wip > 0 ? 'bold' : 'normal' }">{{ task.lineside_wip }}</span>
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
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { DownloadOutlined } from '@ant-design/icons-vue'
import { getWipByWorkCenter, getWipByWorkCenterDetail, exportWipByWorkCenterSelected } from '@/api/production/wipReport'
import { generateExportFilename } from '@/utils/exportFilename'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const expandedKeys = ref<string[]>([])
const detailMap = ref<Record<string, any[]>>({})
const selectedRowKeys = ref<string[]>([])
const exportLoading = ref(false)

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))

const columns = [
  { title: '工作中心编号', dataIndex: 'work_center_number', width: 140 },
  { title: '工作中心名称', dataIndex: 'work_center_name', width: 160 },
  { title: '活跃订单数', dataIndex: 'active_order_count', width: 100, align: 'right' as const },
  { title: '线边在制总量', key: 'total_wip_quantity', dataIndex: 'total_wip_quantity', width: 120, align: 'right' as const },
  { title: '在制产品种类', dataIndex: 'item_type_count', width: 110, align: 'right' as const }
]

const detailColumns = [
  { title: '生产单编号', dataIndex: 'production_order_number', width: 170 },
  { title: '产品名称', dataIndex: 'item_name', width: 150 },
  { title: '工序名称', dataIndex: 'standard_process_name', width: 120 },
  { title: '计划数量', dataIndex: 'planned_quantity', width: 90, align: 'right' as const },
  { title: '已完成', dataIndex: 'completed_quantity', width: 90, align: 'right' as const },
  { title: '线边数量', key: 'lineside_wip', dataIndex: 'lineside_wip', width: 90, align: 'right' as const },
  { title: '工序状态', key: 'task_status', width: 80 }
]

const taskStatusColor = (s: string) => {
  const map: Record<string, string> = { '未开始': 'default', '进行中': 'processing', '已完成': 'green', '已关闭': 'red' }
  return map[s] || 'default'
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getWipByWorkCenter({ search: searchText.value })
    dataSource.value = res?.data?.items || []
  } catch { message.error('查询工作中心WIP失败') }
  finally { loading.value = false }
}

const handleSearch = () => { expandedKeys.value = []; fetchData() }

const handleExpand = async (expanded: boolean, record: any) => {
  const key = record.work_center_number
  if (expanded) {
    if (!detailMap.value[key]) {
      try {
        const res: any = await getWipByWorkCenterDetail(key)
        detailMap.value[key] = res?.data?.items || []
      } catch { message.error('获取工作中心明细失败') }
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
    const res = await exportWipByWorkCenterSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('wip_by_work_center_selected')
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
