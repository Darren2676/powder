<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, DownloadOutlined, UploadOutlined, DeleteOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons-vue'
import { getSalesPriceLists, getSalesPriceListDetail, createSalesPriceList, updateSalesPriceList, deleteSalesPriceList, exportSalesPriceLists, importSalesPriceList } from '@/api/sales/salesPrice'
import { getItems } from '@/api/master-data/itemMaster'
import { getCustomers } from '@/api/master-data/customer'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

// ==================== 数据 ====================

const dataList = ref<any[]>([])


const filterApproval = ref('')

const modalVisible = ref(false)
const modalTitle = ref('新建销售价目表')
const isView = ref(false)
const formData = ref<any>({})
const detailRows = ref<any[]>([])

const itemOptions = ref<any[]>([])
const customerOptions = ref<any[]>([])

// 导入
const importFileRef = ref<HTMLInputElement | null>(null)

// ==================== 列定义 ====================
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getSalesPriceLists)

const columns = [
  { title: '价目表编号', dataIndex: 'price_list_number', key: 'price_list_number', width: 180 },
  { title: '价目表名称', dataIndex: 'price_list_name', key: 'price_list_name', width: 160 },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160 },
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 120 },
  { title: '客户分类', dataIndex: 'customer_category', key: 'customer_category', width: 100 },
  { title: '有效期开始', dataIndex: 'effective_date', key: 'effective_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '有效期结束', dataIndex: 'expiration_date', key: 'expiration_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '单价类型', dataIndex: 'price_type', key: 'price_type', width: 90 },
  { title: '币种', dataIndex: 'currency', key: 'currency', width: 70 },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90 },
  { title: '操作', key: 'action', width: 320, fixed: 'right' as const }
]

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 150 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '物料分类', dataIndex: 'item_category', key: 'item_category', width: 100 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '含税单价', dataIndex: 'tax_inclusive_price', key: 'tax_inclusive_price', width: 100 },
  { title: '未税单价', dataIndex: 'tax_exclusive_price', key: 'tax_exclusive_price', width: 100 },
  { title: '税率%', dataIndex: 'tax_rate', key: 'tax_rate', width: 80 },
  { title: '分段价格', dataIndex: 'enable_tiered_pricing', key: 'enable_tiered_pricing', width: 90 },
  { title: '起始数量', dataIndex: 'start_quantity', key: 'start_quantity', width: 100 },
  { title: '结束数量', dataIndex: 'end_quantity', key: 'end_quantity', width: 100 },
  { title: '计价单位', dataIndex: 'pricing_unit', key: 'pricing_unit', width: 90 },
  { title: '含税最低价', dataIndex: 'min_price_inclusive', key: 'min_price_inclusive', width: 110 },
  { title: '不含税最低价', dataIndex: 'min_price_exclusive', key: 'min_price_exclusive', width: 110 },
  { title: '操作', key: 'action', width: 60 }
]

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getSalesPriceLists({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterApproval.value
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

const loadDropdowns = async () => {
  try {
    const [itemRes, custRes]: any = await Promise.all([
      getItems({ limit: 9999 }), getCustomers({ limit: 9999 })
    ])
    itemOptions.value = itemRes.data?.items || []
    customerOptions.value = custRes.data?.items || []
  } catch { /* ignore */ }
}

onMounted(() => { fetchList(); loadDropdowns() })





const openView = async (record: any) => {
  modalTitle.value = '查看销售价目表'
  isView.value = true
  const res: any = await getSalesPriceListDetail(record.price_list_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
}

const openEdit = async (record: any) => {
  modalTitle.value = '编辑销售价目表'
  isView.value = false
  const res: any = await getSalesPriceListDetail(record.price_list_number)
  formData.value = res.data?.header || {}
  detailRows.value = (res.data?.details || []).map((d: any) => ({ ...d, enable_tiered_pricing: !!d.enable_tiered_pricing }))
  modalVisible.value = true
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除', content: `确定删除销售价目表 ${record.price_list_number}？`,
    icon: () => null,
    onOk: async () => {
      await deleteSalesPriceList(record.price_list_number)
      message.success('删除成功')
      fetchList()
    }
  })
}

const onCustomerSelect = (val: string) => {
  const cust = customerOptions.value.find((c: any) => c.customer_number === val)
  if (cust) {
    formData.value.customer_number = cust.customer_number
    formData.value.customer_name = cust.customer_name
    formData.value.customer_category = cust.customer_category || ''
  }
}

const addDetailRow = () => {
  const maxLine = detailRows.value.reduce((m: number, r: any) => Math.max(m, r.line_number || 0), 0)
  detailRows.value.push({
    line_number: maxLine + 10, item_number: '', item_name: '', item_category: '', specifications: '',
    tax_inclusive_price: 0, tax_exclusive_price: 0, tax_rate: 13,
    enable_tiered_pricing: false, start_quantity: 0, end_quantity: null,
    pricing_unit: '', min_price_inclusive: 0, min_price_exclusive: 0, remark: ''
  })
}

const removeDetailRow = (index: number) => { detailRows.value.splice(index, 1) }

const onItemSelect = (val: string, row: any) => {
  const item = itemOptions.value.find((i: any) => i.item_number === val)
  if (item) {
    row.item_number = item.item_number
    row.item_name = item.item_name
    row.item_category = item.item_category || ''
    row.specifications = item.specifications || ''
    row.pricing_unit = item.basic_unit || ''
  }
}

const calcTaxPrice = (row: any, from: 'inclusive' | 'exclusive') => {
  const rate = parseFloat(row.tax_rate) || 0
  if (from === 'inclusive') {
    const incl = parseFloat(row.tax_inclusive_price) || 0
    row.tax_exclusive_price = rate > 0 ? parseFloat((incl / (1 + rate / 100)).toFixed(6)) : incl
  } else {
    const excl = parseFloat(row.tax_exclusive_price) || 0
    row.tax_inclusive_price = rate > 0 ? parseFloat((excl * (1 + rate / 100)).toFixed(6)) : excl
  }
}

const handleSave = async () => {
  if (!formData.value.price_list_name) { message.warning('请填写价目表名称'); return }
  const payload = { ...formData.value, details: detailRows.value }
  if (formData.value.price_list_number) {
    await updateSalesPriceList(formData.value.price_list_number, payload)
    message.success('更新成功')
  } else {
    await createSalesPriceList(payload)
    message.success('创建成功')
  }
  modalVisible.value = false
  fetchList()
}

// ==================== 审批 ====================
const handleSubmitApproval = async (record: any) => { await submitForApproval('sales_price_list', record.price_list_number); message.success('提交审批成功'); fetchList() }
const handleApprove = async (record: any) => { await approveRecord('sales_price_list', record.price_list_number); message.success('审批通过'); fetchList() }
const handleWithdraw = async (record: any) => { await withdrawApproval('sales_price_list', record.price_list_number); message.success('撤回成功'); fetchList() }
const handleReverse = async (record: any) => { await reverseApproval('sales_price_list', record.price_list_number); message.success('反审批成功'); fetchList() }

// ==================== 导出 ====================
const handleExport = async () => {
  const res: any = await exportSalesPriceLists(searchText.value)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'sales_price_lists.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// ==================== 导入 ====================
const triggerImport = () => { importFileRef.value?.click() }
const handleImportFile = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res: any = await importSalesPriceList(fd)
    message.success(res.message || '导入成功')
    fetchList()
  } catch { /* error handled by request interceptor */ }
  if (importFileRef.value) importFileRef.value.value = ''
}
</script>

<template>
  <div style="padding: 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">销售价目表</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <a-input-search v-model:value="searchText" placeholder="搜索编号/名称/客户" style="width:260px" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterApproval" placeholder="审批状态" style="width:120px" allow-clear @change="handleSearch">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-button @click="handleRefresh"><template #icon><ReloadOutlined /></template></a-button>
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
        <a-button @click="triggerImport"><template #icon><UploadOutlined /></template>导入</a-button>
        <input ref="importFileRef" type="file" accept=".xlsx,.xls" style="display:none" @change="handleImportFile" />
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handleTableChange" row-key="price_list_number" :scroll="{ x: 1800 }" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space size="small">
            <a-button size="small" @click="openView(record)"><template #icon><EyeOutlined /></template></a-button>
            <a-button size="small" @click="openEdit(record)" :disabled="record.approval_status !== '草稿'"><template #icon><EditOutlined /></template></a-button>
            <a-button size="small" @click="handleSubmitApproval(record)" :disabled="record.approval_status !== '草稿'">提交</a-button>
            <a-button size="small" @click="handleApprove(record)" :disabled="record.approval_status !== '待审批'">审批</a-button>
            <a-button size="small" @click="handleWithdraw(record)" :disabled="record.approval_status !== '待审批'">撤回</a-button>
            <a-button size="small" @click="handleReverse(record)" :disabled="record.approval_status !== '已审批'">反审</a-button>
            <a-popconfirm title="确定删除？" @confirm="handleDelete(record)">
              <a-button size="small" danger :disabled="record.approval_status !== '草稿'"><template #icon><DeleteOutlined /></template></a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 编辑/查看弹窗 -->
    <a-modal v-model:open="modalVisible" :title="modalTitle" width="1200px" @ok="handleSave" :ok-button-props="{ style: isView ? { display: 'none' } : {} }" :cancel-text="isView ? '关闭' : '取消'">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="价目表名称" required>
            <a-input v-model:value="formData.price_list_name" :disabled="isView" placeholder="输入价目表名称" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="客户">
            <a-select v-model:value="formData.customer_number" show-search option-filter-prop="label" style="width:100%" @change="onCustomerSelect" :disabled="isView" placeholder="选择客户" allow-clear>
              <a-select-option v-for="c in customerOptions" :key="c.customer_number" :value="c.customer_number" :label="c.customer_number + ' ' + c.customer_name">{{ c.customer_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="客户分类">
            <a-input v-model:value="formData.customer_category" :disabled="isView" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="单价类型">
            <a-select v-model:value="formData.price_type" :disabled="isView" style="width:100%">
              <a-select-option value="含税">含税</a-select-option>
              <a-select-option value="未税">未税</a-select-option>
            </a-select>
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="有效期开始">
            <a-date-picker v-model:value="formData.effective_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="有效期结束">
            <a-date-picker v-model:value="formData.expiration_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="币种">
            <a-select v-model:value="formData.currency" :disabled="isView" style="width:100%">
              <a-select-option value="CNY">CNY</a-select-option>
              <a-select-option value="USD">USD</a-select-option>
              <a-select-option value="EUR">EUR</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="备注">
            <a-input v-model:value="formData.remark" :disabled="isView" />
          </a-form-item></a-col>
        </a-row>
      </a-form>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px">
        <h4 style="margin:0">物料明细</h4>
        <a-button v-if="!isView" size="small" type="primary" @click="addDetailRow"><PlusOutlined /> 添加行</a-button>
      </div>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" :row-key="(_r: any, i: number) => i" size="small" :scroll="{ x: 1600 }">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'item_number' && !isView">
            <a-select v-model:value="record.item_number" show-search option-filter-prop="label" style="width:100%" @change="(v: string) => onItemSelect(v, record)" placeholder="搜索物料">
              <a-select-option v-for="item in itemOptions" :key="item.item_number" :value="item.item_number" :label="item.item_number + ' ' + item.item_name">{{ item.item_number }} {{ item.item_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'tax_inclusive_price' && !isView">
            <a-input-number v-model:value="record.tax_inclusive_price" :min="0" :precision="6" style="width:100%" @change="calcTaxPrice(record, 'inclusive')" />
          </template>
          <template v-else-if="column.key === 'tax_exclusive_price' && !isView">
            <a-input-number v-model:value="record.tax_exclusive_price" :min="0" :precision="6" style="width:100%" @change="calcTaxPrice(record, 'exclusive')" />
          </template>
          <template v-else-if="column.key === 'tax_rate' && !isView">
            <a-input-number v-model:value="record.tax_rate" :min="0" :max="100" :precision="2" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'enable_tiered_pricing' && !isView">
            <a-checkbox v-model:checked="record.enable_tiered_pricing" />
          </template>
          <template v-else-if="column.key === 'enable_tiered_pricing' && isView">
            {{ record.enable_tiered_pricing ? '是' : '否' }}
          </template>
          <template v-else-if="column.key === 'start_quantity' && !isView">
            <a-input-number v-model:value="record.start_quantity" :min="0" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'end_quantity' && !isView">
            <a-input-number v-model:value="record.end_quantity" :min="0" style="width:100%" placeholder="空=无上限" />
          </template>
          <template v-else-if="column.key === 'end_quantity' && isView">
            {{ record.end_quantity != null ? record.end_quantity : '无上限' }}
          </template>
          <template v-else-if="column.key === 'pricing_unit' && !isView">
            <a-input v-model:value="record.pricing_unit" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'min_price_inclusive' && !isView">
            <a-input-number v-model:value="record.min_price_inclusive" :min="0" :precision="6" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'min_price_exclusive' && !isView">
            <a-input-number v-model:value="record.min_price_exclusive" :min="0" :precision="6" style="width:100%" />
          </template>
          <template v-else-if="column.key === 'action' && !isView">
            <a-button size="small" danger @click="removeDetailRow(index)"><DeleteOutlined /></a-button>
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>
