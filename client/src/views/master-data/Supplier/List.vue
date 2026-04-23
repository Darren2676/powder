<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, PlusOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier, exportSuppliers, importSuppliers, updateSupplierCondition, approveSupplier, withdrawSupplier } from '@/api/master-data/supplier'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

const router = useRouter()

interface Supplier {
  supplier_number: string
  supplier_name: string
  classification: string
  country: string
  currency_code: string
  purchase_tax_rate: number
  industry: string
  supplier_manager: string
  procurement_manager: string
  linkman: string
  mobile: string
  contacts: string
  region: string
  detail_address: string
  zip_code: string
  telephone: string
  fax: string
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
  condition: string
}

const emptyForm = (): Supplier => ({
  supplier_number: '', supplier_name: '', classification: '', country: '', currency_code: '',
  purchase_tax_rate: 0, industry: '', supplier_manager: '', procurement_manager: '',
  linkman: '', mobile: '', contacts: '', region: '', detail_address: '', zip_code: '',
  telephone: '', fax: '', email: '', contact_remark: '',
  bank_account_name: '', bank_name: '', bank_account_number: '',
  invoice_address: '', invoice_phone: '', invoice_title: '', tax_id: '', payment_terms: '', condition: CONDITION_STATUS.ENABLED
})

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Supplier>(getSuppliers)

const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Supplier>(emptyForm())

const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Supplier>(emptyForm())

const importLoading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const defaultDataColumns: any[] = [
  { title: '供应商编号', dataIndex: 'supplier_number', key: 'supplier_number', width: 120, resizable: true },
  { title: '供应商名称', dataIndex: 'supplier_name', key: 'supplier_name', width: 200, resizable: true },
  { title: '状态', dataIndex: 'condition', key: 'condition', width: 80, resizable: true },
  { title: '分类', dataIndex: 'classification', key: 'classification', width: 80, resizable: true },
  { title: '供应商负责人', dataIndex: 'supplier_manager', key: 'supplier_manager', width: 120, resizable: true },
  { title: '联系人', dataIndex: 'linkman', key: 'linkman', width: 100, resizable: true },
  { title: '联系方式', dataIndex: 'contacts', key: 'contacts', width: 120, resizable: true },
  { title: '电话', dataIndex: 'telephone', key: 'telephone', width: 120, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('supplier_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

const handleView = (record: Supplier) => { router.push(`/suppliers/${encodeURIComponent(record.supplier_number)}`) }

const handleCreate = () => { Object.assign(createForm, emptyForm()); createModalVisible.value = true }
const handleCreateSubmit = async () => {
  if (!createForm.supplier_number) { message.warning('请输入供应商编号'); return }
  createLoading.value = true
  try { const res = await createSupplier(createForm); if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() } else { message.error(res.message || '新建失败') } }
  catch { message.error('新建失败') } finally { createLoading.value = false }
}

const handleEdit = (record: Supplier) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  Object.assign(editForm, { ...emptyForm(), ...record }); editModalVisible.value = true
}
const handleEditSubmit = async () => {
  editLoading.value = true
  try { const res = await updateSupplier(editForm.supplier_number, editForm); if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() } else { message.error(res.message || '修改失败') } }
  catch { message.error('修改失败') } finally { editLoading.value = false }
}

const handleDelete = (record: Supplier) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({ title: '确认删除', icon: createVNode(ExclamationCircleOutlined), content: `确定要删除供应商 "${record.supplier_name}" 吗？`, okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() { try { const res = await deleteSupplier(record.supplier_number); if (res.success) { message.success('删除成功'); fetchData() } else { message.error(res.message || '删除失败') } } catch { message.error('删除失败') } }
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
    content: `确定要${newCondition}供应商「${(record.supplier_name || '').trim()}」吗？`,
    okText: '确定',
    okType: newCondition === CONDITION_STATUS.DISABLED ? 'danger' : 'primary',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await updateSupplierCondition(record.supplier_number, { condition: newCondition })
        if (res.success) { message.success(`已${newCondition}`); fetchData() }
        else { message.error(res.message || '操作失败') }
      } catch { message.error('操作失败') }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveSupplier(record.supplier_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消供应商「${(record.supplier_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawSupplier(record.supplier_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

const handleExport = async () => {
  try { const res = await exportSuppliers(); const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const url = window.URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = generateExportFilename('suppliers'); link.click(); window.URL.revokeObjectURL(url); message.success('导出成功') }
  catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try { importLoading.value = true; const fd = new FormData(); fd.append('file', file); const res = await importSuppliers(fd); if (res.success) { message.success(res.message || '导入成功'); fetchData() } else { message.error(res.message || '导入失败') } }
  catch { message.error('导入失败') } finally { importLoading.value = false; target.value = '' }
}

onMounted(() => {
  loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div class="supplier-page">
    <a-card title="供应商管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索供应商编号/名称/联系人" style="width: 260px" allow-clear @search="handleSearch" @pressEnter="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick" :loading="importLoading"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>
      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" :row-selection="rowSelection" :scroll="{ x: 'max-content', y: 'calc(100vh - 280px)' }" row-key="supplier_number" size="middle" bordered @change="handleTableChange" @resizeColumn="handleResizeColumn">
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
    <a-modal v-model:open="createModalVisible" title="新建供应商" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="1100px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" class="compact-form">
        <a-divider orientation="left" style="margin: 8px 0 12px">基本信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="供应商编号" required><a-input v-model:value="createForm.supplier_number" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="供应商名称"><a-input v-model:value="createForm.supplier_name" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="分类"><a-input v-model:value="createForm.classification" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="币种代码"><a-input v-model:value="createForm.currency_code" placeholder="如 CNY" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="国家/地区"><a-input v-model:value="createForm.country" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="行业"><a-input v-model:value="createForm.industry" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="供应商负责人"><a-input v-model:value="createForm.supplier_manager" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="采购经理"><a-input v-model:value="createForm.procurement_manager" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="采购税率"><a-input-number v-model:value="createForm.purchase_tax_rate" :precision="4" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="付款条件"><a-input v-model:value="createForm.payment_terms" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">联系信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="联系人"><a-input v-model:value="createForm.linkman" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="手机"><a-input v-model:value="createForm.mobile" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="电话"><a-input v-model:value="createForm.telephone" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="传真"><a-input v-model:value="createForm.fax" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="E-mail"><a-input v-model:value="createForm.email" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所在地区"><a-input v-model:value="createForm.region" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="邮编"><a-input v-model:value="createForm.zip_code" placeholder="请输入" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="18"><a-form-item label="详细地址" :label-col="{ span: 3 }" :wrapper-col="{ span: 21 }"><a-input v-model:value="createForm.detail_address" placeholder="请输入" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="备注"><a-input v-model:value="createForm.contact_remark" placeholder="请输入" /></a-form-item></a-col>
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
    <a-modal v-model:open="editModalVisible" title="修改供应商" :confirm-loading="editLoading" @ok="handleEditSubmit" width="1100px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }" class="compact-form">
        <a-divider orientation="left" style="margin: 8px 0 12px">基本信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="供应商编号"><a-input v-model:value="editForm.supplier_number" disabled /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="供应商名称"><a-input v-model:value="editForm.supplier_name" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="分类"><a-input v-model:value="editForm.classification" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="币种代码"><a-input v-model:value="editForm.currency_code" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="国家/地区"><a-input v-model:value="editForm.country" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="行业"><a-input v-model:value="editForm.industry" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="供应商负责人"><a-input v-model:value="editForm.supplier_manager" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="采购经理"><a-input v-model:value="editForm.procurement_manager" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="采购税率"><a-input-number v-model:value="editForm.purchase_tax_rate" :precision="4" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="付款条件"><a-input v-model:value="editForm.payment_terms" /></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">联系信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="联系人"><a-input v-model:value="editForm.linkman" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="手机"><a-input v-model:value="editForm.mobile" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="电话"><a-input v-model:value="editForm.telephone" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="传真"><a-input v-model:value="editForm.fax" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="6"><a-form-item label="E-mail"><a-input v-model:value="editForm.email" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="所在地区"><a-input v-model:value="editForm.region" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="邮编"><a-input v-model:value="editForm.zip_code" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="18"><a-form-item label="详细地址" :label-col="{ span: 3 }" :wrapper-col="{ span: 21 }"><a-input v-model:value="editForm.detail_address" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="备注"><a-input v-model:value="editForm.contact_remark" /></a-form-item></a-col>
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
.supplier-page { padding: 0; }
.compact-form :deep(.ant-form-item) { margin-bottom: 8px; }
</style>
