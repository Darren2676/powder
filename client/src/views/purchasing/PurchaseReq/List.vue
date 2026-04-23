<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, DownloadOutlined, DeleteOutlined, EyeOutlined, EditOutlined, ExclamationCircleOutlined, SwapOutlined, DownOutlined, HistoryOutlined } from '@ant-design/icons-vue'
import { getPurchaseReqs, getPurchaseReqDetail, createPurchaseReq, updatePurchaseReq, deletePurchaseReq, exportPurchaseReqs, toOrder } from '@/api/purchasing/purchaseReq'
import { getItems } from '@/api/master-data/itemMaster'
import { getSuppliers } from '@/api/master-data/supplier'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

// ==================== 数据 ====================

const dataList = ref<any[]>([])


const filterApproval = ref('')
const filterOrder = ref('')

const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')

const modalVisible = ref(false)
const modalTitle = ref('新建采购申请')
const isView = ref(false)
const formData = ref<any>({})
const detailRows = ref<any[]>([])

const itemOptions = ref<any[]>([])
const supplierOptions = ref<any[]>([])

// 转采购订单
const toOrderVisible = ref(false)
const toOrderReqNumber = ref('')
const toOrderDetails = ref<any[]>([])
const toOrderSelectedIds = ref<number[]>([])
const toOrderForm = reactive({ supplier_number: '', supplier_name: '', delivery_date: null as string | null, procurement_manager: '', linkman: '', contacts: '' })

// ==================== 列定义 ====================
const { loading, dataSource, searchText, pagination, selectedRowKeys, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getPurchaseReqs)

const columns = [
  { title: '采购申请号', dataIndex: 'purchase_req_number', key: 'purchase_req_number', width: 180 },
  { title: '申请日期', dataIndex: 'request_date', key: 'request_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '申请人', dataIndex: 'requester', key: 'requester', width: 100 },
  { title: '部门', dataIndex: 'request_department', key: 'request_department', width: 100 },
  { title: '原因', dataIndex: 'request_reason', key: 'request_reason', width: 100 },
  { title: '来源单号', dataIndex: 'source_number', key: 'source_number', width: 150 },
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number', width: 200, ellipsis: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '执行状态', dataIndex: 'order_status', key: 'order_status', width: 100 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const detailColumns = [
  { title: '物料编码', dataIndex: 'item_number', key: 'item_number', width: 140 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70 },
  { title: '申请数量', dataIndex: 'request_quantity', key: 'request_quantity', width: 100 },
  { title: '已转单数量', dataIndex: 'ordered_quantity', key: 'ordered_quantity', width: 100 },
  { title: '期望到货日', dataIndex: 'expected_date', key: 'expected_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '建议供应商', dataIndex: 'suggested_supplier_name', key: 'suggested_supplier_name', width: 130 },
  { title: '行状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 80 }
]

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getPurchaseReqs({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterApproval.value, order_status: filterOrder.value
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

const loadDropdowns = async () => {
  try {
    const [itemRes, supRes]: any = await Promise.all([
      getItems({ limit: 9999 }), getSuppliers({ limit: 9999 })
    ])
    itemOptions.value = itemRes.data?.items || []
    supplierOptions.value = supRes.data?.items || []
  } catch { /* ignore */ }
}

onMounted(() => { fetchList(); loadDropdowns() })





const openView = async (record: any) => {
  modalTitle.value = '查看采购申请'
  isView.value = true
  const res: any = await getPurchaseReqDetail(record.purchase_req_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
}

const openEdit = async (record: any) => {
  modalTitle.value = '编辑采购申请'
  isView.value = false
  const res: any = await getPurchaseReqDetail(record.purchase_req_number)
  formData.value = res.data?.header || {}
  detailRows.value = (res.data?.details || []).map((d: any) => ({ ...d }))
  modalVisible.value = true
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除采购申请 "${record.purchase_req_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deletePurchaseReq(record.purchase_req_number)
        message.success('删除成功')
        fetchList()
      } catch { message.error('删除失败') }
    }
  })
}

const addDetailRow = () => {
  detailRows.value.push({ item_number: '', item_name: '', specifications: '', basic_unit: '', request_quantity: 0, ordered_quantity: 0, expected_date: null, suggested_supplier_number: '', suggested_supplier_name: '', remark: '' })
}

const removeDetailRow = (index: number) => { detailRows.value.splice(index, 1) }

const onItemSelect = (val: string, row: any) => {
  const item = itemOptions.value.find((i: any) => i.item_number === val)
  if (item) {
    row.item_number = item.item_number
    row.item_name = item.item_name
    row.specifications = item.specifications || ''
    row.basic_unit = item.basic_unit || ''
  }
}

const onSuggestedSupplierSelect = (val: string, row: any) => {
  const sup = supplierOptions.value.find((s: any) => s.supplier_number === val)
  if (sup) {
    row.suggested_supplier_number = sup.supplier_number
    row.suggested_supplier_name = sup.supplier_name
  }
}

const handleSave = async () => {
  const payload = { ...formData.value, details: detailRows.value }
  if (formData.value.purchase_req_number) {
    await updatePurchaseReq(formData.value.purchase_req_number, payload)
    message.success('更新成功')
  } else {
    await createPurchaseReq(payload)
    message.success('创建成功')
  }
  modalVisible.value = false
  fetchList()
}

// ==================== 审批 ====================
const handleSubmitApproval = (record: any) => {
  Modal.confirm({
    title: '提交审核',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定要提交审核吗？提交后将不可编辑。',
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      try {
        await submitForApproval('purchase_req', record.purchase_req_number)
        message.success('提交审核成功')
        fetchList()
      } catch { message.error('提交审核失败') }
    }
  })
}
const handleApprove = (record: any) => {
  Modal.confirm({
    title: '审核通过',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定审核通过吗？',
    okText: '通过',
    cancelText: '取消',
    onOk: async () => {
      try {
        await approveRecord('purchase_req', record.purchase_req_number)
        message.success('审核通过')
        fetchList()
      } catch { message.error('审核失败') }
    }
  })
}
const handleWithdraw = (record: any) => {
  Modal.confirm({
    title: '撤回提交',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定要撤回审核提交吗？',
    okText: '撤回',
    cancelText: '取消',
    onOk: async () => {
      try {
        await withdrawApproval('purchase_req', record.purchase_req_number)
        message.success('撤回成功')
        fetchList()
      } catch { message.error('撤回失败') }
    }
  })
}
const handleReverse = (record: any) => {
  Modal.confirm({
    title: '反审退回',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定要执行反审吗？记录将退回草稿状态。',
    okText: '确认反审',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await reverseApproval('purchase_req', record.purchase_req_number)
        message.success('反审成功，已退回草稿')
        fetchList()
      } catch { message.error('反审失败') }
    }
  })
}
const handleShowApprovalLog = (record: any) => {
  approvalLogRecordId.value = record.purchase_req_number
  approvalLogVisible.value = true
}

// ==================== 转采购订单 ====================
const openToOrder = async (record: any) => {
  toOrderReqNumber.value = record.purchase_req_number
  const res: any = await getPurchaseReqDetail(record.purchase_req_number)
  toOrderDetails.value = (res.data?.details || []).filter((d: any) => (parseFloat(d.request_quantity) || 0) > (parseFloat(d.ordered_quantity) || 0))
  toOrderSelectedIds.value = []
  toOrderForm.supplier_number = ''
  toOrderForm.supplier_name = ''
  toOrderForm.delivery_date = null
  toOrderForm.procurement_manager = ''
  toOrderForm.linkman = ''
  toOrderForm.contacts = ''
  toOrderVisible.value = true
}

const onToOrderSupplierSelect = (val: string) => {
  const sup = supplierOptions.value.find((s: any) => s.supplier_number === val)
  if (sup) {
    toOrderForm.supplier_number = sup.supplier_number
    toOrderForm.supplier_name = sup.supplier_name
    toOrderForm.procurement_manager = sup.procurement_manager || ''
    toOrderForm.linkman = sup.linkman || ''
    toOrderForm.contacts = sup.contacts || ''
  }
}

const handleToOrder = async () => {
  if (!toOrderSelectedIds.value.length) { message.warning('请选择要转单的明细行'); return }
  if (!toOrderForm.supplier_number) { message.warning('请选择供应商'); return }
  await toOrder(toOrderReqNumber.value, {
    supplier_number: toOrderForm.supplier_number,
    supplier_name: toOrderForm.supplier_name,
    procurement_manager: toOrderForm.procurement_manager,
    linkman: toOrderForm.linkman,
    contacts: toOrderForm.contacts,
    delivery_date: toOrderForm.delivery_date,
    detail_ids: toOrderSelectedIds.value
  })
  message.success('转采购订单成功')
  toOrderVisible.value = false
  fetchList()
}

// ==================== 导出 ====================
const handleExport = async () => {
  const res: any = await exportPurchaseReqs(searchText.value)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'purchase_reqs.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// ==================== 批量操作 ====================
const handleBatchAction = (action: string) => {
  const count = selectedRowKeys.value.length
  if (!count) { message.warning('请先勾选记录'); return }
  const actionMap: Record<string, { title: string; fn: () => Promise<any> }> = {
    submit: { title: '批量提交审批', fn: () => batchSubmitForApproval('purchase_req', selectedRowKeys.value) },
    approve: { title: '批量审批通过', fn: () => batchApproveRecords('purchase_req', selectedRowKeys.value) },
    withdraw: { title: '批量撤回', fn: () => batchWithdrawApproval('purchase_req', selectedRowKeys.value) },
    reverse: { title: '批量反审', fn: () => batchReverseApproval('purchase_req', selectedRowKeys.value) },
  }
  const act = actionMap[action]
  if (!act) return
  Modal.confirm({
    title: act.title,
    content: `确定对选中的 ${count} 条记录执行${act.title}吗？`,
    icon: () => null,
    onOk: async () => {
      try {
        await act.fn()
        message.success(`${act.title}成功`)
        selectedRowKeys.value = []
        fetchList()
      } catch { message.error(`${act.title}失败`) }
    }
  })
}
</script>

<template>
  <div style="padding: 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">采购申请单</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <a-input-search v-model:value="searchText" placeholder="搜索申请号/申请人/部门/计划编号" style="width:260px" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterApproval" placeholder="审批状态" style="width:120px" allow-clear @change="handleSearch">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
          <a-select-option value="已驳回">已驳回</a-select-option>
        </a-select>
        <a-select v-model:value="filterOrder" placeholder="执行状态" style="width:120px" allow-clear @change="handleSearch">
          <a-select-option value="未执行">未执行</a-select-option>
          <a-select-option value="部分转单">部分转单</a-select-option>
          <a-select-option value="已转单">已转单</a-select-option>
        </a-select>
        <a-button @click="handleRefresh"><template #icon><ReloadOutlined /></template></a-button>
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
      </div>
    </div>

    <div v-if="selectedRowKeys.length" style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      <span style="color: #999; font-size: 13px;">已选 {{ selectedRowKeys.length }} 项</span>
      <a-button size="small" @click="handleBatchAction('submit')">批量提交</a-button>
      <a-button size="small" @click="handleBatchAction('approve')">批量审批</a-button>
      <a-button size="small" @click="handleBatchAction('withdraw')">批量撤回</a-button>
      <a-button size="small" @click="handleBatchAction('reverse')">批量反审</a-button>
      <a-button size="small" @click="selectedRowKeys = []">清除选择</a-button>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handleTableChange" row-key="purchase_req_number" :row-selection="{ selectedRowKeys, onChange: (keys: string[]) => selectedRowKeys = keys }" :scroll="{ x: 1400 }" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'order_status'">
          <a-tag :color="record.order_status === '已转单' ? 'green' : record.order_status === '部分转单' ? 'blue' : 'default'">{{ record.order_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="openView(record)">
              <EyeOutlined /> 详情
            </a-button>
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>
                更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="openEdit(record)">
                    <EditOutlined /> 编辑
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="handleSubmitApproval(record)">
                    提交审核
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '待审批'" @click="handleApprove(record)">
                    <span style="color: #52c41a">审核通过</span>
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '待审批'" @click="handleWithdraw(record)">
                    撤回提交
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '已审批'" @click="handleReverse(record)">
                    <span style="color: #ff4d4f">反审退回</span>
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '已审批' && record.order_status !== '已转单'" @click="openToOrder(record)">
                    <SwapOutlined /> 转采购订单
                  </a-menu-item>
                  <a-menu-divider />
                  <a-menu-item @click="handleShowApprovalLog(record)">
                    <HistoryOutlined /> 审批历史
                  </a-menu-item>
                  <a-menu-item v-if="record.approval_status === '草稿'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f"><DeleteOutlined /> 删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 编辑/查看弹窗 -->
    <a-modal v-model:open="modalVisible" :title="modalTitle" width="1000px" @ok="handleSave" :ok-button-props="{ style: isView ? { display: 'none' } : {} }" :cancel-text="isView ? '关闭' : '取消'">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="申请日期"><a-date-picker v-model:value="formData.request_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="申请人"><a-input v-model:value="formData.requester" :disabled="isView" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="部门"><a-input v-model:value="formData.request_department" :disabled="isView" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="申请原因">
            <a-select v-model:value="formData.request_reason" :disabled="isView">
              <a-select-option value="生产缺料">生产缺料</a-select-option>
              <a-select-option value="安全库存补充">安全库存补充</a-select-option>
              <a-select-option value="其他">其他</a-select-option>
            </a-select>
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8"><a-form-item label="来源单号"><a-input v-model:value="formData.source_number" :disabled="isView" placeholder="如生产单号" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="生产计划编号"><a-input v-model:value="formData.production_number" :disabled="isView" placeholder="关联的生产计划编号" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="备注"><a-input v-model:value="formData.remark" :disabled="isView" /></a-form-item></a-col>
        </a-row>
      </a-form>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px">
        <h4 style="margin:0">物料明细</h4>
        <a-button v-if="!isView" size="small" type="primary" @click="addDetailRow"><PlusOutlined /> 添加行</a-button>
      </div>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" row-key="(r: any, i: number) => i" size="small" :scroll="{ x: 1000 }">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'item_number' && !isView">
            <a-select v-model:value="record.item_number" show-search option-filter-prop="label" style="width:100%" @change="(v: string) => onItemSelect(v, record)" placeholder="搜索物料">
              <a-select-option v-for="item in itemOptions" :key="item.item_number" :value="item.item_number" :label="item.item_number + ' ' + item.item_name">{{ item.item_number }} {{ item.item_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'request_quantity' && !isView">
            <a-input-number v-model:value="record.request_quantity" :min="0" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'expected_date' && !isView">
            <a-date-picker v-model:value="record.expected_date" style="width:100%" value-format="YYYY-MM-DD" />
          </template>
          <template v-else-if="column.key === 'suggested_supplier_name' && !isView">
            <a-select v-model:value="record.suggested_supplier_number" show-search option-filter-prop="label" style="width:100%" allow-clear @change="(v: string) => onSuggestedSupplierSelect(v, record)" placeholder="选择供应商">
              <a-select-option v-for="s in supplierOptions" :key="s.supplier_number" :value="s.supplier_number" :label="s.supplier_number + ' ' + s.supplier_name">{{ s.supplier_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'action' && !isView">
            <a-button size="small" danger @click="removeDetailRow(index)"><DeleteOutlined /></a-button>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 转采购订单弹窗 -->
    <a-modal v-model:open="toOrderVisible" title="转采购订单" width="900px" @ok="handleToOrder" ok-text="确认转单">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8"><a-form-item label="供应商" required>
            <a-select v-model:value="toOrderForm.supplier_number" show-search option-filter-prop="label" style="width:100%" @change="onToOrderSupplierSelect" placeholder="选择供应商">
              <a-select-option v-for="s in supplierOptions" :key="s.supplier_number" :value="s.supplier_number" :label="s.supplier_number + ' ' + s.supplier_name">{{ s.supplier_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="8"><a-form-item label="交货日期"><a-date-picker v-model:value="toOrderForm.delivery_date" style="width:100%" value-format="YYYY-MM-DD" /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="采购负责人"><a-input v-model:value="toOrderForm.procurement_manager" /></a-form-item></a-col>
        </a-row>
      </a-form>
      <h4>选择要转单的明细行 (仅显示尚有未转单数量的行)</h4>
      <a-table :columns="[
        { title: '', key: 'select', width: 50 },
        { title: '物料编码', dataIndex: 'item_number', width: 130 },
        { title: '物料名称', dataIndex: 'item_name', width: 150 },
        { title: '规格', dataIndex: 'specifications', width: 100 },
        { title: '单位', dataIndex: 'basic_unit', width: 60 },
        { title: '申请数量', dataIndex: 'request_quantity', width: 90 },
        { title: '已转单', dataIndex: 'ordered_quantity', width: 80 },
        { title: '可转数量', key: 'remaining', width: 90 }
      ]" :data-source="toOrderDetails" :pagination="false" row-key="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'select'">
            <a-checkbox :checked="toOrderSelectedIds.includes(record.id)" @change="(e: any) => { if (e.target.checked) toOrderSelectedIds.push(record.id); else toOrderSelectedIds = toOrderSelectedIds.filter((i: number) => i !== record.id) }" />
          </template>
          <template v-else-if="column.key === 'remaining'">
            {{ ((parseFloat(record.request_quantity) || 0) - (parseFloat(record.ordered_quantity) || 0)).toFixed(2) }}
          </template>
        </template>
      </a-table>
    </a-modal>
    <ApprovalLogModal v-model:open="approvalLogVisible" module="purchase_req" :record-id="approvalLogRecordId" />
  </div>
</template>
