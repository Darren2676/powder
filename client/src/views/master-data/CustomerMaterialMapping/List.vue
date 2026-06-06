<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, PlusOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons-vue'
import {
  getCustomerMaterialMappings,
  createCustomerMaterialMapping,
  updateCustomerMaterialMapping,
  deleteCustomerMaterialMapping,
  approveCustomerMaterialMapping,
  withdrawCustomerMaterialMapping,
  exportCustomerMaterialMappings,
  importCustomerMaterialMappings
} from '@/api/master-data/customerMaterialMapping'
import { getCustomers } from '@/api/master-data/customer'
import { getItems } from '@/api/master-data/itemMaster'
import { getFactories } from '@/api/system/factory'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getCustomerMaterialMappings)

const defaultDataColumns: any[] = [
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 120, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 200, resizable: true },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 180, resizable: true },
  { title: '物料规格', dataIndex: 'specifications', key: 'specifications', width: 300, resizable: true },
  { title: '客户物料号', dataIndex: 'customer_item_number', key: 'customer_item_number', width: 150, resizable: true },
  { title: '客户物料描述', dataIndex: 'customer_item_description', key: 'customer_item_description', width: 200, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('customer_material_mapping_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

// ==================== 导出 ====================
const handleExport = async () => {
  try {
    const res = await exportCustomerMaterialMappings()
    const blob = new Blob([res.data as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('customer_material_mappings')
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch {
    message.error('导出失败')
  }
}

// ==================== 导入 ====================
const importLoading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const handleImportClick = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    importLoading.value = true
    const formData = new FormData()
    formData.append('file', file)
    const res: any = await importCustomerMaterialMappings(formData)
    if (res.success) {
      message.success(res.message || '导入成功')
      fetchData()
    } else {
      message.error(res.message || '导入失败')
    }
  } catch {
    message.error('导入失败')
  } finally {
    importLoading.value = false
    target.value = ''
  }
}

// ==================== 新增/编辑弹窗 ====================
const modalVisible = ref(false)
const modalTitle = ref('新增')
const editingId = ref<number | null>(null)
const saving = ref(false)

const form = reactive({
  customer_number: '',
  customer_name: '',
  item_number: '',
  item_name: '',
  specifications: '',
  customer_item_number: '',
  customer_item_description: '',
  remark: '',
  factory_id: null as number | null
})

const resetForm = () => {
  form.customer_number = ''
  form.customer_name = ''
  form.item_number = ''
  form.item_name = ''
  form.specifications = ''
  form.customer_item_number = ''
  form.customer_item_description = ''
  form.remark = ''
  form.factory_id = null
}

const handleAdd = () => {
  editingId.value = null
  modalTitle.value = '新增客户物料对照'
  resetForm()
  modalVisible.value = true
}

const handleEdit = (record: any) => {
  if (((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED)) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  editingId.value = record.id
  modalTitle.value = '编辑客户物料对照'
  form.customer_number = record.customer_number
  form.customer_name = record.customer_name
  form.item_number = record.item_number
  form.item_name = record.item_name
  form.specifications = record.specifications
  form.customer_item_number = record.customer_item_number
  form.customer_item_description = record.customer_item_description
  form.remark = record.remark
  form.factory_id = record.factory_id ?? null
  modalVisible.value = true
}

const handleSave = async () => {
  if (!form.customer_number || !form.item_number) {
    message.warning('客户编号和物料编号为必填项')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      const res: any = await updateCustomerMaterialMapping(editingId.value, { ...form })
      if (res?.success) { message.success('更新成功'); modalVisible.value = false; fetchData() }
    } else {
      const res: any = await createCustomerMaterialMapping({ ...form })
      if (res?.success) { message.success('创建成功'); modalVisible.value = false; fetchData() }
    }
  } catch {
    // error handled by interceptor
  } finally {
    saving.value = false
  }
}

const handleDelete = (record: any) => {
  if (((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED)) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除客户 "${record.customer_name}" 的物料对照 "${record.customer_item_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteCustomerMaterialMapping(record.id)
        if (res?.success) { message.success('删除成功'); fetchData() }
      } catch { /* handled */ }
    }
  })
}

// ==================== 审核/撤消 ====================
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveCustomerMaterialMapping(record.id)
    if (res?.success) { message.success('审核成功'); fetchData() }
    else { message.error(res?.message || '审核失败') }
  } catch { message.error('审核失败') }
}

const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消客户「${(record.customer_name || '').trim()}」物料对照的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawCustomerMaterialMapping(record.id)
        if (res?.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res?.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// ==================== 客户选择 ====================
const customerOptions = ref<any[]>([])
const customerSearching = ref(false)

const handleCustomerSearch = async (val: string) => {
  if (!val || val.length < 1) { customerOptions.value = []; return }
  customerSearching.value = true
  try {
    const res: any = await getCustomers({ page: 1, limit: 20, search: val })
    if (res?.success) {
      customerOptions.value = (res.data.items || []).map((c: any) => ({
        value: c.customer_number,
        label: `${c.customer_number} - ${c.customer_name}`,
        name: c.customer_name
      }))
    }
  } catch { /* ignore */ } finally {
    customerSearching.value = false
  }
}

const handleCustomerSelect = (_val: string, option: any) => {
  form.customer_name = option.name || ''
}

// ==================== 物料选择 ====================
const itemOptions = ref<any[]>([])
const itemSearching = ref(false)

const handleItemSearch = async (val: string) => {
  if (!val || val.length < 1) { itemOptions.value = []; return }
  itemSearching.value = true
  try {
    const res: any = await getItems({ page: 1, limit: 20, search: val })
    if (res?.success) {
      itemOptions.value = (res.data.items || []).map((m: any) => ({
        value: m.item_number,
        label: `${m.item_number} - ${m.item_name}`,
        name: m.item_name,
        specifications: m.specifications || ''
      }))
    }
  } catch { /* ignore */ } finally {
    itemSearching.value = false
  }
}

const handleItemSelect = (_val: string, option: any) => {
  form.item_name = option.name || ''
  form.specifications = option.specifications || ''
}

const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch (e) { /* ignore */ }
}

onMounted(() => {
  loadColumnPreference()
  fetchData()
  loadFactories()
})
</script>

<template>
  <div class="customer-material-mapping-page">
    <a-card title="客户物料对照表" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索客户编号/名称/物料编号/名称/客户物料号"
            style="width: 360px"
            allow-clear
            @search="handleSearch"
            @pressEnter="handleSearch"
          />
          <a-button @click="handleReset">
            <template #icon><ReloadOutlined /></template>
            重置
          </a-button>
          <a-button @click="handleExport">
            <template #icon><DownloadOutlined /></template>
            导出
          </a-button>
          <a-button @click="handleImportClick" :loading="importLoading">
            <template #icon><UploadOutlined /></template>
            导入
          </a-button>
          <a-button @click="openColumnSetting">
            <template #icon><SettingOutlined /></template>
            列设置
          </a-button>
          <a-button type="primary" @click="handleAdd">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :row-selection="rowSelection"
        :scroll="{ x: 'max-content', y: 'calc(100vh - 280px)' }"
        row-key="id"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">
                编辑
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

    <!-- 新增/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="modalTitle"
      :confirm-loading="saving"
      ok-text="保存"
      cancel-text="取消"
      width="680px"
      @ok="handleSave"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 17 }" style="margin-top: 16px">
        <a-form-item label="客户编号" required>
          <a-auto-complete
            v-model:value="form.customer_number"
            :options="customerOptions"
            placeholder="输入客户编号或名称搜索"
            @search="handleCustomerSearch"
            @select="handleCustomerSelect"
            :filter-option="false"
          />
        </a-form-item>
        <a-form-item label="客户名称">
          <a-input v-model:value="form.customer_name" placeholder="选择客户后自动填充" />
        </a-form-item>
        <a-form-item label="物料编号" required>
          <a-auto-complete
            v-model:value="form.item_number"
            :options="itemOptions"
            placeholder="输入物料编号或名称搜索"
            @search="handleItemSearch"
            @select="handleItemSelect"
            :filter-option="false"
          />
        </a-form-item>
        <a-form-item label="物料名称">
          <a-input v-model:value="form.item_name" placeholder="选择物料后自动填充" />
        </a-form-item>
        <a-form-item label="物料规格">
          <a-input v-model:value="form.specifications" placeholder="选择物料后自动填充" />
        </a-form-item>
        <a-form-item label="客户物料号">
          <a-input v-model:value="form.customer_item_number" placeholder="请输入客户物料号" />
        </a-form-item>
        <a-form-item label="客户物料描述">
          <a-input v-model:value="form.customer_item_description" placeholder="请输入客户物料描述" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="2" placeholder="请输入备注" />
        </a-form-item>
        <a-form-item label="所属工厂">
          <a-select v-model:value="form.factory_id" placeholder="请选择" allow-clear>
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
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
.customer-material-mapping-page {
  padding: 0;
}
</style>
