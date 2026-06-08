<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined,
  EyeOutlined, CheckCircleOutlined, ExperimentOutlined
} from '@ant-design/icons-vue'
import {
  getReworkOrders, getReworkOrderDetail,
  completeRework, reworkReInspect, exportReworkOrders
} from '@/api/quality/reworkOrder'
import { getFactories } from '@/api/system/factory'
import { generateExportFilename } from '@/utils/exportFilename'
import { useModalDrag } from '@/composables/useModalDrag'

defineOptions({ name: 'ReworkOrderList' })

// ==================== State ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterStatus = ref<string | undefined>(undefined)
const filterFactory = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch (e) { /* ignore */ }
}
const pagination = reactive({ current: 1, pageSize: 15, total: 0 })
const stats = ref<any>({})

// ==================== Detail Modal ====================
const detailVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const detailRecord = ref<any>({})

// ==================== Re-inspect Modal ====================
const reInspectVisible = ref(false)
const reInspectRecord = ref<any>({})
const reInspectForm = reactive({
  rework_result: '' as string,
  re_inspection_number: '' as string
})

// ==================== Columns ====================
const columns = [
  { title: '行号', key: 'rowIndex', width: 55, fixed: 'left' as const },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '返修单号', dataIndex: 'rework_order_number', key: 'rework_order_number', width: 150 },
  { title: '不合格品单号', dataIndex: 'nonconforming_number', key: 'nonconforming_number', width: 150 },
  { title: '检验单号', dataIndex: 'source_inspection_number', key: 'source_inspection_number', width: 150 },
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 130 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 110 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '返修工序号', dataIndex: 'rework_step_number', key: 'rework_step_number', width: 100 },
  { title: '返修数量', dataIndex: 'rework_quantity', key: 'rework_quantity', width: 90 },
  { title: '返修状态', key: 'rework_status', width: 90 },
  { title: '返修结果', dataIndex: 'rework_result', key: 'rework_result', width: 90 },
  { title: '开始日期', dataIndex: 'rework_start_date', key: 'rework_start_date', width: 130 },
  { title: '完成日期', dataIndex: 'rework_complete_date', key: 'rework_complete_date', width: 130 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const }
]

// ==================== CRUD ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getReworkOrders({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value || undefined,
      rework_status: filterStatus.value || undefined,
      factory_id: filterFactory.value
    })
    dataSource.value = res.data.items || []
    pagination.total = res.data.pagination?.total || 0
    stats.value = res.data.stats || {}
  } catch { message.error('获取返修单列表失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchList() }
const handleReset = () => {
  searchText.value = ''; filterStatus.value = undefined; filterFactory.value = undefined
  pagination.current = 1; fetchList()
}
const handleTableChange = (pag: any) => {
  pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchList()
}

// ==================== Detail ====================
const handleDetail = async (record: any) => {
  try {
    detailResetDrag()
    const res = await getReworkOrderDetail(record.rework_order_number)
    detailRecord.value = res.data || {}
    detailVisible.value = true
  } catch { message.error('加载详情失败') }
}

// ==================== Complete Rework ====================
const handleComplete = async (record: any) => {
  try {
    await completeRework(record.rework_order_number, { remark: '' })
    message.success('返修完成，请进行再检验')
    fetchList()
  } catch (e: any) {
    message.error(e.response?.data?.message || '操作失败')
  }
}

// ==================== Re-inspect ====================
const openReInspect = (record: any) => {
  reInspectRecord.value = { ...record }
  reInspectForm.rework_result = ''
  reInspectForm.re_inspection_number = ''
  reInspectVisible.value = true
}

const handleReInspectOk = async () => {
  if (!reInspectForm.rework_result) { message.warning('请选择再检验结果'); return }
  try {
    await reworkReInspect(reInspectRecord.value.rework_order_number, { ...reInspectForm })
    message.success(`返修再检验结果：${reInspectForm.rework_result}`)
    reInspectVisible.value = false
    fetchList()
  } catch (e: any) {
    message.error(e.response?.data?.message || '操作失败')
  }
}

// ==================== Export ====================
const handleExport = async () => {
  try {
    const res = await exportReworkOrders(filterFactory.value)
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('rework_orders', 'xlsx')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

// ==================== Helpers ====================
const getStatusColor = (status: string) => {
  if (status === '待返修') return 'orange'
  if (status === '返修中') return 'processing'
  if (status === '返修完成') return 'green'
  return 'default'
}
const getResultColor = (result: string) => {
  if (result === '合格') return 'green'
  if (result === '不合格') return 'red'
  return 'default'
}

onMounted(() => { loadFactories(); fetchList() })
</script>

<template>
  <div>
    <!-- 统计卡片 -->
    <a-row :gutter="16" style="margin-bottom: 16px;">
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff7e6;">
          <a-statistic title="待返修" :value="stats.pending_count || 0">
            <template #prefix><ReloadOutlined style="color: #fa8c16;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #e6f7ff;">
          <a-statistic title="返修中" :value="stats.in_progress_count || 0">
            <template #prefix><ExperimentOutlined style="color: #1890ff;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #f6ffed;">
          <a-statistic title="返修完成" :value="stats.completed_count || 0">
            <template #prefix><CheckCircleOutlined style="color: #52c41a;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #f9f0ff;">
          <a-statistic title="总记录数" :value="stats.total_count || 0" />
        </a-card>
      </a-col>
    </a-row>

    <a-card title="返修单管理" :bordered="false">
      <template #extra>
        <a-space wrap>
          <a-input-search v-model:value="searchText" placeholder="搜索单号/物料" style="width: 200px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
          <a-select v-model:value="filterStatus" placeholder="返修状态" style="width: 100px" allowClear @change="handleSearch">
            <a-select-option value="待返修">待返修</a-select-option>
            <a-select-option value="返修中">返修中</a-select-option>
            <a-select-option value="返修完成">返修完成</a-select-option>
          </a-select>
          <a-select v-model:value="filterFactory" placeholder="所属工厂" style="width: 120px" allowClear @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
          <a-button @click="handleReset"><ReloadOutlined />重置</a-button>
          <a-button @click="handleExport"><DownloadOutlined />导出</a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns" :data-source="dataSource" :loading="loading"
        row-key="rework_order_number" :pagination="pagination"
        :scroll="{ x: 1800, y: 'calc(100vh - 380px)' }"
        @change="handleTableChange" size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'rework_status'">
            <a-tag :color="getStatusColor(record.rework_status)">{{ record.rework_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'rework_result'">
            <a-tag v-if="record.rework_result" :color="getResultColor(record.rework_result)">{{ record.rework_result }}</a-tag>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleDetail(record)"><EyeOutlined />详情</a-button>
              <a-button v-if="record.rework_status === '待返修'" type="link" size="small" @click="handleComplete(record)"><CheckCircleOutlined />完成返修</a-button>
              <a-button v-if="record.rework_status === '返修完成' && !record.rework_result" type="link" size="small" @click="openReInspect(record)"><ExperimentOutlined />再检验</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== Detail Modal ========== -->
    <a-modal v-model:open="detailVisible" :footer="null" width="800px" :style="detailModalStyle">
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">返修单详情</div>
      </template>
      <a-descriptions :column="3" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '110px' }">
        <a-descriptions-item label="返修单号">{{ detailRecord.rework_order_number }}</a-descriptions-item>
        <a-descriptions-item label="不合格品单号">{{ detailRecord.nonconforming_number }}</a-descriptions-item>
        <a-descriptions-item label="检验单号">{{ detailRecord.source_inspection_number }}</a-descriptions-item>
        <a-descriptions-item label="生产单号">{{ detailRecord.production_order_number }}</a-descriptions-item>
        <a-descriptions-item label="物料编号">{{ detailRecord.item_number }}</a-descriptions-item>
        <a-descriptions-item label="物料名称">{{ detailRecord.item_name }}</a-descriptions-item>
        <a-descriptions-item label="规格型号">{{ detailRecord.specifications || '-' }}</a-descriptions-item>
        <a-descriptions-item label="返修工序号">{{ detailRecord.rework_step_number }}</a-descriptions-item>
        <a-descriptions-item label="返修数量"><span style="color: #1890ff; font-weight: bold;">{{ detailRecord.rework_quantity }}</span></a-descriptions-item>
        <a-descriptions-item label="返修状态">
          <a-tag :color="getStatusColor(detailRecord.rework_status)">{{ detailRecord.rework_status }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="返修结果">
          <a-tag v-if="detailRecord.rework_result" :color="getResultColor(detailRecord.rework_result)">{{ detailRecord.rework_result }}</a-tag>
          <span v-else>-</span>
        </a-descriptions-item>
        <a-descriptions-item label="再检验单号">{{ detailRecord.re_inspection_number || '-' }}</a-descriptions-item>
        <a-descriptions-item label="开始日期">{{ detailRecord.rework_start_date || '-' }}</a-descriptions-item>
        <a-descriptions-item label="完成日期">{{ detailRecord.rework_complete_date || '-' }}</a-descriptions-item>
        <a-descriptions-item label="操作人">{{ detailRecord.operator || '-' }}</a-descriptions-item>
        <a-descriptions-item label="备注" :span="3">{{ detailRecord.remark || detailRecord.rework_remark || '-' }}</a-descriptions-item>
      </a-descriptions>
    </a-modal>

    <!-- ========== Re-inspect Modal ========== -->
    <a-modal v-model:open="reInspectVisible" title="返修再检验" @ok="handleReInspectOk" okText="确认" cancelText="取消" width="500px">
      <a-descriptions :column="2" size="small" style="margin-bottom: 16px;">
        <a-descriptions-item label="返修单号">{{ reInspectRecord.rework_order_number }}</a-descriptions-item>
        <a-descriptions-item label="物料">{{ reInspectRecord.item_name }}</a-descriptions-item>
        <a-descriptions-item label="返修数量">{{ reInspectRecord.rework_quantity }}</a-descriptions-item>
        <a-descriptions-item label="返修工序">{{ reInspectRecord.rework_step_number }}</a-descriptions-item>
      </a-descriptions>
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="再检验结果" required>
          <a-radio-group v-model:value="reInspectForm.rework_result">
            <a-radio value="合格">合格</a-radio>
            <a-radio value="不合格">不合格</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="再检验单号">
          <a-input v-model:value="reInspectForm.re_inspection_number" placeholder="可选，填写再检验单号" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
:deep(.ant-descriptions-item-label) {
  white-space: nowrap;
}
</style>
