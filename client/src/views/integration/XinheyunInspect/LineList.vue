<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, CloudSyncOutlined, SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { getInspectLines, syncInspectLines } from '@/api/integration/xinheyunInspect'
import dayjs from 'dayjs'

const loading = ref(false)
const syncing = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const statusFilter = ref('')

const pagination = reactive({
  current: 1, pageSize: 10, total: 0, showSizeChanger: true, showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const statusMap: Record<string, { label: string; color: string }> = {
  'QUALIFIED': { label: '合格', color: 'green' },
  'UN_QUALIFIED': { label: '不合格', color: 'red' }
}

const inspectTypeMap: Record<string, { label: string; color: string }> = {
  'NON': { label: '无', color: 'default' },
  'SELF': { label: '自检', color: 'blue' },
  'SPECIAL': { label: '专检', color: 'orange' }
}

const inspectMethodMap: Record<string, { label: string; color: string }> = {
  'NONE': { label: '无', color: 'default' },
  'HEAD': { label: '首检', color: 'blue' },
  'ALL': { label: '全检', color: 'green' },
  'SAMPLING': { label: '抽检', color: 'orange' },
  'LAST': { label: '末检', color: 'purple' }
}

const columns = [
  { title: '行号', key: 'rowIndex', width: 55, fixed: 'left' as const },
  { title: '编号', dataIndex: 'code', key: 'code', width: 110 },
  { title: '记录编号', dataIndex: 'record_code', key: 'record_code', width: 110 },
  { title: '生产单号', dataIndex: 'work_order_number', key: 'work_order_number', width: 150 },
  { title: '批次流转卡', dataIndex: 'lot_car_code', key: 'lot_car_code', width: 170 },
  { title: '在制品编号', dataIndex: 'item_code', key: 'item_code', width: 120 },
  { title: '在制品名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '工序', dataIndex: 'procedure_name', key: 'procedure_name', width: 90 },
  { title: '检验类型', dataIndex: 'inspect_type', key: 'inspect_type', width: 85 },
  { title: '检验方法', dataIndex: 'inspect_method', key: 'inspect_method', width: 85 },
  { title: '检验方案', dataIndex: 'inspect_plan_name', key: 'inspect_plan_name', width: 120, ellipsis: true },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80 },
  { title: '报工数量', dataIndex: 'job_booking_quantity', key: 'job_booking_quantity', width: 90 },
  { title: '单位', dataIndex: 'jbk_unit_name', key: 'jbk_unit_name', width: 60 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80 },
  { title: '缺陷名称', dataIndex: 'defect_name', key: 'defect_name', width: 100, ellipsis: true },
  { title: '缺陷分类', dataIndex: 'defect_category_name', key: 'defect_category_name', width: 100, ellipsis: true },
  { title: '缺陷原因', dataIndex: 'defect_cause_name', key: 'defect_cause_name', width: 100, ellipsis: true },
  { title: '报工时间', dataIndex: 'job_booking_time', key: 'job_booking_time', width: 150 },
  { title: '创建时间', dataIndex: 'xhy_create_time', key: 'xhy_create_time', width: 150 },
  { title: '同步时间', dataIndex: 'sync_time', key: 'sync_time', width: 150 }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getInspectLines({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined,
      status: statusFilter.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch {
    message.error('获取检验明细行失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; statusFilter.value = ''; pagination.current = 1; fetchData() }

const handleSync = () => {
  Modal.confirm({
    title: '同步检验明细行',
    icon: createVNode(ExclamationCircleOutlined),
    content: '将从新核云系统拉取最新的检验明细行数据并同步到本地数据库。此操作可能需要较长时间，请确认是否继续？',
    okText: '开始同步',
    cancelText: '取消',
    onOk: async () => {
      syncing.value = true
      try {
        const res: any = await syncInspectLines({ batchSize: 200, maxRecords: 50000 })
        if (res.success) {
          const d = res.data
          message.success(`同步完成: 获取 ${d.fetched} 条, 新增 ${d.inserted} 条, 更新 ${d.updated} 条${d.errors > 0 ? ', 失败 ' + d.errors + ' 条' : ''}`)
          fetchData()
        } else {
          message.error(res.message || '同步失败')
        }
      } catch (e: any) {
        message.error('同步失败: ' + (e.response?.data?.message || e.message || '未知错误'))
      } finally {
        syncing.value = false
      }
    }
  })
}

const formatTime = (val: string | null) => {
  if (!val) return '-'
  return dayjs(val).format('YYYY-MM-DD HH:mm')
}

const parseSpecification = (specStr: string) => {
  if (!specStr) return null
  try { return JSON.parse(specStr) } catch { return null }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div style="padding: 16px">
    <a-card title="检验记录明细行" :bordered="false">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="handleSync" :loading="syncing">
            <template #icon><CloudSyncOutlined /></template>
            同步明细行
          </a-button>
        </a-space>
      </template>

      <!-- 搜索栏 -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索编号/生产单号/物料编号/名称/工序/批次流转卡..."
          style="width: 400px"
          allow-clear
          @search="handleSearch"
          @pressEnter="handleSearch"
        />
        <a-select v-model:value="statusFilter" placeholder="检验状态" style="width: 120px" allow-clear @change="handleSearch">
          <a-select-option value="">全部状态</a-select-option>
          <a-select-option value="QUALIFIED">合格</a-select-option>
          <a-select-option value="UN_QUALIFIED">不合格</a-select-option>
        </a-select>
        <a-button @click="handleReset">
          <template #icon><ReloadOutlined /></template>
          重置
        </a-button>
      </div>

      <!-- 表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 2200 }"
        row-key="code"
        size="small"
        :bordered="true"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>

          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusMap[record.status]?.color || 'default'">
              {{ statusMap[record.status]?.label || record.status || '-' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'inspect_type'">
            <a-tag :color="inspectTypeMap[record.inspect_type]?.color || 'default'">
              {{ inspectTypeMap[record.inspect_type]?.label || record.inspect_type || '-' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'inspect_method'">
            <a-tag :color="inspectMethodMap[record.inspect_method]?.color || 'default'">
              {{ inspectMethodMap[record.inspect_method]?.label || record.inspect_method || '-' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'job_booking_time'">
            {{ formatTime(record.job_booking_time) }}
          </template>

          <template v-else-if="column.key === 'xhy_create_time'">
            {{ formatTime(record.xhy_create_time) }}
          </template>

          <template v-else-if="column.key === 'sync_time'">
            {{ formatTime(record.sync_time) }}
          </template>

          <template v-else-if="column.key === 'quantity'">
            {{ record.quantity || 0 }}
          </template>

          <template v-else-if="column.key === 'job_booking_quantity'">
            {{ record.job_booking_quantity || 0 }}
          </template>

          <template v-else-if="column.key === 'defect_name'">
            <span v-if="record.defect_name" style="color: #ff4d4f;">{{ record.defect_name }}</span>
            <span v-else style="color: #999;">-</span>
          </template>

          <template v-else-if="column.key === 'defect_category_name'">
            <span v-if="record.defect_category_name" style="color: #ff4d4f;">{{ record.defect_category_name }}</span>
            <span v-else style="color: #999;">-</span>
          </template>

          <template v-else-if="column.key === 'defect_cause_name'">
            <span v-if="record.defect_cause_name" style="color: #ff4d4f;">{{ record.defect_cause_name }}</span>
            <span v-else style="color: #999;">-</span>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>
