<template>
  <a-modal v-model:open="visible" title="选择设计BOM" @ok="handleConfirm" width="800px" :confirm-loading="loading">
    <div style="margin-bottom:12px;display:flex;gap:8px">
      <a-input v-model:value="searchText" placeholder="BOM编号/名称/产品编号" allow-clear style="width:240px" @pressEnter="fetchData" />
      <a-button type="primary" @click="fetchData">查询</a-button>
    </div>
    <a-table :columns="columns" :data-source="tableData" :loading="tableLoading" row-key="bom_number"
      :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t:number) => `共 ${t} 条` }"
      @change="handleTableChange" size="small"
      :row-selection="{ type: 'radio', selectedRowKeys: selectedKeys, onChange: onSelectChange }"
      :scroll="{ y: 360 }">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'approval_status'">
          <a-tag :color="record.approval_status === '已审批' ? 'green' : 'default'">{{ record.approval_status }}</a-tag>
        </template>
        <template v-if="column.dataIndex === 'condition'">
          <a-tag :color="record.condition === '启用' ? 'blue' : 'default'">{{ record.condition }}</a-tag>
        </template>
      </template>
    </a-table>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import { getDesignBoms } from '@/api/sales/sampleBom'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  'select': [record: any]
}>()

const visible = ref(props.open)
watch(() => props.open, v => { visible.value = v })
watch(visible, v => { emit('update:open', v) })

const searchText = ref('')
const tableLoading = ref(false)
const tableData = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 10, total: 0 })
const selectedKeys = ref<string[]>([])
const selectedRecord = ref<any>(null)
const loading = ref(false)

const columns = [
  { title: 'BOM编号', dataIndex: 'bom_number', width: 150 },
  { title: 'BOM名称', dataIndex: 'bom_name', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', width: 110 },
  { title: '产品名称', dataIndex: 'item_name', width: 120 },
  { title: '版本', dataIndex: 'bom_version', width: 60 },
  { title: '状态', dataIndex: 'approval_status', width: 80 },
  { title: '条件', dataIndex: 'condition', width: 60 },
]

const fetchData = async () => {
  tableLoading.value = true
  try {
    const res = await getDesignBoms({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value || undefined,
      approval_status: '已审批',
      condition: '启用',
    })
    tableData.value = res.data.items || res.data || []
    pagination.total = res.data.total || 0
  } catch { message.error('获取设计BOM列表失败') }
  finally { tableLoading.value = false }
}

// 打开时自动加载数据
watch(visible, v => {
  if (v) {
    selectedKeys.value = []
    selectedRecord.value = null
    pagination.current = 1
    fetchData()
  }
})

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const onSelectChange = (keys: string[], rows: any[]) => {
  selectedKeys.value = keys
  selectedRecord.value = rows[0] || null
}

const handleConfirm = () => {
  if (!selectedRecord.value) { message.warning('请选择一条设计BOM'); return }
  emit('select', selectedRecord.value)
  visible.value = false
}
</script>
