<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, PlusOutlined, DeleteOutlined, EyeOutlined,
  WarningOutlined, CheckCircleOutlined, FileTextOutlined,
  SendOutlined, AuditOutlined, UndoOutlined, MinusCircleOutlined
} from '@ant-design/icons-vue'
import {
  getScrapInboundOrders, getScrapInboundOrderDetail,
  createScrapInboundOrder, deleteScrapInboundOrder
} from '@/api/quality/scrapInboundOrder'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import { getItems } from '@/api/master-data/itemMaster'
import { getFactories } from '@/api/system/factory'
import { useOpenAccountingPeriods } from '@/composables/useOpenAccountingPeriods'
import dayjs from 'dayjs'

defineOptions({ name: 'ScrapInboundOrderList' })

const { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod } = useOpenAccountingPeriods()

// ==================== 列表状态 ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterStatus = ref<string | undefined>(undefined)
const filterFactory = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 15, total: 0 })
const stats = ref<any>({})

// ==================== 详情弹窗 ====================
const detailVisible = ref(false)
const detailHeader = ref<any>({})
const detailRows = ref<any[]>([])
const detailNC = ref<any[]>([])

// ==================== 新建弹窗 ====================
const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({
  accounting_period: '',
  remark: '',
  details: [] as any[]
})

// 物料搜索
const itemSearchLoading = ref(false)
const itemSearchResults = ref<any[]>([])
let itemSearchTimer: any = null

// 加载工厂列表
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data?.items || [] }
  } catch (e) { /* ignore */ }
}

// ==================== 列定义 ====================
const columns = [
  { title: '行号', key: 'rowIndex', width: 55, fixed: 'left' as const },
  { title: '入库单号', dataIndex: 'stock_in_number', key: 'stock_in_number', width: 160 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 110 },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name_val || record.factory_name || '-' },
  { title: '会计期间', dataIndex: 'accounting_period', key: 'accounting_period', width: 90 },
  { title: '入库日期', dataIndex: 'stock_in_date', key: 'stock_in_date', width: 110 },
  { title: '审批状态', key: 'approval_status', width: 100 },
  { title: '操作人', dataIndex: 'creation_man', key: 'creation_man', width: 80 },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true },
  { title: '操作', key: 'action', width: 220, fixed: 'right' as const }
]

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', width: 60 },
  { title: '物料编码', dataIndex: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '报废数量', dataIndex: 'stock_in_quantity', width: 90 },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', width: 90 },
  { title: '批次号', dataIndex: 'batch_number', width: 150 }
]

const createDetailColumns = [
  { title: '物料编码', dataIndex: 'item_number', width: 140 },
  { title: '物料名称', dataIndex: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 70 },
  { title: '报废数量', dataIndex: 'stock_in_quantity', width: 100 },
  { title: '操作', key: 'action', width: 60 }
]

// ==================== 列表查询 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getScrapInboundOrders({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined,
      approval_status: filterStatus.value || undefined,
      factory_id: filterFactory.value || undefined
    })
    dataSource.value = res.data.items || []
    pagination.total = res.data.pagination?.total || 0
    stats.value = res.data.stats || {}
  } catch { message.error('获取报废入库单列表失败') }
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

// ==================== 详情 ====================
const openDetail = async (record: any) => {
  try {
    const res = await getScrapInboundOrderDetail(record.stock_in_number)
    if (res?.success) {
      detailHeader.value = res.data?.header || {}
      detailRows.value = res.data?.details || []
      detailNC.value = res.data?.nonconforming || []
      detailVisible.value = true
    }
  } catch { message.error('获取详情失败') }
}

// ==================== 审批操作 ====================
const handleSubmitApproval = (record: any) => {
  Modal.confirm({
    title: '提交审批',
    content: `确定提交报废入库单 [${record.stock_in_number}] 进行审批？`,
    onOk: async () => {
      try {
        await submitForApproval('stock_in', record.stock_in_number)
        message.success('提交审批成功')
        fetchList()
      } catch (e: any) {
        message.error(e.response?.data?.message || '提交审批失败')
      }
    }
  })
}

const handleApprove = (record: any) => {
  Modal.confirm({
    title: '审批通过',
    content: `确定审批通过报废入库单 [${record.stock_in_number}]？审批后将自动更新报废仓库存。`,
    onOk: async () => {
      try {
        await approveRecord('stock_in', record.stock_in_number)
        message.success('审批通过')
        fetchList()
      } catch (e: any) {
        message.error(e.response?.data?.message || '审批失败')
      }
    }
  })
}

const handleReverse = (record: any) => {
  Modal.confirm({
    title: '反审',
    content: `确定反审报废入库单 [${record.stock_in_number}]？库存将自动回退。`,
    onOk: async () => {
      try {
        await reverseApproval('stock_in', record.stock_in_number)
        message.success('反审成功')
        fetchList()
      } catch (e: any) {
        message.error(e.response?.data?.message || '反审失败')
      }
    }
  })
}

const handleWithdraw = (record: any) => {
  Modal.confirm({
    title: '撤回',
    content: `确定撤回报废入库单 [${record.stock_in_number}] 的审批申请？`,
    onOk: async () => {
      try {
        await withdrawApproval('stock_in', record.stock_in_number)
        message.success('撤回成功')
        fetchList()
      } catch (e: any) {
        message.error(e.response?.data?.message || '撤回失败')
      }
    }
  })
}

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '删除确认',
    content: `确定删除报废入库单 [${record.stock_in_number}]？`,
    onOk: async () => {
      try {
        await deleteScrapInboundOrder(record.stock_in_number)
        message.success('删除成功')
        fetchList()
      } catch (e: any) {
        message.error(e.response?.data?.message || '删除失败')
      }
    }
  })
}

// ==================== 新建 ====================
const openCreate = () => {
  createForm.accounting_period = getDefaultPeriod()
  createForm.remark = ''
  createForm.details = [{ item_number: '', item_name: '', specifications: '', basic_unit: '', stock_in_quantity: 0 }]
  if (noOpenPeriod.value) {
    message.warning('当前没有已开启的会计期间，请联系财务开启后再操作')
  }
  createVisible.value = true
}

const addDetailLine = () => {
  createForm.details.push({ item_number: '', item_name: '', specifications: '', basic_unit: '', stock_in_quantity: 0 })
}

const removeDetailLine = (index: number) => {
  if (createForm.details.length <= 1) { message.warning('至少保留一条明细'); return }
  createForm.details.splice(index, 1)
}

// 物料搜索
const handleItemSearch = (value: string, index: number) => {
  if (itemSearchTimer) clearTimeout(itemSearchTimer)
  if (!value || value.length < 1) { itemSearchResults.value = []; return }
  itemSearchTimer = setTimeout(async () => {
    itemSearchLoading.value = true
    try {
      const res = await getItems({ search: value, limit: 20 })
      itemSearchResults.value = res.data?.items || res.data || []
    } catch { itemSearchResults.value = [] }
    finally { itemSearchLoading.value = false }
  }, 300)
}

const handleItemSelect = (value: string, index: number) => {
  const item = itemSearchResults.value.find((i: any) => i.item_number === value)
  if (item) {
    createForm.details[index].item_number = item.item_number
    createForm.details[index].item_name = item.item_name || ''
    createForm.details[index].specifications = item.specifications || ''
    createForm.details[index].basic_unit = item.basic_unit || ''
  }
}

const handleCreateSubmit = async () => {
  const validDetails = createForm.details.filter(d => d.item_number && Number(d.stock_in_quantity) > 0)
  if (!validDetails.length) { message.warning('请填写至少一条有效明细（物料编码和报废数量必填）'); return }

  createLoading.value = true
  try {
    await createScrapInboundOrder({
      details: validDetails.map(d => ({
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications,
        basic_unit: d.basic_unit,
        stock_in_quantity: Number(d.stock_in_quantity)
      })),
      accounting_period: createForm.accounting_period,
      remark: createForm.remark
    })
    message.success('报废入库单创建成功')
    createVisible.value = false
    fetchList()
  } catch (e: any) {
    message.error(e.response?.data?.message || '创建失败')
  } finally { createLoading.value = false }
}

// ==================== 辅助函数 ====================
const getStatusColor = (status: string) => {
  if (status === '草稿') return 'default'
  if (status === '待审批') return 'processing'
  if (status === '已审批') return 'green'
  return 'default'
}

const formatDate = (date: string) => {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DD')
}

const formatDateTime = (date: string) => {
  if (!date) return ''
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

onMounted(() => { fetchOpenPeriods(); fetchList(); loadFactories() })
</script>

<template>
  <div>
    <!-- 统计卡片 -->
    <a-row :gutter="16" style="margin-bottom: 16px;">
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #e6f7ff;">
          <a-statistic title="总单数" :value="stats.total || 0">
            <template #prefix><FileTextOutlined style="color: #1890ff;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff7e6;">
          <a-statistic title="草稿" :value="stats.draft_count || 0">
            <template #prefix><WarningOutlined style="color: #fa8c16;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff0f6;">
          <a-statistic title="待审批" :value="stats.pending_count || 0">
            <template #prefix><SendOutlined style="color: #eb2f96;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #f6ffed;">
          <a-statistic title="已审批" :value="stats.approved_count || 0">
            <template #prefix><CheckCircleOutlined style="color: #52c41a;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
    </a-row>

    <a-card title="报废入库单" :bordered="false">
      <template #extra>
        <a-space wrap>
          <a-input-search v-model:value="searchText" placeholder="搜索单号/物料" style="width: 200px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
          <a-select v-model:value="filterStatus" placeholder="状态" style="width: 100px" allowClear @change="handleSearch">
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审批</a-select-option>
            <a-select-option value="已审批">已审批</a-select-option>
          </a-select>
          <a-select v-model:value="filterFactory" placeholder="工厂" style="width: 120px" allowClear @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
          <a-button @click="handleReset"><ReloadOutlined />重置</a-button>
          <a-button type="primary" @click="openCreate"><PlusOutlined />新建</a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns" :data-source="dataSource" :loading="loading"
        row-key="stock_in_number" :pagination="pagination"
        :scroll="{ x: 1200, y: 'calc(100vh - 380px)' }"
        @change="handleTableChange" size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'stock_in_date'">
            {{ formatDate(record.stock_in_date) }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="getStatusColor(record.approval_status)">{{ record.approval_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'creation_date'">
            {{ formatDateTime(record.creation_date) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="openDetail(record)"><EyeOutlined />详情</a-button>
              <a-button v-if="record.approval_status === '草稿'" type="link" size="small" @click="handleSubmitApproval(record)"><SendOutlined />提交</a-button>
              <a-button v-if="record.approval_status === '待审批'" type="link" size="small" style="color: #52c41a;" @click="handleApprove(record)"><AuditOutlined />审批</a-button>
              <a-button v-if="record.approval_status === '待审批'" type="link" size="small" @click="handleWithdraw(record)"><UndoOutlined />撤回</a-button>
              <a-button v-if="record.approval_status === '已审批'" type="link" size="small" danger @click="handleReverse(record)"><UndoOutlined />反审</a-button>
              <a-popconfirm v-if="record.approval_status === '草稿'" title="确定删除？" @confirm="handleDelete(record)">
                <a-button type="link" size="small" danger><DeleteOutlined /></a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== 详情弹窗 ========== -->
    <a-modal v-model:open="detailVisible" title="报废入库单详情" :footer="null" width="1000px">
      <a-descriptions bordered size="small" :column="3" style="margin-bottom: 16px;">
        <a-descriptions-item label="入库单号">{{ detailHeader.stock_in_number }}</a-descriptions-item>
        <a-descriptions-item label="仓库">{{ detailHeader.warehouse_name }} ({{ detailHeader.warehouse_number }})</a-descriptions-item>
        <a-descriptions-item label="入库类型">{{ detailHeader.stock_in_type }}</a-descriptions-item>
        <a-descriptions-item label="会计期间">{{ detailHeader.accounting_period || '-' }}</a-descriptions-item>
        <a-descriptions-item label="入库日期">{{ formatDate(detailHeader.stock_in_date) }}</a-descriptions-item>
        <a-descriptions-item label="审批状态">
          <a-tag :color="getStatusColor(detailHeader.approval_status)">{{ detailHeader.approval_status }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="创建人">{{ detailHeader.creation_man }}</a-descriptions-item>
        <a-descriptions-item label="创建时间">{{ formatDateTime(detailHeader.creation_date) }}</a-descriptions-item>
        <a-descriptions-item label="备注" :span="2">{{ detailHeader.remark || '-' }}</a-descriptions-item>
      </a-descriptions>

      <h4 style="margin-bottom: 8px;">明细行</h4>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" row-key="id" size="small" :scroll="{ x: 800 }" />

      <template v-if="detailNC.length > 0">
        <h4 style="margin-top: 16px; margin-bottom: 8px;">关联不合格品记录</h4>
        <a-table
          :columns="[
            { title: '不合格品单号', dataIndex: 'nonconforming_number', width: 160 },
            { title: '来源类型', dataIndex: 'source_type', width: 100 },
            { title: '来源单号', dataIndex: 'source_number', width: 160 },
            { title: '不合格数量', dataIndex: 'unqualified_quantity', width: 100 },
            { title: '处理方式', dataIndex: 'handling_method', width: 100 }
          ]"
          :data-source="detailNC" :pagination="false" row-key="nonconforming_number" size="small"
        />
      </template>
    </a-modal>

    <!-- ========== 新建弹窗 ========== -->
    <a-modal
      v-model:open="createVisible"
      title="新建报废入库单"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      ok-text="创建"
      cancel-text="取消"
      width="900px"
    >
      <a-alert message="报废入库单将自动关联报废仓库，审批通过后将自动更新报废仓库存。" type="info" show-icon style="margin-bottom: 16px;" />

      <a-table
        :columns="createDetailColumns"
        :data-source="createForm.details"
        :pagination="false"
        row-key="item_number"
        size="small"
        :scroll="{ x: 700 }"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.dataIndex === 'item_number'">
            <a-select
              v-model:value="record.item_number"
              show-search
              :filter-option="false"
              placeholder="搜索物料"
              style="width: 100%"
              :loading="itemSearchLoading"
              @search="(v: string) => handleItemSearch(v, index)"
              @select="(v: string) => handleItemSelect(v, index)"
            >
              <a-select-option v-for="item in itemSearchResults" :key="item.item_number" :value="item.item_number">
                {{ item.item_number }} - {{ item.item_name }}
              </a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.dataIndex === 'stock_in_quantity'">
            <a-input-number v-model:value="record.stock_in_quantity" :min="0.0001" :precision="4" style="width: 100%;" placeholder="数量" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" danger size="small" @click="removeDetailLine(index)" :disabled="createForm.details.length <= 1">
              <MinusCircleOutlined />
            </a-button>
          </template>
        </template>
      </a-table>
      <a-button type="dashed" @click="addDetailLine" style="width: 100%; margin-top: 8px;">
        <PlusOutlined />添加明细行
      </a-button>

      <a-form :label-col="{ span: 4 }" :wrapper-col="{ span: 18 }" style="margin-top: 16px;">
        <a-form-item label="会计期间">
          <a-select v-model:value="createForm.accounting_period" placeholder="请选择会计期间"
            :loading="openPeriodLoading" style="width: 200px">
            <a-select-option v-for="opt in openPeriodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
            <a-select-option v-if="noOpenPeriod" disabled value="">无已开启期间</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="2" placeholder="请输入备注信息" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-descriptions-item-label) {
  white-space: nowrap;
}
</style>
