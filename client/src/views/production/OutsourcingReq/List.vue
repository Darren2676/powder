<template>
  <div class="page-container">
    <a-card :bordered="false">
      <div class="table-header">
        <div class="table-header-left">
          <a-input-search v-model:value="searchText" placeholder="搜索申请号/生产单号/产品编号/产品名称" style="width: 360px" allow-clear @search="fetchList" @pressEnter="fetchList" />
          <a-select v-model:value="approvalFilter" placeholder="审批状态" style="width: 120px; margin-left: 8px" allow-clear @change="fetchList">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审批</a-select-option>
            <a-select-option value="已审批">已审批</a-select-option>
          </a-select>
          <a-select v-model:value="orderStatusFilter" placeholder="转单状态" style="width: 120px; margin-left: 8px" allow-clear @change="fetchList">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="未执行">未执行</a-select-option>
            <a-select-option value="部分转单">部分转单</a-select-option>
            <a-select-option value="已转单">已转单</a-select-option>
          </a-select>
        </div>
        <div class="table-header-right">
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
        </div>
      </div>

      <a-table
        :columns="columns" :data-source="tableData" :loading="loading"
        :pagination="{ current: page, pageSize: limit, total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
        @change="handleTableChange"
        :scroll="{ x: 1600 }" row-key="outsourcing_req_number" size="small" bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'approval_status'">
            <a-tag :color="record.approval_status === '已审批' ? 'green' : record.approval_status === '待审批' ? 'orange' : 'default'">{{ record.approval_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'order_status'">
            <a-tag :color="record.order_status === '已转单' ? 'green' : record.order_status === '部分转单' ? 'blue' : 'default'">{{ record.order_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="0" wrap>
              <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
              <a-button v-if="record.approval_status === '草稿'" type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button v-if="record.approval_status === '草稿'" type="link" size="small" danger @click="handleDelete(record)">删除</a-button>
              <a-button v-if="record.approval_status === '草稿'" type="link" size="small" @click="handleSubmit(record)">提交</a-button>
              <a-button v-if="record.approval_status === '待审批'" type="link" size="small" style="color: green" @click="handleApprove(record)">审批</a-button>
              <a-button v-if="record.approval_status === '待审批'" type="link" size="small" @click="handleWithdraw(record)">撤回</a-button>
              <a-button v-if="record.approval_status === '已审批'" type="link" size="small" @click="handleReverse(record)">反审</a-button>
              <a-button v-if="record.approval_status === '已审批' && record.order_status !== '已转单'" type="link" size="small" style="color: #1890ff" @click="openToOrder(record)">转委外订单</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 查看/编辑弹窗（含明细表格） -->
    <a-modal v-model:open="detailVisible" :title="detailMode === 'edit' ? '编辑委外申请' : '查看委外申请'" :footer="detailMode === 'edit' ? undefined : null" @ok="handleEditOk" okText="保存" cancelText="取消" width="900px">
      <a-descriptions :column="3" bordered size="small" style="margin-bottom: 16px">
        <a-descriptions-item label="委外申请号">{{ detailData.outsourcing_req_number }}</a-descriptions-item>
        <a-descriptions-item label="生产单号">{{ detailData.production_order_number }}</a-descriptions-item>
        <a-descriptions-item label="审批状态">
          <a-tag :color="detailData.approval_status === '已审批' ? 'green' : detailData.approval_status === '待审批' ? 'orange' : 'default'">{{ detailData.approval_status }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="产品编号">{{ detailData.item_number }}</a-descriptions-item>
        <a-descriptions-item label="产品名称">{{ detailData.item_name }}</a-descriptions-item>
        <a-descriptions-item label="规格">{{ detailData.specifications }}</a-descriptions-item>
        <a-descriptions-item label="单位">{{ detailData.basic_unit }}</a-descriptions-item>
        <a-descriptions-item label="计划数量">{{ detailData.planned_quantity }}</a-descriptions-item>
        <a-descriptions-item label="转单状态">
          <a-tag :color="detailData.order_status === '已转单' ? 'green' : detailData.order_status === '部分转单' ? 'blue' : 'default'">{{ detailData.order_status }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="创建日期">{{ detailData.creation_date }}</a-descriptions-item>
        <a-descriptions-item label="创建人">{{ detailData.creation_man }}</a-descriptions-item>
        <a-descriptions-item label="备注">
          <a-textarea v-if="detailMode === 'edit'" v-model:value="detailData.remark" :rows="1" />
          <span v-else>{{ detailData.remark }}</span>
        </a-descriptions-item>
      </a-descriptions>

      <h4>委外工序明细</h4>
      <a-table
        :columns="detailColumns" :data-source="detailRows" row-key="id" size="small" bordered
        :pagination="false" :scroll="{ x: 1000 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="record.status === '已转单' ? 'green' : record.status === '部分转单' ? 'blue' : 'default'">{{ record.status }}</a-tag>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 转委外订单弹窗 -->
    <a-modal v-model:open="toOrderVisible" title="转委外订单" @ok="handleToOrder" okText="确认转单" cancelText="取消" width="900px" :confirmLoading="toOrderLoading">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="供应商" required>
              <a-select v-model:value="toOrderForm.supplier_number" show-search allow-clear placeholder="请选择供应商"
                :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())"
                :options="supplierOptions" @change="onToOrderSupplierChange" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="供应商名称">
              <a-input :value="toOrderForm.supplier_name" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="预计回货日期">
              <a-input v-model:value="toOrderForm.expected_return_date" placeholder="YYYY/MM/DD" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="备注">
              <a-input v-model:value="toOrderForm.remark" placeholder="可选备注" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>

      <h4>选择要转单的明细行</h4>
      <a-table
        :columns="toOrderDetailColumns" :data-source="toOrderDetails" row-key="id" size="small" bordered :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'select'">
            <a-checkbox :checked="toOrderSelectedIds.includes(record.id)" @change="(e: any) => toggleToOrderSelect(record.id, e.target.checked)" :disabled="record.status === '已转单'" />
          </template>
          <template v-else-if="column.key === 'remaining'">
            {{ ((parseFloat(record.planned_quantity) || 0) - (parseFloat(record.ordered_quantity) || 0)).toFixed(2) }}
          </template>
          <template v-else-if="column.key === 'unit_price'">
            <a-input-number v-model:value="toOrderUnitPrices[record.id]" :min="0" :precision="4" size="small" style="width: 100%" :disabled="record.status === '已转单'" />
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { DownloadOutlined } from '@ant-design/icons-vue'
import { getOutsourcingReqs, getOutsourcingReqDetail, updateOutsourcingReq, deleteOutsourcingReq, outsourcingReqToOrder, exportOutsourcingReqs } from '@/api/production/outsourcingReq'
import { submitForApproval, approveRecord, withdrawApproval, reverseApproval } from '@/api/system/approval'
import { getSuppliers } from '@/api/master-data/supplier'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'

const MODULE = 'outsourcing_req'

const approvalFilter = ref('')
const orderStatusFilter = ref('')

const tableData = ref<any[]>([])
const page = ref(1)
const limit = ref(20)
const total = ref(0)

const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getOutsourcingReqs)

const columns = [
  { title: '委外申请号', dataIndex: 'outsourcing_req_number', key: 'outsourcing_req_number', width: 180, fixed: 'left' as const },
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100 },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '转单状态', dataIndex: 'order_status', key: 'order_status', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '操作', key: 'action', width: 360, fixed: 'right' as const }
]

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '工序任务号', dataIndex: 'process_task_number', key: 'process_task_number', width: 160 },
  { title: '工序序号', dataIndex: 'step_number', key: 'step_number', width: 80 },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 120 },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 120 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100 },
  { title: '已转单数量', dataIndex: 'ordered_quantity', key: 'ordered_quantity', width: 100 },
  { title: '行状态', dataIndex: 'status', key: 'status', width: 90 }
]

const toOrderDetailColumns = [
  { title: '选择', key: 'select', width: 60 },
  { title: '工序任务号', dataIndex: 'process_task_number', key: 'process_task_number', width: 150 },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 120 },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 100 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90 },
  { title: '已转单', dataIndex: 'ordered_quantity', key: 'ordered_quantity', width: 80 },
  { title: '剩余可转', key: 'remaining', width: 90 },
  { title: '单价', key: 'unit_price', width: 120 },
  { title: '行状态', dataIndex: 'status', key: 'status', width: 80 }
]

// Detail modal
const detailVisible = ref(false)
const detailMode = ref<'view' | 'edit'>('view')
const detailData = ref<any>({})
const detailRows = ref<any[]>([])

// ToOrder modal
const toOrderVisible = ref(false)
const toOrderLoading = ref(false)
const toOrderReqNumber = ref('')
const toOrderDetails = ref<any[]>([])
const toOrderSelectedIds = ref<number[]>([])
const toOrderUnitPrices = ref<Record<number, number>>({})
const toOrderForm = reactive({ supplier_number: '', supplier_name: '', expected_return_date: '', remark: '' })

// Suppliers
const supplierOptions = ref<any[]>([])
const supplierMap = ref<Record<string, string>>({})

const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getOutsourcingReqs({ page: page.value, limit: limit.value, search: searchText.value, approval_status: approvalFilter.value, order_status: orderStatusFilter.value })
    const data = res.data
    tableData.value = data?.items || []
    total.value = data?.pagination?.total || 0
  } catch { message.error('加载列表失败') }
  loading.value = false
}



const loadSuppliers = async () => {
  try {
    const res: any = await getSuppliers({ page: 1, limit: 9999 })
    const list = res.data?.items || res.data || []
    supplierOptions.value = list.map((s: any) => ({ value: s.supplier_number, label: `${s.supplier_number} ${s.supplier_name}` }))
    supplierMap.value = {}
    for (const s of list) supplierMap.value[s.supplier_number] = s.supplier_name
  } catch {}
}

// View/Edit detail
const loadDetail = async (id: string) => {
  const res: any = await getOutsourcingReqDetail(id)
  const data = res.data
  detailData.value = { ...data }
  detailRows.value = data?.details || []
}

const handleView = async (record: any) => {
  detailMode.value = 'view'
  await loadDetail(record.outsourcing_req_number)
  detailVisible.value = true
}

const handleEdit = async (record: any) => {
  detailMode.value = 'edit'
  await loadDetail(record.outsourcing_req_number)
  detailVisible.value = true
}

const handleEditOk = async () => {
  try {
    await updateOutsourcingReq(detailData.value.outsourcing_req_number, {
      remark: detailData.value.remark,
      details: detailRows.value
    })
    message.success('更新成功')
    detailVisible.value = false
    fetchList()
  } catch { message.error('更新失败') }
}

// Delete
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除委外申请 ${record.outsourcing_req_number}？`,
    okType: 'danger',
    onOk: async () => {
      try {
        await deleteOutsourcingReq(record.outsourcing_req_number)
        message.success('删除成功')
        fetchList()
      } catch { message.error('删除失败') }
    }
  })
}

// Approval actions
const handleSubmit = async (record: any) => {
  try {
    await submitForApproval(MODULE, record.outsourcing_req_number)
    message.success('提交成功')
    fetchList()
  } catch { message.error('提交失败') }
}

const handleApprove = async (record: any) => {
  try {
    await approveRecord(MODULE, record.outsourcing_req_number)
    message.success('审批通过')
    fetchList()
  } catch { message.error('审批失败') }
}

const handleWithdraw = async (record: any) => {
  try {
    await withdrawApproval(MODULE, record.outsourcing_req_number)
    message.success('已撤回')
    fetchList()
  } catch { message.error('撤回失败') }
}

const handleReverse = async (record: any) => {
  try {
    await reverseApproval(MODULE, record.outsourcing_req_number)
    message.success('反审成功')
    fetchList()
  } catch { message.error('反审失败') }
}

// Export
const handleExport = async () => {
  try {
    const res: any = await exportOutsourcingReqs(searchText.value)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = generateExportFilename('委外申请')
    a.click()
    URL.revokeObjectURL(url)
  } catch { message.error('导出失败') }
}

// ToOrder
const openToOrder = async (record: any) => {
  toOrderReqNumber.value = record.outsourcing_req_number
  await loadDetail(record.outsourcing_req_number)
  toOrderDetails.value = detailRows.value
  toOrderSelectedIds.value = []
  toOrderUnitPrices.value = {}
  toOrderForm.supplier_number = ''
  toOrderForm.supplier_name = ''
  toOrderForm.expected_return_date = ''
  toOrderForm.remark = ''
  // Pre-select non-completed lines
  for (const d of toOrderDetails.value) {
    if (d.status !== '已转单') {
      toOrderSelectedIds.value.push(d.id)
      toOrderUnitPrices.value[d.id] = 0
    }
  }
  toOrderVisible.value = true
}

const toggleToOrderSelect = (id: number, checked: boolean) => {
  if (checked) {
    if (!toOrderSelectedIds.value.includes(id)) toOrderSelectedIds.value.push(id)
    if (toOrderUnitPrices.value[id] === undefined) toOrderUnitPrices.value[id] = 0
  } else {
    toOrderSelectedIds.value = toOrderSelectedIds.value.filter(i => i !== id)
  }
}

const onToOrderSupplierChange = (val: string) => {
  toOrderForm.supplier_name = supplierMap.value[val] || ''
}

const handleToOrder = async () => {
  if (!toOrderForm.supplier_number) { message.warning('请选择供应商'); return }
  if (!toOrderSelectedIds.value.length) { message.warning('请选择要转单的明细行'); return }

  toOrderLoading.value = true
  try {
    const res: any = await outsourcingReqToOrder(toOrderReqNumber.value, {
      detail_ids: toOrderSelectedIds.value,
      supplier_number: toOrderForm.supplier_number,
      supplier_name: toOrderForm.supplier_name,
      expected_return_date: toOrderForm.expected_return_date,
      unit_prices: toOrderUnitPrices.value,
      remark: toOrderForm.remark
    })
    message.success(res.message || '转单成功')
    toOrderVisible.value = false
    fetchList()
  } catch { message.error('转单失败') }
  toOrderLoading.value = false
}

onMounted(() => {
  fetchList()
  loadSuppliers()
})
</script>

<style scoped>
.page-container { padding: 0; }
.table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.table-header-left { display: flex; align-items: center; flex-wrap: wrap; gap: 0; }
.table-header-right { display: flex; gap: 8px; }
</style>
