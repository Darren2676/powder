<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined,
  DeleteOutlined, ExclamationCircleOutlined, EyeOutlined,
  CheckOutlined, CloseOutlined
} from '@ant-design/icons-vue'
import {
  getScrapDisposalList, getScrapDisposalDetail,
  createScrapDisposal, confirmScrapDisposal, rejectScrapDisposal, deleteScrapDisposal
} from '@/api/warehouse/scrapDisposal'
import { getFactories } from '@/api/system/factory'
import { useModalDrag } from '@/composables/useModalDrag'
import { useOpenAccountingPeriods } from '@/composables/useOpenAccountingPeriods'
import dayjs from 'dayjs'

const { modalStyle: disposalModalStyle, onDragStart: onDisposalDragStart, resetDrag: resetDisposalDrag } = useModalDrag()
const { modalStyle: detailModalStyle, onDragStart: onDetailDragStart, resetDrag: resetDetailDrag } = useModalDrag()
const { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod } = useOpenAccountingPeriods()

// ==================== 处置单列表 ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterStatus = ref('')
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const disposalColumns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '处置单号', dataIndex: 'disposal_number', key: 'disposal_number', width: 170 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '处置原因', dataIndex: 'disposal_reason', key: 'disposal_reason', width: 200, ellipsis: true },
  { title: '会计期间', dataIndex: 'accounting_period', key: 'accounting_period', width: 90 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '申请人', dataIndex: 'operator', key: 'operator', width: 90 },
  { title: '申请日期', dataIndex: 'creation_date', key: 'creation_date', width: 130 },
  { title: '确认人', dataIndex: 'confirmed_by', key: 'confirmed_by', width: 90 },
  { title: '确认日期', dataIndex: 'confirmed_date', key: 'confirmed_date', width: 130 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
  { title: '操作', key: 'action', width: 160, fixed: 'right' as const }
]

const statusColor = (status: string) => {
  if (status === '待确认') return 'orange'
  if (status === '已确认') return 'green'
  if (status === '已驳回') return 'red'
  return 'default'
}

const formatDateTime = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const fetchDisposals = async () => {
  loading.value = true
  try {
    const res: any = await getScrapDisposalList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      status: filterStatus.value,
      factory_id: factoryFilter.value || undefined
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取处置单列表失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchDisposals()
}

const handleSearch = () => {
  pagination.current = 1
  fetchDisposals()
}

const handleReset = () => {
  searchText.value = ''
  filterStatus.value = ''
  factoryFilter.value = undefined
  pagination.current = 1
  fetchDisposals()
}

// ==================== 创建处置申请弹窗 ====================
const createVisible = ref(false)
const createLoading = ref(false)
let detailSeq = 0
const createForm = reactive({
  disposal_reason: '',
  accounting_period: '',
  remark: '',
  details: [] as any[]
})

const createDetailColumns = [
  { title: '行', key: 'index', width: 40 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 110 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
  { title: '处置数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120 },
  { title: '操作', key: 'detailAction', width: 60 }
]

const showCreateModal = () => {
  createForm.disposal_reason = ''
  createForm.accounting_period = getDefaultPeriod()
  createForm.remark = ''
  createForm.details = []
  if (noOpenPeriod.value) {
    message.warning('当前没有已开启的会计期间，请联系财务开启后再操作')
  }
  resetDisposalDrag()
  createVisible.value = true
}

const removeDetailLine = (index: number) => {
  createForm.details.splice(index, 1)
}

const handleCreateSubmit = async () => {
  if (!createForm.disposal_reason) {
    message.warning('请填写处置原因')
    return
  }
  const validDetails = createForm.details.filter((d: any) => Number(d.quantity) > 0)
  if (validDetails.length === 0) {
    message.warning('请至少填写一条处置明细的数量')
    return
  }

  createLoading.value = true
  try {
    const res: any = await createScrapDisposal({
      disposal_reason: createForm.disposal_reason,
      accounting_period: createForm.accounting_period,
      remark: createForm.remark,
      details: validDetails.map((d: any) => ({
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications,
        basic_unit: d.basic_unit,
        quantity: d.quantity,
        batch_number: d.batch_number || '',
        remark: d.remark || ''
      }))
    })
    if (res?.success) {
      message.success(res.message || '创建成功')
      createVisible.value = false
      fetchDisposals()
    } else {
      message.error(res?.message || '创建失败')
    }
  } catch {
    message.error('创建处置申请失败')
  } finally {
    createLoading.value = false
  }
}

// ==================== 处置单详情弹窗 ====================
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailHeader = ref<any>({})
const detailData = ref<any[]>([])

const detailViewColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 110 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
  { title: '处置数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 170 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150 }
]

const showDetail = async (record: any) => {
  detailLoading.value = true
  detailVisible.value = true
  resetDetailDrag()
  try {
    const res: any = await getScrapDisposalDetail(record.disposal_number)
    if (res?.success) {
      detailHeader.value = res.data.header || {}
      detailData.value = res.data.details || []
    }
  } catch {
    message.error('获取详情失败')
  } finally {
    detailLoading.value = false
  }
}

// ==================== 确认/驳回/删除 ====================
const handleConfirm = (record: any) => {
  Modal.confirm({
    title: '确认处置',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确认执行报废处置 ${record.disposal_number}？确认后将执行出库操作，扣减报废仓库存。`,
    okText: '确认出库',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await confirmScrapDisposal(record.disposal_number)
        if (res?.success) {
          message.success('处置确认成功，库存已更新')
          fetchDisposals()
        } else {
          message.error(res?.message || '确认失败')
        }
      } catch {
        message.error('确认处置失败')
      }
    }
  })
}

const handleReject = (record: any) => {
  Modal.confirm({
    title: '驳回处置',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确认驳回处置申请 ${record.disposal_number}？`,
    okText: '确认驳回',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await rejectScrapDisposal(record.disposal_number)
        if (res?.success) {
          message.success('已驳回')
          fetchDisposals()
        } else {
          message.error(res?.message || '驳回失败')
        }
      } catch {
        message.error('驳回失败')
      }
    }
  })
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '删除处置单',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确认删除处置单 ${record.disposal_number}？此操作不可恢复。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await deleteScrapDisposal(record.disposal_number)
        if (res?.success) {
          message.success('删除成功')
          fetchDisposals()
        } else {
          message.error(res?.message || '删除失败')
        }
      } catch {
        message.error('删除失败')
      }
    }
  })
}

// ==================== 生命周期 ====================
onMounted(() => {
  fetchOpenPeriods()
  loadFactories()
  fetchDisposals()
})
</script>

<template>
  <div class="scrap-disposal-page">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">报废仓处置</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-input v-model:value="searchText" placeholder="搜索单号/原因" allow-clear style="width: 200px" @pressEnter="handleSearch">
            <template #prefix><SearchOutlined /></template>
          </a-input>
          <a-select v-model:value="filterStatus" placeholder="状态筛选" allow-clear style="width: 120px" @change="handleSearch">
            <a-select-option value="待确认">待确认</a-select-option>
            <a-select-option value="已确认">已确认</a-select-option>
            <a-select-option value="已驳回">已驳回</a-select-option>
          </a-select>
          <a-select v-model:value="factoryFilter" placeholder="选择工厂" allow-clear style="width: 130px" @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
          <a-button @click="handleSearch"><SearchOutlined /> 查询</a-button>
          <a-button @click="handleReset"><ReloadOutlined /> 重置</a-button>
          <a-button type="primary" @click="showCreateModal"><PlusOutlined /> 新建处置</a-button>
        </div>
      </div>

      <a-table
        :columns="disposalColumns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1400 }"
        row-key="disposal_number"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
          </template>
          <template v-if="column.key === 'creation_date'">
            {{ formatDateTime(record.creation_date) }}
          </template>
          <template v-if="column.key === 'confirmed_date'">
            {{ formatDateTime(record.confirmed_date) }}
          </template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="showDetail(record)"><EyeOutlined /> 详情</a-button>
              <a-button v-if="record.status === '待确认'" type="link" size="small" style="color: #52c41a" @click="handleConfirm(record)"><CheckOutlined /> 确认</a-button>
              <a-button v-if="record.status === '待确认'" type="link" size="small" danger @click="handleReject(record)"><CloseOutlined /> 驳回</a-button>
              <a-button v-if="record.status === '待确认' || record.status === '已驳回'" type="link" size="small" danger @click="handleDelete(record)"><DeleteOutlined /></a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== 创建处置申请弹窗 ========== -->
    <a-modal
      v-model:open="createVisible"
      title="新建报废处置申请"
      width="900px"
      :style="disposalModalStyle"
      @ok="handleCreateSubmit"
      :confirm-loading="createLoading"
      ok-text="提交"
      cancel-text="取消"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onDisposalDragStart($event)">新建报废处置申请</div>
      </template>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="处置原因" required>
              <a-input v-model:value="createForm.disposal_reason" placeholder="请填写处置原因" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="会计期间">
              <a-select v-model:value="createForm.accounting_period" placeholder="请选择会计期间"
                :loading="openPeriodLoading">
                <a-select-option v-for="opt in openPeriodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
                <a-select-option v-if="noOpenPeriod" disabled value="">无已开启期间</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="备注">
              <a-input v-model:value="createForm.remark" placeholder="备注" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-divider orientation="left">处置明细</a-divider>
        <a-table
          :columns="createDetailColumns"
          :data-source="createForm.details"
          :pagination="false"
          row-key="_key"
          size="small"
          :scroll="{ x: 900 }"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'index'">{{ index + 1 }}</template>
            <template v-if="column.key === 'quantity'">
              <a-input-number v-model:value="record.quantity" :min="0" :max="99999" style="width: 100%" size="small" />
            </template>
            <template v-if="column.key === 'remark'">
              <a-input v-model:value="record.remark" placeholder="备注" size="small" />
            </template>
            <template v-if="column.key === 'detailAction'">
              <a-button type="link" danger size="small" @click="removeDetailLine(index)"><DeleteOutlined /></a-button>
            </template>
          </template>
        </a-table>
        <a-button type="dashed" block style="margin-top: 8px" @click="() => {
          createForm.details.push({
            _key: ++detailSeq,
            item_number: '',
            item_name: '',
            specifications: '',
            basic_unit: '',
            quantity: 0,
            batch_number: '',
            remark: ''
          })
        }">
          <PlusOutlined /> 添加明细行
        </a-button>
      </a-form>
    </a-modal>

    <!-- ========== 处置单详情弹窗 ========== -->
    <a-modal
      v-model:open="detailVisible"
      width="800px"
      :style="detailModalStyle"
      :footer="null"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onDetailDragStart($event)">处置单详情</div>
      </template>
      <a-spin :spinning="detailLoading">
        <a-descriptions :column="2" bordered size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="处置单号">{{ detailHeader.disposal_number }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="statusColor(detailHeader.status)">{{ detailHeader.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="仓库">{{ detailHeader.warehouse_name }}</a-descriptions-item>
          <a-descriptions-item label="会计期间">{{ detailHeader.accounting_period || '-' }}</a-descriptions-item>
          <a-descriptions-item label="处置原因">{{ detailHeader.disposal_reason }}</a-descriptions-item>
          <a-descriptions-item label="申请人">{{ detailHeader.operator }}</a-descriptions-item>
          <a-descriptions-item label="申请日期">{{ formatDateTime(detailHeader.creation_date) }}</a-descriptions-item>
          <a-descriptions-item label="确认人">{{ detailHeader.confirmed_by || '-' }}</a-descriptions-item>
          <a-descriptions-item label="确认日期">{{ formatDateTime(detailHeader.confirmed_date) }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="2">{{ detailHeader.remark || '-' }}</a-descriptions-item>
        </a-descriptions>
        <a-table
          :columns="detailViewColumns"
          :data-source="detailData"
          :pagination="false"
          row-key="line_number"
          size="small"
          :scroll="{ x: 900 }"
        />
      </a-spin>
    </a-modal>
  </div>
</template>

<style scoped>
.scrap-disposal-page {
  padding: 0;
}
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
