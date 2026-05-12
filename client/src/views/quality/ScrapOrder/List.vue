<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined,
  EyeOutlined, DeleteOutlined
} from '@ant-design/icons-vue'
import {
  getScrapOrders, getScrapOrderDetail, exportScrapOrders
} from '@/api/quality/scrapOrder'
import { generateExportFilename } from '@/utils/exportFilename'

defineOptions({ name: 'ScrapOrderList' })

// ==================== State ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterApprovalStatus = ref<string | undefined>(undefined)
const pagination = reactive({ current: 1, pageSize: 15, total: 0 })
const stats = ref<any>({})

// ==================== Detail Modal ====================
const detailVisible = ref(false)
const detailHeader = ref<any>({})
const detailItems = ref<any[]>([])
const detailNcInfo = ref<any>(null)

// ==================== Columns ====================
const columns = [
  { title: '行号', key: 'rowIndex', width: 55, fixed: 'left' as const },
  { title: '报废单号', dataIndex: 'stock_in_number', key: 'stock_in_number', width: 155 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 110 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格型号', dataIndex: 'specifications', key: 'specifications', width: 100 },
  { title: '报废数量', dataIndex: 'scrap_quantity', key: 'scrap_quantity', width: 90 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 100 },
  { title: '来源类型', dataIndex: 'source_type', key: 'source_type', width: 90 },
  { title: '不合格品单号', dataIndex: 'nonconforming_number', key: 'nonconforming_number', width: 155 },
  { title: '审批状态', key: 'approval_status', width: 90 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 80 },
  { title: '报废日期', dataIndex: 'stock_in_date', key: 'stock_in_date', width: 110 },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '操作', key: 'action', width: 80, fixed: 'right' as const }
]

// ==================== CRUD ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getScrapOrders({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value || undefined,
      approval_status: filterApprovalStatus.value || undefined
    })
    dataSource.value = res.data.items || []
    pagination.total = res.data.pagination?.total || 0
    stats.value = res.data.stats || {}
  } catch { message.error('获取报废单列表失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchList() }
const handleReset = () => {
  searchText.value = ''; filterApprovalStatus.value = undefined
  pagination.current = 1; fetchList()
}
const handleTableChange = (pag: any) => {
  pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchList()
}

// ==================== Detail ====================
const handleDetail = async (record: any) => {
  try {
    const res = await getScrapOrderDetail(record.stock_in_number)
    detailHeader.value = res.data.header || {}
    detailItems.value = res.data.details || []
    detailNcInfo.value = res.data.ncInfo || null
    detailVisible.value = true
  } catch { message.error('加载详情失败') }
}

// ==================== Export ====================
const handleExport = async () => {
  try {
    const res = await exportScrapOrders()
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('scrap_orders', 'xlsx')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

// ==================== Helpers ====================
const getApprovalStatusColor = (status: string) => {
  if (status === '草稿') return 'orange'
  if (status === '已审批') return 'green'
  return 'default'
}
const getSourceTypeColor = (type: string) => {
  if (type === '来料检验') return 'blue'
  if (type === '生产检验') return 'green'
  if (type === '委外检验') return 'purple'
  return 'default'
}

onMounted(() => { fetchList() })
</script>

<template>
  <div>
    <!-- 统计卡片 -->
    <a-row :gutter="16" style="margin-bottom: 16px;">
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff1f0;">
          <a-statistic title="报废单总数" :value="stats.total_count || 0">
            <template #prefix><DeleteOutlined style="color: #f5222d;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff7e6;">
          <a-statistic title="报废总量" :value="stats.total_scrap_quantity || 0" :precision="0" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff7e6;">
          <a-statistic title="待审批" :value="stats.draft_count || 0" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #f6ffed;">
          <a-statistic title="已审批" :value="stats.approved_count || 0" />
        </a-card>
      </a-col>
    </a-row>

    <a-card title="报废单管理" :bordered="false">
      <template #extra>
        <a-space wrap>
          <a-input-search v-model:value="searchText" placeholder="搜索单号/物料" style="width: 200px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
          <a-select v-model:value="filterApprovalStatus" placeholder="审批状态" style="width: 100px" allowClear @change="handleSearch">
            <a-select-option value="草稿">待审批</a-select-option>
            <a-select-option value="已审批">已审批</a-select-option>
          </a-select>
          <a-button @click="handleReset"><ReloadOutlined />重置</a-button>
          <a-button @click="handleExport"><DownloadOutlined />导出</a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns" :data-source="dataSource" :loading="loading"
        row-key="stock_in_number" :pagination="pagination"
        :scroll="{ x: 1700, y: 'calc(100vh - 380px)' }"
        @change="handleTableChange" size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'source_type'">
            <a-tag v-if="record.source_type" :color="getSourceTypeColor(record.source_type)">{{ record.source_type }}</a-tag>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="getApprovalStatusColor(record.approval_status)">{{ record.approval_status === '草稿' ? '待审批' : record.approval_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'nonconforming_number'">
            <span v-if="record.nonconforming_number" style="color: #1890ff; cursor: pointer;" @click="$router.push('/nonconforming-products')">{{ record.nonconforming_number }}</span>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="handleDetail(record)"><EyeOutlined />详情</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== Detail Modal ========== -->
    <a-modal v-model:open="detailVisible" title="报废单详情" :footer="null" width="900px">
      <a-descriptions :column="3" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '110px' }" style="margin-bottom: 16px;">
        <a-descriptions-item label="报废单号">{{ detailHeader.stock_in_number }}</a-descriptions-item>
        <a-descriptions-item label="仓库">{{ detailHeader.warehouse_name }} ({{ detailHeader.warehouse_number }})</a-descriptions-item>
        <a-descriptions-item label="审批状态">
          <a-tag :color="getApprovalStatusColor(detailHeader.approval_status)">{{ detailHeader.approval_status === '草稿' ? '待审批' : detailHeader.approval_status }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="报废日期">{{ detailHeader.stock_in_date }}</a-descriptions-item>
        <a-descriptions-item label="操作人">{{ detailHeader.operator || '-' }}</a-descriptions-item>
        <a-descriptions-item label="创建时间">{{ detailHeader.creation_date }}</a-descriptions-item>
        <a-descriptions-item label="备注" :span="3">{{ detailHeader.remark || '-' }}</a-descriptions-item>
      </a-descriptions>

      <a-descriptions v-if="detailNcInfo" :column="3" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '110px' }" style="margin-bottom: 16px;" title="关联不合格品单">
        <a-descriptions-item label="不合格品单号">{{ detailNcInfo.nonconforming_number }}</a-descriptions-item>
        <a-descriptions-item label="来源类型">
          <a-tag :color="getSourceTypeColor(detailNcInfo.source_type)">{{ detailNcInfo.source_type }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="检验单号">{{ detailNcInfo.source_number }}</a-descriptions-item>
      </a-descriptions>

      <a-table
        :columns="[
          { title: '行号', dataIndex: 'line_number', width: 60 },
          { title: '物料编号', dataIndex: 'item_number', width: 110 },
          { title: '物料名称', dataIndex: 'item_name', width: 140 },
          { title: '规格型号', dataIndex: 'specifications', width: 100 },
          { title: '单位', dataIndex: 'basic_unit', width: 60 },
          { title: '报废数量', dataIndex: 'stock_in_quantity', width: 90 },
          { title: '不合格数量', dataIndex: 'unqualified_quantity', width: 90 },
          { title: '备注', dataIndex: 'remark', width: 150 }
        ]"
        :data-source="detailItems"
        row-key="line_number"
        size="small"
        :pagination="false"
      />
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-descriptions-item-label) {
  white-space: nowrap;
}
</style>
