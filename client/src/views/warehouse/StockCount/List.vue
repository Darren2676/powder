<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined,
  SendOutlined, AuditOutlined, ExclamationCircleOutlined
} from '@ant-design/icons-vue'
import {
  getStockCountList, getStockCountDetail, getSnapshotPreview,
  createStockCount, updateStockCount, deleteStockCount,
  submitReview, reviewStockCount, confirmStockCount, cancelStockCount
} from '@/api/warehouse/stockCount'
import { getWarehouseOptions } from '@/api/warehouse/finishedGoods'
import { getItemOptions } from '@/api/warehouse/materialWarehouse'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

// ==================== 列表数据 ====================



const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getStockCountList)

const filterStatus = ref('')
const filterWarehouse = ref('')
const filterPeriod = ref('')
const warehouseOptions = ref<any[]>([])
const stats = ref<any>({})

const statusOptions = ['盘点中', '待复核', '待确认', '已完成', '已作废']



const columns = [
  { title: '盘点单号', dataIndex: 'count_number', key: 'count_number', width: 170 },
  { title: '盘点期间', dataIndex: 'count_period', key: 'count_period', width: 90 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '类型', dataIndex: 'count_type', key: 'count_type', width: 70 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 85 },
  { title: '批次数', dataIndex: 'total_batches', key: 'total_batches', width: 70, align: 'center' as const },
  { title: '相符', dataIndex: 'matched_batches', key: 'matched_batches', width: 60, align: 'center' as const },
  { title: '盘盈', dataIndex: 'surplus_batches', key: 'surplus_batches', width: 60, align: 'center' as const },
  { title: '盘亏', dataIndex: 'shortage_batches', key: 'shortage_batches', width: 60, align: 'center' as const },
  { title: '新建时间', dataIndex: 'created_time', key: 'created_time', width: 140 },
  { title: '完成时间', dataIndex: 'completed_time', key: 'completed_time', width: 140 },
  { title: '盘点人', dataIndex: 'count_man', key: 'count_man', width: 80 },
  { title: '复核人', dataIndex: 'reviewer', key: 'reviewer', width: 80 },
  { title: '确认人', dataIndex: 'confirmed_by', key: 'confirmed_by', width: 80 },
  { title: '操作', key: 'action', width: 240, fixed: 'right' as const }
]

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
const formatDateTime = (date: any) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'

// ==================== 创建盘点单 ====================
const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({
  warehouse_number: '',
  warehouse_name: '',
  count_period: '',
  count_type: '全盘',
  item_numbers: [] as string[],
  remark: ''
})
const previewData = ref<any>(null)
const previewLoading = ref(false)
const itemSearchText = ref('')
const itemOptions = ref<any[]>([])
const itemSearchLoading = ref(false)

const handleCreate = () => {
  createForm.warehouse_number = ''
  createForm.warehouse_name = ''
  createForm.count_period = dayjs().format('YYYY-MM')
  createForm.count_type = '全盘'
  createForm.item_numbers = []
  createForm.remark = ''
  previewData.value = null
  createVisible.value = true
}

const onWarehouseChange = (val: string) => {
  const found = warehouseOptions.value.find((w: any) => w.warehouse_number === val)
  createForm.warehouse_name = found?.warehouse_name || ''
  previewData.value = null
}

const handleItemSearch = async (keyword: string) => {
  if (!keyword || keyword.length < 1) return
  itemSearchLoading.value = true
  try {
    const res: any = await getItemOptions({ keyword, item_type: 'product' })
    itemOptions.value = res?.data || res || []
  } catch (e) {} finally { itemSearchLoading.value = false }
}

const handlePreview = async () => {
  if (!createForm.warehouse_number) { message.warning('请先选择仓库'); return }
  previewLoading.value = true
  try {
    const params: any = { warehouse_number: createForm.warehouse_number, count_type: createForm.count_type }
    if (createForm.count_type === '抽盘' && createForm.item_numbers.length > 0) {
      params.item_numbers = createForm.item_numbers.join(',')
    }
    const res: any = await getSnapshotPreview(params)
    if (res?.success) {
      previewData.value = res.data
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '预览失败')
  } finally { previewLoading.value = false }
}

const handleCreateSubmit = async () => {
  if (!createForm.warehouse_number) { message.warning('请选择仓库'); return }
  if (!createForm.count_period) { message.warning('请选择盘点期间'); return }
  createLoading.value = true
  try {
    const data: any = {
      warehouse_number: createForm.warehouse_number,
      warehouse_name: createForm.warehouse_name,
      count_period: createForm.count_period,
      count_type: createForm.count_type,
      remark: createForm.remark
    }
    if (createForm.count_type === '抽盘' && createForm.item_numbers.length > 0) {
      data.item_numbers = createForm.item_numbers
    }
    const res: any = await createStockCount(data)
    if (res?.success) {
      message.success(`盘点单 ${res.data?.count_number} 创建成功`)
      createVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '创建失败')
  } finally { createLoading.value = false }
}

// ==================== 编辑/查看 ====================
const editVisible = ref(false)
const editLoading = ref(false)
const editSaving = ref(false)
const editHeader = ref<any>({})
const editDetails = ref<any[]>([])
const isViewMode = ref(false)

const detailColumns = computed(() => {
  const cols = [
    { title: '#', dataIndex: 'line_number', key: 'line_number', width: 50, align: 'center' as const },
    { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
    { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 130, ellipsis: true },
    { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100, ellipsis: true },
    { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 150 },
    { title: '质量状态', dataIndex: 'quality_status', key: 'quality_status', width: 80, align: 'center' as const },
    { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 130 },
    { title: '入库日期', dataIndex: 'inbound_date', key: 'inbound_date', width: 100 },
    { title: '系统数量', dataIndex: 'system_quantity', key: 'system_quantity', width: 90, align: 'right' as const },
    { title: '实盘数量', key: 'actual_quantity', width: 110, align: 'right' as const },
    { title: '差异', key: 'difference', width: 90, align: 'right' as const },
    { title: '状态', dataIndex: 'count_status', key: 'count_status', width: 60, align: 'center' as const },
    { title: '备注', key: 'remark', width: 120 }
  ]
  return cols
})

const editSummary = computed(() => {
  const total = editDetails.value.length
  const counted = editDetails.value.filter(d => d.actual_quantity !== null && d.actual_quantity !== undefined).length
  const surplus = editDetails.value.filter(d => Number(d.difference_quantity) > 0).length
  const shortage = editDetails.value.filter(d => Number(d.difference_quantity) < 0).length
  const matched = editDetails.value.filter(d => d.actual_quantity !== null && Number(d.difference_quantity) === 0).length
  const surplusQty = editDetails.value.reduce((s, d) => s + (Number(d.difference_quantity) > 0 ? Number(d.difference_quantity) : 0), 0)
  const shortageQty = editDetails.value.reduce((s, d) => s + (Number(d.difference_quantity) < 0 ? Math.abs(Number(d.difference_quantity)) : 0), 0)
  return { total, counted, uncounted: total - counted, surplus, shortage, matched, surplusQty, shortageQty }
})

const openEdit = async (record: any) => {
  isViewMode.value = false
  editLoading.value = true
  editVisible.value = true
  try {
    const res: any = await getStockCountDetail(record.count_number)
    if (res?.success) {
      editHeader.value = res.data?.header || {}
      editDetails.value = (res.data?.details || []).map((d: any) => ({ ...d }))
    }
  } catch (err: any) {
    message.error('加载详情失败')
  } finally { editLoading.value = false }
}

const openView = async (record: any) => {
  isViewMode.value = true
  editLoading.value = true
  editVisible.value = true
  try {
    const res: any = await getStockCountDetail(record.count_number)
    if (res?.success) {
      editHeader.value = res.data?.header || {}
      editDetails.value = res.data?.details || []
    }
  } catch (err: any) {
    message.error('加载详情失败')
  } finally { editLoading.value = false }
}

const onActualQtyChange = (record: any) => {
  if (record.actual_quantity !== null && record.actual_quantity !== undefined) {
    record.difference_quantity = Number(record.actual_quantity) - Number(record.system_quantity)
    if (record.difference_quantity > 0) record.count_status = '盈'
    else if (record.difference_quantity < 0) record.count_status = '亏'
    else record.count_status = '平'
  } else {
    record.difference_quantity = 0
    record.count_status = '未盘'
  }
}

const handleSaveDetails = async () => {
  editSaving.value = true
  try {
    const details = editDetails.value.map(d => ({
      id: d.id,
      actual_quantity: d.actual_quantity,
      system_quantity: d.system_quantity,
      remark: d.remark || ''
    }))
    const res: any = await updateStockCount(editHeader.value.count_number, { details })
    if (res?.success) {
      message.success('保存成功')
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '保存失败')
  } finally { editSaving.value = false }
}

// ==================== 提交复核 ====================
const handleSubmitReview = (record: any) => {
  Modal.confirm({
    title: '提交复核',
    content: `确认将盘点单 ${record.count_number} 提交复核？提交后不可修改。`,
    onOk: async () => {
      try {
        const res: any = await submitReview(record.count_number)
        if (res?.success) {
          message.success('已提交复核')
          fetchData()
          if (editVisible.value) { editVisible.value = false }
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '提交失败')
      }
    }
  })
}

// ==================== 复核 ====================
const reviewVisible = ref(false)
const reviewLoading = ref(false)
const reviewTarget = ref('')
const reviewRemark = ref('')
const reviewSummary = ref<any>({})

const showReviewModal = async (record: any) => {
  reviewTarget.value = record.count_number
  reviewRemark.value = ''
  reviewSummary.value = {
    total_batches: record.total_batches,
    matched_batches: record.matched_batches,
    surplus_batches: record.surplus_batches,
    shortage_batches: record.shortage_batches,
    total_surplus_qty: record.total_surplus_qty,
    total_shortage_qty: record.total_shortage_qty
  }
  reviewVisible.value = true
}

const handleReview = async (action: 'approve' | 'reject') => {
  reviewLoading.value = true
  try {
    const res: any = await reviewStockCount(reviewTarget.value, { action, review_remark: reviewRemark.value })
    if (res?.success) {
      message.success(action === 'approve' ? '复核通过' : '已驳回退回修改')
      reviewVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '操作失败')
  } finally { reviewLoading.value = false }
}

// ==================== 确认执行 ====================
const confirmVisible = ref(false)
const confirmLoading = ref(false)
const confirmTarget = ref('')
const confirmRemark = ref('')
const confirmSummary = ref<any>({})

const showConfirmModal = async (record: any) => {
  confirmTarget.value = record.count_number
  confirmRemark.value = ''
  confirmSummary.value = {
    total_batches: record.total_batches,
    matched_batches: record.matched_batches,
    surplus_batches: record.surplus_batches,
    shortage_batches: record.shortage_batches,
    total_surplus_qty: record.total_surplus_qty,
    total_shortage_qty: record.total_shortage_qty
  }
  confirmVisible.value = true
}

const handleConfirm = async () => {
  confirmLoading.value = true
  try {
    const res: any = await confirmStockCount(confirmTarget.value, { confirm_remark: confirmRemark.value })
    if (res?.success) {
      message.success('盘点确认完成，库存已调整')
      confirmVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '确认失败')
  } finally { confirmLoading.value = false }
}

const handleCancel = async (record: any) => {
  Modal.confirm({
    title: '作废盘点单',
    content: `确定要作废盘点单 ${record.count_number} 吗？作废后不可恢复。`,
    okType: 'danger',
    onOk: async () => {
      try {
        const res: any = await cancelStockCount(record.count_number, { confirm_remark: '作废' })
        if (res?.success) {
          message.success('盘点单已作废')
          fetchData()
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '作废失败')
      }
    }
  })
}

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '删除盘点单',
    content: `确定要删除盘点单 ${record.count_number} 吗？`,
    okType: 'danger',
    onOk: async () => {
      try {
        const res: any = await deleteStockCount(record.count_number)
        if (res?.success) {
          message.success('已删除')
          fetchData()
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '删除失败')
      }
    }
  })
}

onMounted(() => {
  fetchWarehouseOptions()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <!-- 工具栏 -->
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索盘点单号/仓库/盘点人"
          style="width: 240px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select v-model:value="filterWarehouse" placeholder="仓库" allow-clear style="width: 140px" @change="handleSearch">
          <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">
            {{ w.warehouse_name }}
          </a-select-option>
        </a-select>
        <a-select v-model:value="filterStatus" placeholder="状态" allow-clear style="width: 110px" @change="handleSearch">
          <a-select-option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</a-select-option>
        </a-select>
        <a-month-picker v-model:value="filterPeriod" placeholder="盘点期间" style="width: 130px" format="YYYY-MM"
          :valueFormat="'YYYY-MM'" @change="handleSearch" allow-clear />
        <a-button @click="handleReset"><ReloadOutlined /> 重置</a-button>
      </div>
      <div>
        <a-button type="primary" @click="handleCreate"><PlusOutlined /> 新建盘点</a-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div style="display: flex; gap: 12px; margin-bottom: 16px">
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="盘点中" :value="stats.counting || 0" :value-style="{ color: '#1890ff' }" />
      </a-card>
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="待复核" :value="stats.pending_review || 0" :value-style="{ color: '#faad14' }" />
      </a-card>
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="待确认" :value="stats.pending_confirm || 0" :value-style="{ color: '#fa8c16' }" />
      </a-card>
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="本月已完成" :value="stats.completed_this_month || 0" :value-style="{ color: '#52c41a' }" />
      </a-card>
    </div>

    <!-- 列表 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 1500 }"
      size="small"
      bordered
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'surplus_batches'">
          <span :style="{ color: record.surplus_batches > 0 ? '#52c41a' : '' }">{{ record.surplus_batches }}</span>
        </template>
        <template v-else-if="column.key === 'shortage_batches'">
          <span :style="{ color: record.shortage_batches > 0 ? '#f5222d' : '' }">{{ record.shortage_batches }}</span>
        </template>
        <template v-else-if="column.key === 'created_time'">
          {{ formatDateTime(record.created_time) }}
        </template>
        <template v-else-if="column.key === 'completed_time'">
          {{ formatDateTime(record.completed_time) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <!-- 盘点中 -->
          <template v-if="record.status === '盘点中'">
            <a-button type="link" size="small" @click="openEdit(record)"><EditOutlined /> 编辑</a-button>
            <a-button type="link" size="small" @click="handleSubmitReview(record)"><SendOutlined /> 提交复核</a-button>
            <a-button type="link" size="small" danger @click="handleDelete(record)"><DeleteOutlined /> 删除</a-button>
          </template>
          <!-- 待复核 -->
          <template v-else-if="record.status === '待复核'">
            <a-button type="link" size="small" @click="openView(record)"><EyeOutlined /> 查看</a-button>
            <a-button type="link" size="small" @click="showReviewModal(record)"><AuditOutlined /> 复核</a-button>
          </template>
          <!-- 待确认 -->
          <template v-else-if="record.status === '待确认'">
            <a-button type="link" size="small" @click="openView(record)"><EyeOutlined /> 查看</a-button>
            <a-button type="link" size="small" @click="showConfirmModal(record)"><CheckOutlined /> 确认执行</a-button>
            <a-button type="link" size="small" danger @click="handleCancel(record)"><CloseOutlined /> 作废</a-button>
          </template>
          <!-- 已完成/已作废 -->
          <template v-else>
            <a-button type="link" size="small" @click="openView(record)"><EyeOutlined /> 查看</a-button>
          </template>
        </template>
      </template>
    </a-table>

    <!-- 创建盘点单弹窗 -->
    <a-modal v-model:open="createVisible" title="新建盘点单" :width="700" :confirmLoading="createLoading" @ok="handleCreateSubmit">
      <a-form layout="vertical" style="margin-top: 16px">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="盘点期间" required>
              <a-month-picker v-model:value="createForm.count_period" style="width: 100%" format="YYYY-MM" :valueFormat="'YYYY-MM'" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="仓库" required>
              <a-select v-model:value="createForm.warehouse_number" placeholder="选择仓库" @change="onWarehouseChange" show-search
                :filter-option="(input: string, option: any) => option.children?.[0]?.children?.toLowerCase?.()?.includes?.(input?.toLowerCase?.())">
                <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">
                  {{ w.warehouse_name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="盘点类型">
              <a-radio-group v-model:value="createForm.count_type" @change="previewData = null">
                <a-radio value="全盘">全盘</a-radio>
                <a-radio value="抽盘">抽盘</a-radio>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="备注">
              <a-input v-model:value="createForm.remark" placeholder="备注说明" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item v-if="createForm.count_type === '抽盘'" label="选择物料（可多选）">
          <a-select v-model:value="createForm.item_numbers" mode="multiple" placeholder="输入物料编号或名称搜索"
            :filter-option="false" @search="handleItemSearch" :loading="itemSearchLoading" show-search allow-clear>
            <a-select-option v-for="item in itemOptions" :key="item.item_number" :value="item.item_number">
              {{ item.item_number }} - {{ item.item_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <div style="margin-bottom: 12px">
          <a-button @click="handlePreview" :loading="previewLoading">预览盘点范围</a-button>
          <span v-if="previewData" style="margin-left: 12px; color: #666">
            共 <b>{{ previewData.total_items }}</b> 种物料，<b>{{ previewData.total_batches }}</b> 个批次
          </span>
        </div>
      </a-form>
    </a-modal>

    <!-- 编辑/查看明细弹窗 -->
    <a-modal v-model:open="editVisible" :title="isViewMode ? '盘点单详情' : '录入盘点数量'" :width="1200"
      :footer="isViewMode ? null : undefined" @ok="handleSaveDetails" :confirmLoading="editSaving"
      :okText="'保存'" :cancelText="'关闭'">
      <!-- 单头信息 -->
      <div style="margin-bottom: 16px; background: #fafafa; padding: 12px; border-radius: 4px">
        <a-row :gutter="16">
          <a-col :span="6"><b>盘点单号:</b> {{ editHeader.count_number }}</a-col>
          <a-col :span="4"><b>期间:</b> {{ editHeader.count_period }}</a-col>
          <a-col :span="5"><b>仓库:</b> {{ editHeader.warehouse_name }}</a-col>
          <a-col :span="3"><b>类型:</b> {{ editHeader.count_type }}</a-col>
          <a-col :span="3"><b>状态:</b> <a-tag :color="statusColor(editHeader.status)">{{ editHeader.status }}</a-tag></a-col>
          <a-col :span="3"><b>盘点人:</b> {{ editHeader.count_man }}</a-col>
        </a-row>
      </div>

      <!-- 汇总统计 -->
      <div style="margin-bottom: 12px; display: flex; gap: 16px; font-size: 13px">
        <span>总计: <b>{{ editSummary.total }}</b></span>
        <span>已盘: <b style="color: #1890ff">{{ editSummary.counted }}</b></span>
        <span>未盘: <b style="color: #999">{{ editSummary.uncounted }}</b></span>
        <span>相符: <b>{{ editSummary.matched }}</b></span>
        <span style="color: #52c41a">盘盈: <b>{{ editSummary.surplus }}</b> ({{ editSummary.surplusQty.toFixed(2) }})</span>
        <span style="color: #f5222d">盘亏: <b>{{ editSummary.shortage }}</b> ({{ editSummary.shortageQty.toFixed(2) }})</span>
      </div>

      <!-- 明细表格 -->
      <a-table :columns="detailColumns" :data-source="editDetails" :loading="editLoading"
        :pagination="false" row-key="id" :scroll="{ y: 400 }" size="small" bordered>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'quality_status'">
            <a-tag :color="record.quality_status === '合格品' ? 'green' : 'red'" size="small">
              {{ record.quality_status || '合格品' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'inbound_date'">
            {{ formatDate(record.inbound_date) }}
          </template>
          <template v-else-if="column.key === 'actual_quantity'">
            <a-input-number v-if="!isViewMode && editHeader.status === '盘点中'"
              v-model:value="record.actual_quantity" :min="0" :precision="2" size="small"
              style="width: 90px" @change="onActualQtyChange(record)" />
            <span v-else>{{ record.actual_quantity !== null ? Number(record.actual_quantity).toFixed(2) : '-' }}</span>
          </template>
          <template v-else-if="column.key === 'difference'">
            <span :style="{ color: Number(record.difference_quantity) > 0 ? '#52c41a' : Number(record.difference_quantity) < 0 ? '#f5222d' : '#999', fontWeight: Number(record.difference_quantity) !== 0 ? 'bold' : 'normal' }">
              {{ record.actual_quantity !== null ? Number(record.difference_quantity).toFixed(2) : '-' }}
            </span>
          </template>
          <template v-else-if="column.key === 'count_status'">
            <a-tag :color="record.count_status === '盈' ? 'green' : record.count_status === '亏' ? 'red' : record.count_status === '平' ? 'blue' : 'default'" size="small">
              {{ record.count_status }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'remark'">
            <a-input v-if="!isViewMode && editHeader.status === '盘点中'"
              v-model:value="record.remark" size="small" placeholder="备注" />
            <span v-else>{{ record.remark || '-' }}</span>
          </template>
        </template>
      </a-table>

      <!-- 底部操作（编辑模式） -->
      <template v-if="!isViewMode && editHeader.status === '盘点中'" #footer>
        <div style="display: flex; justify-content: space-between">
          <a-button @click="handleSubmitReview(editHeader)" :disabled="editSummary.uncounted > 0">
            <SendOutlined /> 保存并提交复核
          </a-button>
          <div>
            <a-button @click="editVisible = false" style="margin-right: 8px">关闭</a-button>
            <a-button type="primary" @click="handleSaveDetails" :loading="editSaving">保存</a-button>
          </div>
        </div>
      </template>

      <!-- 查看模式：操作时间线 -->
      <div v-if="isViewMode" style="margin-top: 16px; border-top: 1px solid #f0f0f0; padding-top: 12px">
        <a-timeline>
          <a-timeline-item color="blue">
            创建: {{ editHeader.count_man }} ({{ formatDate(editHeader.count_date) }})
          </a-timeline-item>
          <a-timeline-item v-if="editHeader.reviewer" :color="editHeader.status === '盘点中' ? 'red' : 'green'">
            复核: {{ editHeader.reviewer }} ({{ formatDate(editHeader.review_date) }})
            <span v-if="editHeader.review_remark"> - {{ editHeader.review_remark }}</span>
          </a-timeline-item>
          <a-timeline-item v-if="editHeader.confirmed_by" :color="editHeader.status === '已作废' ? 'red' : 'green'">
            {{ editHeader.status === '已作废' ? '作废' : '确认' }}: {{ editHeader.confirmed_by }} ({{ formatDate(editHeader.confirmed_date) }})
            <span v-if="editHeader.confirm_remark"> - {{ editHeader.confirm_remark }}</span>
          </a-timeline-item>
        </a-timeline>
      </div>
    </a-modal>

    <!-- 复核弹窗 -->
    <a-modal v-model:open="reviewVisible" title="复核盘点单" :width="480" :footer="null">
      <div style="margin-bottom: 16px">
        <p><b>盘点单号:</b> {{ reviewTarget }}</p>
        <div style="display: flex; gap: 16px; margin: 12px 0">
          <span>总批次: <b>{{ reviewSummary.total_batches }}</b></span>
          <span>相符: <b>{{ reviewSummary.matched_batches }}</b></span>
          <span style="color: #52c41a">盘盈: <b>{{ reviewSummary.surplus_batches }}</b> ({{ Number(reviewSummary.total_surplus_qty || 0).toFixed(2) }})</span>
          <span style="color: #f5222d">盘亏: <b>{{ reviewSummary.shortage_batches }}</b> ({{ Number(reviewSummary.total_shortage_qty || 0).toFixed(2) }})</span>
        </div>
      </div>
      <a-form-item label="复核备注">
        <a-textarea v-model:value="reviewRemark" :rows="3" placeholder="输入复核意见" />
      </a-form-item>
      <div style="text-align: right; margin-top: 16px">
        <a-button @click="handleReview('reject')" :loading="reviewLoading" danger style="margin-right: 8px">
          <CloseOutlined /> 驳回退回
        </a-button>
        <a-button type="primary" @click="handleReview('approve')" :loading="reviewLoading">
          <CheckOutlined /> 复核通过
        </a-button>
      </div>
    </a-modal>

    <!-- 确认执行弹窗 -->
    <a-modal v-model:open="confirmVisible" title="确认执行盘点" :width="480" :footer="null">
      <a-alert message="确认后将执行库存调整，操作不可撤销！" type="warning" show-icon style="margin-bottom: 16px" />
      <div style="margin-bottom: 16px">
        <p><b>盘点单号:</b> {{ confirmTarget }}</p>
        <div style="display: flex; gap: 16px; margin: 12px 0">
          <span>总批次: <b>{{ confirmSummary.total_batches }}</b></span>
          <span>相符: <b>{{ confirmSummary.matched_batches }}</b></span>
          <span style="color: #52c41a">盘盈: <b>{{ confirmSummary.surplus_batches }}</b> ({{ Number(confirmSummary.total_surplus_qty || 0).toFixed(2) }})</span>
          <span style="color: #f5222d">盘亏: <b>{{ confirmSummary.shortage_batches }}</b> ({{ Number(confirmSummary.total_shortage_qty || 0).toFixed(2) }})</span>
        </div>
      </div>
      <a-form-item label="确认备注">
        <a-textarea v-model:value="confirmRemark" :rows="3" placeholder="输入确认备注" />
      </a-form-item>
      <div style="text-align: right; margin-top: 16px">
        <a-button @click="confirmVisible = false" style="margin-right: 8px">取消</a-button>
        <a-button type="primary" @click="handleConfirm" :loading="confirmLoading" danger>
          <CheckOutlined /> 确认执行库存调整
        </a-button>
      </div>
    </a-modal>
  </div>
</template>
