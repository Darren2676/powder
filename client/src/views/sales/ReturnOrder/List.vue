<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined, SettingOutlined, DownOutlined, HistoryOutlined,
  StopOutlined
} from '@ant-design/icons-vue'
import {
  getReturnOrders, getReturnOrderDetail, getShippingOrderForReturn,
  createReturnOrder, updateReturnOrder, deleteReturnOrder,
  cancelReturnOrder
} from '@/api/sales/returnOrder'
import { reverseApproval } from '@/api/system/approval'
import { startWorkflow, withdrawWorkflow, getInstanceByRecord } from '@/api/system/workflow'
import { getWarehouseOptions } from '@/api/warehouse/finishedGoods'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'

// ==================== 列表 ====================



const filterType = ref('')
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getReturnOrders)

const filterStatus = ref('')
const filterApprovalStatus = ref('')



const defaultDataColumns: any[] = [
  { title: '退货类型', dataIndex: 'type', key: 'type', width: 100, resizable: true },
  { title: '发货单号', dataIndex: 'shipping_order_number', key: 'shipping_order_number', width: 170, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160, resizable: true },
  { title: '退货仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 90, resizable: true },
  { title: '退货原因', dataIndex: 'reason', key: 'reason', width: 160, ellipsis: true, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100, resizable: true },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 170, resizable: true },
  { title: '确认人', dataIndex: 'confirmed_by', key: 'confirmed_by', width: 100, resizable: true },
  { title: '入库状态', dataIndex: 'inbound_status', key: 'inbound_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('return_order_list', defaultDataColumns, {
  fixedLeft: [{ title: '退货单号', dataIndex: 'return_order_number', key: 'return_order_number', width: 170, fixed: 'left' as const, resizable: true }, { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

const typeColors: Record<string, string> = { '退款退货': 'orange', '退货换货': 'blue' }
const statusColors: Record<string, string> = { '待确认': 'processing', '已确认': 'success', '已驳回': 'default', '已取消': 'error' }

const formatDateTime = (date: any) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'

// ==================== 仓库选项 ====================
const warehouseOptions = ref<any[]>([])
const loadWarehouseOptions = async () => {
  try {
    const res: any = await getWarehouseOptions()
    if (res?.success) warehouseOptions.value = res.data || []
  } catch { /* ignore */ }
}

// ==================== 新建/编辑弹窗 ====================
const formVisible = ref(false)
const formLoading = ref(false)
const isEditing = ref(false)
const formData = reactive({
  return_order_number: '',
  type: '退款退货' as string,
  shipping_order_number: '',
  customer_number: '',
  customer_name: '',
  warehouse_number: '',
  warehouse_name: '',
  reason: '',
  remark: '',
  details: [] as any[]
})

// 发货单搜索
const shippingSearchText = ref('')
const shippingLoading = ref(false)
const shippingData = ref<any>(null)

const handleLoadShippingOrder = async () => {
  const sn = shippingSearchText.value.trim()
  if (!sn) { message.warning('请输入发货单号'); return }
  shippingLoading.value = true
  shippingData.value = null
  formData.details = []
  try {
    const res: any = await getShippingOrderForReturn(sn)
    if (res?.success) {
      shippingData.value = res.data
      formData.shipping_order_number = sn
      // 从发货单回填客户信息
      const header = res.data.header || {}
      formData.customer_number = header.customer_number || ''
      formData.customer_name = header.customer_name || ''
      // 自动构建明细行
      const details = res.data.details || []
      formData.details = details.map((d: any) => ({
        shipping_order_detail_id: d.id,
        sales_order_number: d.sales_order_number || '',
        sales_detail_id: d.sales_detail_id || 0,
        item_number: d.item_number,
        item_name: d.item_name || '',
        specifications: d.specifications || '',
        basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        shipped_quantity: d.quantity || 0,
        return_quantity: 0,
        checked: false,
        batches: (d.batches || []).map((b: any) => ({
          batch_number: b.batch_number,
          shipped_quantity: b.quantity || 0,
          returnable_quantity: b.returnable_quantity || 0,
          returned_quantity: b.returned_quantity || 0,
          quantity: 0
        }))
      }))
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '获取发货单信息失败')
  } finally {
    shippingLoading.value = false
  }
}

const handleWarehouseChange = (value: string) => {
  const w = warehouseOptions.value.find((o: any) => o.warehouse_number === value)
  formData.warehouse_number = value
  formData.warehouse_name = w?.warehouse_name || ''
}

// 当批次数量变化时，自动汇总到明细的退货数量
const updateDetailReturnQty = (detailIndex: number) => {
  const detail = formData.details[detailIndex]
  detail.return_quantity = detail.batches.reduce((sum: number, b: any) => sum + (Number(b.quantity) || 0), 0)
}

const handleOpenCreate = () => {
  isEditing.value = false
  formData.return_order_number = ''
  formData.type = '退款退货'
  formData.shipping_order_number = ''
  formData.customer_number = ''
  formData.customer_name = ''
  formData.warehouse_number = ''
  formData.warehouse_name = ''
  formData.reason = ''
  formData.remark = ''
  formData.details = []
  shippingSearchText.value = ''
  shippingData.value = null
  formResetDrag()
  formVisible.value = true
}

const handleOpenEdit = async (record: any) => {
  isEditing.value = true
  formData.return_order_number = record.return_order_number
  formData.type = record.type
  formData.shipping_order_number = record.shipping_order_number
  formData.warehouse_number = record.warehouse_number
  formData.warehouse_name = record.warehouse_name
  formData.reason = record.reason || ''
  formData.remark = record.remark || ''

  // 加载发货单并填充现有退货明细
  shippingSearchText.value = record.shipping_order_number
  shippingLoading.value = true
  formResetDrag()
  formVisible.value = true
  try {
    // 加载发货单信息（获取可退数量）
    const soRes: any = await getShippingOrderForReturn(record.shipping_order_number)
    // 加载退货单详情（获取已填退货数量）
    const roRes: any = await getReturnOrderDetail(record.return_order_number)
    if (soRes?.success && roRes?.success) {
      shippingData.value = soRes.data
      const soDetails = soRes.data.details || []
      const roDetails = roRes.data.details || []

      formData.details = soDetails.map((d: any) => {
        const roDetail = roDetails.find((rd: any) => rd.shipping_order_detail_id === d.id)
        return {
          shipping_order_detail_id: d.id,
          sales_order_number: d.sales_order_number || '',
          sales_detail_id: d.sales_detail_id || 0,
          item_number: d.item_number,
          item_name: d.item_name || '',
          specifications: d.specifications || '',
          basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          shipped_quantity: d.quantity || 0,
          return_quantity: roDetail ? Number(roDetail.return_quantity) || 0 : 0,
          checked: !!roDetail,
          batches: (d.batches || []).map((b: any) => {
            const roBatch = roDetail?.batches?.find((rb: any) => rb.batch_number === b.batch_number)
            // 编辑时，可退数量需加回当前退货单本身的退货数量
            const currentReturnQty = roBatch ? Number(roBatch.quantity) || 0 : 0
            return {
              batch_number: b.batch_number,
              shipped_quantity: b.quantity || 0,
              returnable_quantity: (b.returnable_quantity || 0) + currentReturnQty,
              returned_quantity: Math.max(0, (b.returned_quantity || 0) - currentReturnQty),
              quantity: currentReturnQty
            }
          })
        }
      })
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '加载退货单数据失败')
  } finally {
    shippingLoading.value = false
  }
}

const handleFormSubmit = async () => {
  if (!formData.shipping_order_number) { message.warning('请选择发货单'); return }
  if (!formData.warehouse_number) { message.warning('请选择退货入库仓库'); return }

  const checkedDetails = formData.details.filter((d: any) => d.return_quantity > 0)
  if (checkedDetails.length === 0) { message.warning('请至少填写一条退货明细的退货数量'); return }

  // 校验退货数量不超过可退数量
  for (const d of checkedDetails) {
    for (const b of d.batches) {
      if (Number(b.quantity) > Number(b.returnable_quantity)) {
        message.error(`批次 ${b.batch_number} 退货数量超过可退数量`)
        return
      }
    }
  }

  const submitData = {
    ...formData,
    details: checkedDetails.map((d: any) => ({
      ...d,
      batches: d.batches.filter((b: any) => Number(b.quantity) > 0)
    }))
  }

  formLoading.value = true
  try {
    let res: any
    if (isEditing.value) {
      res = await updateReturnOrder(formData.return_order_number, submitData)
    } else {
      res = await createReturnOrder(submitData)
    }
    if (res?.success) {
      message.success(isEditing.value ? '退货单更新成功' : `退货单创建成功: ${res.data?.return_order_number || ''}`)
      formVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '操作失败')
  } finally {
    formLoading.value = false
  }
}

// ==================== 详情弹窗 ====================
const detailVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const { modalStyle: formModalStyle, onDragStart: formDragStart, resetDrag: formResetDrag } = useModalDrag()
const detailLoading = ref(false)
const detailHeader = ref<any>({})
const detailItems = ref<any[]>([])

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', width: 60 },
  { title: '产品编号', dataIndex: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', width: 70, resizable: true },
  { title: '原发货数量', dataIndex: 'shipped_quantity', width: 110, resizable: true },
  { title: '退货数量', dataIndex: 'return_quantity', width: 100, resizable: true },
  { title: '销售订单号', dataIndex: 'sales_order_number', width: 150, resizable: true }
]

const detailBatchColumns = [
  { title: '原发货批次号', dataIndex: 'batch_number', width: 170 },
  { title: '退货数量', dataIndex: 'quantity', width: 100 }
]

const handleViewDetail = async (record: any) => {
  detailResetDrag()
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res: any = await getReturnOrderDetail(record.return_order_number)
    if (res?.success) {
      detailHeader.value = res.data.header
      detailItems.value = res.data.details || []
    }
  } catch {
    message.error('获取退货单详情失败')
  } finally {
    detailLoading.value = false
  }
}

// ==================== 提交审核 ====================
const handleSubmit = (record: any) => {
  Modal.confirm({
    title: '提交审核',
    content: `确定要提交退货单 ${record.return_order_number} 审核吗？提交后将不可编辑。`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      try {
        await startWorkflow('return_order', record.return_order_number)
        message.success('提交审核成功')
        fetchData()
      } catch { message.error('提交审核失败') }
    }
  })
}

// ==================== 撤回提交 ====================
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '撤回提交',
    content: `确定要撤回退货单 ${record.return_order_number} 的审核提交吗？`,
    okText: '撤回',
    cancelText: '取消',
    onOk: async () => {
      try {
        const instRes: any = await getInstanceByRecord('return_order', record.return_order_number)
        if (instRes?.success && instRes.data?.id) {
          await withdrawWorkflow(instRes.data.id)
          message.success('撤回成功')
          fetchData()
        } else {
          message.error('未找到审批流程实例')
        }
      } catch { message.error('撤回失败') }
    }
  })
}

// ==================== 反审退回 ====================
const handleReverse = (record: any) => {
  Modal.confirm({
    title: '反审退回',
    content: `确定要对退货单 ${record.return_order_number} 执行反审吗？记录将退回草稿状态。`,
    okText: '确认反审',
    okType: 'danger' as any,
    cancelText: '取消',
    onOk: async () => {
      try {
        await reverseApproval('return_order', record.return_order_number)
        message.success('反审成功，已退回草稿')
        fetchData()
      } catch { message.error('反审失败') }
    }
  })
}

// ==================== 审批历史 ====================
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')
const handleShowApprovalLog = (record: any) => {
  approvalLogRecordId.value = record.return_order_number
  approvalLogVisible.value = true
}

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '删除确认',
    content: `确认删除退货单 ${record.return_order_number}？`,
    okText: '删除',
    okType: 'danger' as any,
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await deleteReturnOrder(record.return_order_number)
        if (res?.success) {
          message.success('退货单已删除')
          fetchData()
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '删除失败')
      }
    }
  })
}

// ==================== 撤消退货单 ====================
const handleCancelReturn = (record: any) => {
  const inboundWarning = record.inbound_status === '已入库'
    ? '\n\n⚠ 此退货单已入库，撤消后将自动回冲库存并作废入库流水。'
    : ''
  Modal.confirm({
    title: '撤消确认',
    content: `确认撤消退货单「${record.return_order_number}」？${inboundWarning}`,
    okText: '确认撤消',
    okType: 'danger' as any,
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await cancelReturnOrder(record.return_order_number)
        if (res?.success) {
          message.success('退货单已撤消')
          fetchData()
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '撤消失败')
      }
    }
  })
}

// 总退货数量
const totalReturnQty = computed(() => {
  return formData.details.reduce((sum: number, d: any) => sum + (Number(d.return_quantity) || 0), 0)
})

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
  loadWarehouseOptions()
})
</script>

<template>
  <div style="padding: 20px">
    <!-- 工具栏 -->
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center">
        <span style="font-size: 18px; font-weight: 600; color: #1a1a2e; margin-right: 4px; white-space: nowrap">退货单</span>
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索退货单号/发货单号/客户名称"
          style="width: 320px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select v-model:value="filterType" placeholder="全部类型" style="width: 120px" allow-clear @change="handleSearch">
          <a-select-option value="退款退货">退款退货</a-select-option>
          <a-select-option value="退货换货">退货换货</a-select-option>
        </a-select>
        <a-select v-model:value="filterStatus" placeholder="全部状态" style="width: 120px" allow-clear @change="handleSearch">
          <a-select-option value="待确认">待确认</a-select-option>
          <a-select-option value="已确认">已确认</a-select-option>
          <a-select-option value="已驳回">已驳回</a-select-option>
          <a-select-option value="已取消">已取消</a-select-option>
        </a-select>
        <a-select v-model:value="filterApprovalStatus" placeholder="审批状态" style="width: 120px" allow-clear @change="handleSearch">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="审批中">审批中</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
      <a-button type="primary" @click="handleOpenCreate"><PlusOutlined /> 新建退货单</a-button>
    </div>

    <!-- 列表 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 1800 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          <a-tag :color="typeColors[record.type] || 'default'">{{ record.type }}</a-tag>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-badge :status="statusColors[record.status] || 'default'" :text="record.status" />
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'creation_date'">
          {{ formatDateTime(record.creation_date) }}
        </template>
        <template v-else-if="column.key === 'inbound_status'">
          <a-tag :color="record.inbound_status === '已入库' ? 'green' : record.inbound_status === '待入库' ? 'orange' : 'default'">
            {{ record.inbound_status || '-' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleViewDetail(record)">
              <EyeOutlined /> 详情
            </a-button>
            <a-dropdown :trigger="['click']">
              <a @click.stop>更多 <DownOutlined style="font-size: 10px; margin-left: 2px;" /></a>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="record.approval_status === '草稿'"
                    @click="handleOpenEdit(record)"><EditOutlined /> 编辑</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '草稿'"
                    @click="handleSubmit(record)">提交审核</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '审批中'"
                    @click="handleWithdraw(record)">撤回提交</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '已审批'"
                    @click="handleReverse(record)"><span style="color: #ff4d4f">反审退回</span></a-menu-item>
                  <a-menu-divider v-if="record.status === '已确认'" />
                  <a-menu-item v-if="record.status === '已确认'"
                    @click="handleCancelReturn(record)"><StopOutlined style="margin-right:4px" /><span style="color: #ff4d4f">撤消</span></a-menu-item>
                  <a-menu-divider />
                  <a-menu-item @click="handleShowApprovalLog(record)">
                    <HistoryOutlined /> 审批历史</a-menu-item>
                  <a-menu-item v-if="record.approval_status === '草稿'"
                    @click="handleDelete(record)" style="color: #ff4d4f">
                    <DeleteOutlined /> 删除</a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="formVisible"
      width="1200px"
      :style="formModalStyle"
      :footer="null"
      :bodyStyle="{ maxHeight: '80vh', overflowY: 'auto' }"
    >
      <template #title>
        <div class="drag-handle" @mousedown="formDragStart">{{ isEditing ? '编辑退货单' : '新建退货单' }}</div>
      </template>
      <a-form :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }" style="margin-top: 16px">
        <!-- 基本信息 -->
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="退货类型" required>
              <a-radio-group v-model:value="formData.type">
                <a-radio-button value="退款退货">退款退货</a-radio-button>
                <a-radio-button value="退货换货">退货换货</a-radio-button>
              </a-radio-group>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="退货仓库" required>
              <a-select
                v-model:value="formData.warehouse_number"
                placeholder="请选择退货入库仓库"
                @change="handleWarehouseChange"
                show-search
                option-filter-prop="label"
              >
                <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number" :label="w.warehouse_name">
                  {{ w.warehouse_name }} ({{ w.warehouse_number }})
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="退货原因">
              <a-textarea v-model:value="formData.reason" :rows="2" placeholder="请输入退货原因" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="备注">
              <a-textarea v-model:value="formData.remark" :rows="2" placeholder="备注说明" />
            </a-form-item>
          </a-col>
        </a-row>

        <!-- 发货单选择 -->
        <a-divider orientation="left">选择发货单</a-divider>
        <div style="display: flex; gap: 8px; margin-bottom: 16px">
          <a-input
            v-model:value="shippingSearchText"
            placeholder="请输入发货单号，如 SM-20260328-001"
            style="width: 360px"
            :disabled="isEditing"
            @pressEnter="handleLoadShippingOrder"
          />
          <a-button type="primary" @click="handleLoadShippingOrder" :loading="shippingLoading" :disabled="isEditing">
            加载发货单
          </a-button>
        </div>

        <!-- 发货单信息 -->
        <template v-if="shippingData">
          <a-descriptions bordered :column="3" size="small" style="margin-bottom: 16px">
            <a-descriptions-item label="发货单号">{{ shippingData.header?.shipping_order_number }}</a-descriptions-item>
            <a-descriptions-item label="客户名称">{{ shippingData.header?.customer_name }}</a-descriptions-item>
            <a-descriptions-item label="发货状态">
              <a-tag>{{ shippingData.header?.status }}</a-tag>
            </a-descriptions-item>
          </a-descriptions>

          <!-- 退货明细 -->
          <div style="font-weight: 600; margin-bottom: 8px">
            退货明细
            <span style="font-size: 12px; color: #888; margin-left: 8px">
              (在批次行中输入退货数量，明细退货数量将自动汇总。总退货数: {{ totalReturnQty }})
            </span>
          </div>

          <div v-for="(detail, dIdx) in formData.details" :key="dIdx" style="margin-bottom: 12px; border: 1px solid #f0f0f0; border-radius: 4px; padding: 12px">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap">
              <span style="font-weight: 600">{{ detail.item_number }}</span>
              <span>{{ detail.item_name }}</span>
              <span style="color: #888">{{ detail.specifications }}</span>
              <span style="color: #888">{{ detail.basic_unit }}</span>
              <span>发货数量: <b>{{ detail.shipped_quantity }}</b></span>
              <span style="color: #fa541c">退货数量: <b>{{ detail.return_quantity }}</b></span>
              <span v-if="detail.sales_order_number" style="color: #1890ff">销售订单: {{ detail.sales_order_number }}</span>
            </div>
            <a-table
              :data-source="detail.batches"
              :pagination="false"
              row-key="batch_number"
              size="small"
              bordered
            >
              <a-table-column title="批次号" data-index="batch_number" :width="170" />
              <a-table-column title="发货数量" data-index="shipped_quantity" :width="100" />
              <a-table-column title="已退数量" data-index="returned_quantity" :width="100">
                <template #default="{ record: batchRecord }">
                  <span :style="{ color: batchRecord.returned_quantity > 0 ? '#fa541c' : '#ccc' }">
                    {{ batchRecord.returned_quantity }}
                  </span>
                </template>
              </a-table-column>
              <a-table-column title="可退数量" data-index="returnable_quantity" :width="100">
                <template #default="{ record: batchRecord }">
                  <span style="color: #52c41a; font-weight: 600">{{ batchRecord.returnable_quantity }}</span>
                </template>
              </a-table-column>
              <a-table-column title="本次退货数量" :width="150">
                <template #default="{ record: batchRecord }">
                  <a-input-number
                    v-model:value="batchRecord.quantity"
                    :min="0"
                    :max="batchRecord.returnable_quantity"
                    :precision="4"
                    size="small"
                    style="width: 120px"
                    @change="updateDetailReturnQty(dIdx)"
                  />
                </template>
              </a-table-column>
            </a-table>
          </div>
        </template>

        <!-- 提交按钮 -->
        <div style="text-align: right; margin-top: 16px">
          <a-space>
            <a-button @click="formVisible = false">取消</a-button>
            <a-button type="primary" @click="handleFormSubmit" :loading="formLoading" :disabled="totalReturnQty <= 0">
              {{ isEditing ? '保存' : '创建退货单' }}
            </a-button>
          </a-space>
        </div>
      </a-form>
    </a-modal>

    <!-- 详情弹窗 -->
    <a-modal v-model:open="detailVisible" width="1100px" :footer="null"
      :style="detailModalStyle"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }">
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">退货单详情</div>
      </template>
      <a-spin :spinning="detailLoading">
        <a-descriptions bordered :column="3" size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="退货单号">{{ detailHeader.return_order_number }}</a-descriptions-item>
          <a-descriptions-item label="退货类型">
            <a-tag :color="typeColors[detailHeader.type] || 'default'">{{ detailHeader.type }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-badge :status="statusColors[detailHeader.status] || 'default'" :text="detailHeader.status" />
          </a-descriptions-item>
          <a-descriptions-item label="发货单号">{{ detailHeader.shipping_order_number }}</a-descriptions-item>
          <a-descriptions-item label="客户名称">{{ detailHeader.customer_name }}</a-descriptions-item>
          <a-descriptions-item label="退货仓库">{{ detailHeader.warehouse_name }}</a-descriptions-item>
          <a-descriptions-item label="退货原因" :span="2">{{ detailHeader.reason || '-' }}</a-descriptions-item>
          <a-descriptions-item label="创建人">{{ detailHeader.creation_man }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="2">{{ detailHeader.remark || '-' }}</a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ formatDateTime(detailHeader.creation_date) }}</a-descriptions-item>
          <a-descriptions-item label="确认人" v-if="detailHeader.confirmed_by">{{ detailHeader.confirmed_by }}</a-descriptions-item>
          <a-descriptions-item label="确认时间" v-if="detailHeader.confirmed_date">{{ formatDateTime(detailHeader.confirmed_date) }}</a-descriptions-item>
          <a-descriptions-item label="确认备注" v-if="detailHeader.confirm_remark" :span="3">{{ detailHeader.confirm_remark }}</a-descriptions-item>
        </a-descriptions>

        <div style="font-weight: 600; margin-bottom: 8px">退货明细</div>
        <a-table
          :columns="detailColumns"
          :data-source="detailItems"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 1000 }"
          :expandedRowKeys="detailItems.filter((d: any) => d.batches && d.batches.length > 0).map((d: any) => d.id)"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'return_quantity'">
              <span style="color: #fa541c; font-weight: 600">{{ record.return_quantity }}</span>
            </template>
          </template>
          <template #expandedRowRender="{ record }">
            <div v-if="record.batches && record.batches.length > 0" style="padding: 4px 0">
              <div style="font-size: 12px; color: #888; margin-bottom: 4px">退货批次明细：</div>
              <a-table
                :columns="detailBatchColumns"
                :data-source="record.batches"
                :pagination="false"
                row-key="id"
                size="small"
                bordered
              />
            </div>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <ColumnSettingDrawer
      v-model:open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />

    <ApprovalLogModal
      v-model:open="approvalLogVisible"
      module="return_order"
      :recordId="approvalLogRecordId"
    />
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
