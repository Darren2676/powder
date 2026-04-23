<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="线边仓流水" style="padding: 0; margin: 0 0 8px 0;" />

    <a-card :bordered="false" size="small" style="margin-bottom:8px;">
      <a-row :gutter="12" align="middle">
        <a-col :span="6">
          <a-input-search v-model:value="searchText" placeholder="搜索流水号/生产单号/来源单号/产品" enter-button size="small" @search="handleSearch" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterTxnType" placeholder="出入类型" allow-clear size="small" style="width:100%;" @change="handleSearch">
            <a-select-option value="入线边">入线边</a-select-option>
            <a-select-option value="出线边">出线边</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterSourceType" placeholder="来源类型" allow-clear size="small" style="width:100%;" @change="handleSearch">
            <a-select-option value="领料入线">领料入线</a-select-option>
            <a-select-option value="报工转出">报工转出</a-select-option>
            <a-select-option value="报工转入">报工转入</a-select-option>
            <a-select-option value="成品入库">成品入库</a-select-option>
          </a-select>
        </a-col>
        <a-col>
          <a-button type="primary" :loading="exportLoading" :disabled="!selectedRowKeys.length" size="small" @click="handleExportSelected"><DownloadOutlined /> 导出选中</a-button>
        </a-col>
      </a-row>
    </a-card>

    <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" :row-selection="rowSelection" size="small" bordered row-key="id" :scroll="{ x: 1600 }" @change="handleTableChange">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'transaction_type'">
          <a-tag :color="record.transaction_type === '入线边' ? 'green' : 'orange'">{{ record.transaction_type }}</a-tag>
        </template>
        <template v-if="column.key === 'source_type'">
          <a-tag :color="sourceTypeColor(record.source_type)">{{ record.source_type }}</a-tag>
        </template>
        <template v-if="column.key === 'direction'">
          <a-tag :color="record.direction === 'IN' ? 'blue' : 'red'">{{ record.direction }}</a-tag>
        </template>
        <template v-if="column.key === 'operation_date'">
          {{ record.operation_date ? dayjs(record.operation_date).format('YYYY-MM-DD HH:mm') : '-' }}
        </template>
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
import { getLinesideTransactions, exportLinesideTransactionsSelected } from '@/api/production/wipReport'
import { generateExportFilename } from '@/utils/exportFilename'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterTxnType = ref<string | undefined>(undefined)
const filterSourceType = ref<string | undefined>(undefined)
const selectedRowKeys = ref<number[]>([])
const exportLoading = ref(false)

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: number[]) => { selectedRowKeys.value = keys }
}))

const pagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` })

const columns = [
  { title: '流水号', dataIndex: 'transaction_number', width: 160 },
  { title: '类型', key: 'transaction_type', width: 80 },
  { title: '来源', key: 'source_type', width: 90 },
  { title: '来源单号', dataIndex: 'source_number', width: 160 },
  { title: '生产单号', dataIndex: 'production_order_number', width: 170 },
  { title: '产品名称', dataIndex: 'item_name', width: 140 },
  { title: '工序序号', dataIndex: 'step_number', width: 80, align: 'center' as const },
  { title: '工作中心', dataIndex: 'work_center_name', width: 120 },
  { title: '数量', dataIndex: 'quantity', width: 80, align: 'right' as const },
  { title: '方向', key: 'direction', width: 60 },
  { title: '操作人', dataIndex: 'operator', width: 80 },
  { title: '时间', dataIndex: 'operation_date', key: 'operation_date', width: 150 }
]

const sourceTypeColor = (t: string) => {
  const map: Record<string, string> = { '领料入线': 'blue', '报工转出': 'orange', '报工转入': 'green', '成品入库': 'purple' }
  return map[t] || 'default'
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getLinesideTransactions({
      page: pagination.current, limit: pagination.pageSize, search: searchText.value,
      transaction_type: filterTxnType.value || '', source_type: filterSourceType.value || ''
    })
    dataSource.value = res?.data?.items || []
    pagination.total = res?.data?.pagination?.total || 0
  } catch { message.error('查询线边仓流水失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleTableChange = (p: any) => { pagination.current = p.current; pagination.pageSize = p.pageSize; fetchData() }

const handleExportSelected = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要导出的行')
    return
  }
  exportLoading.value = true
  try {
    const res = await exportLinesideTransactionsSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('lineside_transactions_selected')
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
