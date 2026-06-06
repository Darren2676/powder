<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, PlusOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, exportCustomers, importCustomers, updateCustomerCondition, approveCustomer, withdrawCustomer } from '@/api/master-data/customer'
import { getUsers } from '@/api/system/user'
import { getFactories } from '@/api/system/factory'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

const router = useRouter()

interface Customer {
  customer_number: string
  customer_name: string
  classification: string
  country_code: string
  country: string
  currency_code: string
  industry: string
  head_of_sales: string
  head_of_sales_id?: number | null
  sales_tax_rate: number
  region: string
  region2: string
  region3: string
  region4: string
  detail_address: string
  zip_code: string
  telephone: string
  fax: string
  linkman: string
  area_code: string
  contacts: string
  email: string
  contact_remark: string
  bank_account_name: string
  bank_name: string
  bank_account_number: string
  invoice_address: string
  invoice_phone: string
  invoice_title: string
  tax_id: string
  payment_terms: string
  factory_id?: number | null
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Customer>(getCustomers)

const emptyForm = (): Customer => ({
  customer_number: '', customer_name: '', classification: '', country_code: '', country: '',
  currency_code: '', industry: '', head_of_sales: '', head_of_sales_id: null, sales_tax_rate: 0,
  region: '', region2: '', region3: '', region4: '', detail_address: '', zip_code: '',
  telephone: '', fax: '', linkman: '', area_code: '', contacts: '', email: '', contact_remark: '',
  bank_account_name: '', bank_name: '', bank_account_number: '',
  invoice_address: '', invoice_phone: '', invoice_title: '', tax_id: '', payment_terms: '',
  factory_id: null
})

const editModalVisible = ref(false)
const editLoading = ref(false)

// 用户列表（用于销售负责人选择）
const salesUserList = ref<Array<{id: number; real_name: string; username: string}>>([])
const loadSalesUsers = async () => {
  try {
    const res: any = await getUsers({ limit: 9999, status: 'active' })
    if (res.success) {
      salesUserList.value = (res.data.items || []).map((u: any) => ({ id: u.id, real_name: u.real_name, username: u.username }))
    }
  } catch (e) { /* ignore */ }
}
// 工厂列表
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) {
      factoryList.value = res.data.items || []
    }
  } catch (e) { /* ignore */ }
}
const handleHeadOfSalesSelect = (form: Customer, userId: number) => {
  const user = salesUserList.value.find(u => u.id === userId)
  if (user) {
    form.head_of_sales = user.real_name
    form.head_of_sales_id = user.id
  }
}
const editForm = reactive<Customer>(emptyForm())

const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Customer>(emptyForm())

const importLoading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 120, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 200, resizable: true },
  { title: '状态', dataIndex: 'condition', key: 'condition', width: 80, resizable: true },
  { title: '分类', dataIndex: 'classification', key: 'classification', width: 80, resizable: true },
  { title: '国家（地区）', dataIndex: 'country', key: 'country', width: 100, resizable: true },
  { title: '币种', dataIndex: 'currency_code', key: 'currency_code', width: 70, resizable: true },
  { title: '销售负责人', dataIndex: 'head_of_sales', key: 'head_of_sales', width: 110, resizable: true },
  { title: '联系人', dataIndex: 'linkman', key: 'linkman', width: 100, resizable: true },
  { title: '电话', dataIndex: 'telephone', key: 'telephone', width: 120, resizable: true },
  { title: '手机', dataIndex: 'contacts', key: 'contacts', width: 120, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('customer_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

const handleView = (record: Customer) => {
  router.push(`/customers/${encodeURIComponent(record.customer_number)}`)
}

const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.customer_number) { message.warning('请输入客户编号'); return }
  createLoading.value = true
  try {
    const res = await createCustomer(createForm)
    if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '新建失败') }
  } catch { message.error('新建失败') }
  finally { createLoading.value = false }
}

const handleEdit = (record: Customer) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  Object.assign(editForm, record)
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateCustomer(editForm.customer_number, editForm)
    if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '修改失败') }
  } catch { message.error('修改失败') }
  finally { editLoading.value = false }
}

const handleDelete = (record: Customer) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除客户 "${record.customer_name}" 吗？`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteCustomer(record.customer_number)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// 启用/禁用
const handleToggleCondition = async (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许启用/禁用，请先撤消审核')
    return
  }
  const current = (record.condition || '').trim()
  const newCondition = current === CONDITION_STATUS.ENABLED ? CONDITION_STATUS.DISABLED : CONDITION_STATUS.ENABLED
  Modal.confirm({
    title: `确认${newCondition}`,
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要${newCondition}客户「${(record.customer_name || '').trim()}」吗？`,
    okText: '确定',
    okType: newCondition === CONDITION_STATUS.DISABLED ? 'danger' : 'primary',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await updateCustomerCondition(record.customer_number, { condition: newCondition })
        if (res.success) { message.success(`已${newCondition}`); fetchData() }
        else { message.error(res.message || '操作失败') }
      } catch { message.error('操作失败') }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveCustomer(record.customer_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消客户「${(record.customer_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawCustomer(record.customer_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

const handleExport = async () => {
  try {
    const res = await exportCustomers()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = generateExportFilename('customers'); link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    importLoading.value = true
    const formData = new FormData()
    formData.append('file', file)
    const res = await importCustomers(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { importLoading.value = false; target.value = '' }
}

onMounted(() => {
  loadColumnPreference()
  fetchData()
  loadSalesUsers()
  loadFactories()
})
</script>

<template>
  <div class="customer-page">
    <a-card title="客户管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索客户编号/名称/联系人" style="width: 260px" allow-clear @search="handleSearch" @pressEnter="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick" :loading="importLoading"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" :row-selection="rowSelection"
        :scroll="{ x: 'max-content', y: 'calc(100vh - 280px)' }" row-key="customer_number" size="middle" bordered @change="handleTableChange" @resizeColumn="handleResizeColumn">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'condition'">
            <a-tag :color="(record.condition || '').trim() === CONDITION_STATUS.ENABLED ? 'green' : 'red'">{{ (record.condition || '').trim() || CONDITION_STATUS.ENABLED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleView(record)">
                查看
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-item @click="handleEdit(record)">编辑</a-menu-item>
                    <a-menu-item @click="handleToggleCondition(record)">
                      {{ (record.condition || '').trim() === CONDITION_STATUS.ENABLED ? CONDITION_STATUS.DISABLED : CONDITION_STATUS.ENABLED }}
                    </a-menu-item>
                    <a-menu-divider />
                    <a-menu-item @click="handleDelete(record)">
                      <span style="color: #ff4d4f">删除</span>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建客户" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="1100px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" class="compact-form">
        <a-divider orientation="left" style="margin: 8px 0 12px">基本信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="客户编号" required><a-input v-model:value="createForm.customer_number" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="客户名称"><a-input v-model:value="createForm.customer_name" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="分类"><a-input v-model:value="createForm.classification" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="币种代码"><a-input v-model:value="createForm.currency_code" placeholder="如 CNY" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="国家代码"><a-input v-model:value="createForm.country_code" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="国家名称"><a-input v-model:value="createForm.country" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="行业"><a-input v-model:value="createForm.industry" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="销售负责人"><a-select v-model:value="createForm.head_of_sales_id" placeholder="请选择" allow-clear show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())" @change="(val: number) => handleHeadOfSalesSelect(createForm, val)"><a-select-option v-for="u in salesUserList" :key="u.id" :value="u.id" :label="u.real_name">{{ u.real_name }}</a-select-option></a-select></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="销售税率"><a-input-number v-model:value="createForm.sales_tax_rate" :precision="4" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="付款条件"><a-input v-model:value="createForm.payment_terms" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所属工厂"><a-select v-model:value="createForm.factory_id" placeholder="请选择" allow-clear><a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option></a-select></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">地址信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="所在地区1"><a-input v-model:value="createForm.region" placeholder="如：中国" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所在地区2"><a-input v-model:value="createForm.region2" placeholder="如：安徽省" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所在地区3"><a-input v-model:value="createForm.region3" placeholder="如：合肥市" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所在地区4"><a-input v-model:value="createForm.region4" placeholder="如：肥西县" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="18"><a-form-item label="详细地址" :label-col="{ span: 3 }" :wrapper-col="{ span: 21 }"><a-input v-model:value="createForm.detail_address" placeholder="请输入详细地址" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="邮编"><a-input v-model:value="createForm.zip_code" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">联系信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="联系人"><a-input v-model:value="createForm.linkman" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="区号"><a-input v-model:value="createForm.area_code" placeholder="如 86" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="电话"><a-input v-model:value="createForm.telephone" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="手机"><a-input v-model:value="createForm.contacts" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="传真"><a-input v-model:value="createForm.fax" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="E-mail"><a-input v-model:value="createForm.email" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 20 }"><a-input v-model:value="createForm.contact_remark" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">开票信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="开户名称"><a-input v-model:value="createForm.bank_account_name" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="开户银行"><a-input v-model:value="createForm.bank_name" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="银行账号"><a-input v-model:value="createForm.bank_account_number" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="发票抬头"><a-input v-model:value="createForm.invoice_title" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="纳税人识别码"><a-input v-model:value="createForm.tax_id" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="开票电话"><a-input v-model:value="createForm.invoice_phone" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="开票地址" :label-col="{ span: 4 }" :wrapper-col="{ span: 20 }"><a-input v-model:value="createForm.invoice_address" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" title="修改客户" :confirm-loading="editLoading" @ok="handleEditSubmit" width="1100px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" class="compact-form">
        <a-divider orientation="left" style="margin: 8px 0 12px">基本信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="客户编号"><a-input v-model:value="editForm.customer_number" disabled /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="客户名称"><a-input v-model:value="editForm.customer_name" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="分类"><a-input v-model:value="editForm.classification" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="币种代码"><a-input v-model:value="editForm.currency_code" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="国家代码"><a-input v-model:value="editForm.country_code" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="国家名称"><a-input v-model:value="editForm.country" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="行业"><a-input v-model:value="editForm.industry" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="销售负责人"><a-select v-model:value="editForm.head_of_sales_id" placeholder="请选择" allow-clear show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())" @change="(val: number) => handleHeadOfSalesSelect(editForm, val)"><a-select-option v-for="u in salesUserList" :key="u.id" :value="u.id" :label="u.real_name">{{ u.real_name }}</a-select-option></a-select></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="销售税率"><a-input-number v-model:value="editForm.sales_tax_rate" :precision="4" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="付款条件"><a-input v-model:value="editForm.payment_terms" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所属工厂"><a-select v-model:value="editForm.factory_id" placeholder="请选择" allow-clear><a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option></a-select></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">地址信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="所在地区1"><a-input v-model:value="editForm.region" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所在地区2"><a-input v-model:value="editForm.region2" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所在地区3"><a-input v-model:value="editForm.region3" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所在地区4"><a-input v-model:value="editForm.region4" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="18"><a-form-item label="详细地址" :label-col="{ span: 3 }" :wrapper-col="{ span: 21 }"><a-input v-model:value="editForm.detail_address" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="邮编"><a-input v-model:value="editForm.zip_code" /></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">联系信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="联系人"><a-input v-model:value="editForm.linkman" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="区号"><a-input v-model:value="editForm.area_code" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="电话"><a-input v-model:value="editForm.telephone" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="手机"><a-input v-model:value="editForm.contacts" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="传真"><a-input v-model:value="editForm.fax" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="E-mail"><a-input v-model:value="editForm.email" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 20 }"><a-input v-model:value="editForm.contact_remark" /></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">开票信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="开户名称"><a-input v-model:value="editForm.bank_account_name" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="开户银行"><a-input v-model:value="editForm.bank_name" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="银行账号"><a-input v-model:value="editForm.bank_account_number" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="发票抬头"><a-input v-model:value="editForm.invoice_title" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="纳税人识别码"><a-input v-model:value="editForm.tax_id" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="开票电话"><a-input v-model:value="editForm.invoice_phone" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="开票地址" :label-col="{ span: 4 }" :wrapper-col="{ span: 20 }"><a-input v-model:value="editForm.invoice_address" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
.customer-page { padding: 0; }
.compact-form :deep(.ant-form-item) { margin-bottom: 8px; }
</style>
