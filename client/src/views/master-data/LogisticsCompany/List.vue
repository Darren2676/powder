<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  PlusOutlined,
  DownloadOutlined,
  UploadOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  PaperClipOutlined
} from '@ant-design/icons-vue'
import type { UploadChangeParam } from 'ant-design-vue'
import {
  getLogisticsCompanies,
  getLogisticsCompanyDetail,
  createLogisticsCompany,
  updateLogisticsCompany,
  deleteLogisticsCompany,
  updateLogisticsCompanyCondition,
  approveLogisticsCompany,
  withdrawLogisticsCompany,
  uploadLogisticsCompanyAttachment,
  downloadLogisticsCompanyAttachment,
  removeLogisticsCompanyAttachment,
  exportLogisticsCompanies,
  importLogisticsCompanies
} from '@/api/master-data/logisticsCompany'
import { getFactories } from '@/api/system/factory'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getLogisticsCompanies)

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

const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '编号', dataIndex: 'company_number', key: 'company_number', width: 120, resizable: true },
  { title: '公司名称', dataIndex: 'company_name', key: 'company_name', width: 200, resizable: true },
  { title: '联系人', dataIndex: 'contact_person', key: 'contact_person', width: 120, resizable: true },
  { title: '手机', dataIndex: 'mobile', key: 'mobile', width: 140, resizable: true },
  { title: '电话', dataIndex: 'telephone', key: 'telephone', width: 140, resizable: true },
  { title: '状态', dataIndex: 'condition', key: 'condition', width: 80, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('logistics_company_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

// ==================== 弹窗 ====================
const modalVisible = ref(false)
const modalTitle = ref('新建物流公司')
const isEdit = ref(false)
const saving = ref(false)
const form = reactive({
  company_number: '',
  company_name: '',
  contact_person: '',
  mobile: '',
  telephone: '',
  remark: '',
  factory_id: null as number | null,
  attachments: [] as any[]
})
const editingNumber = ref('')

const resetForm = () => {
  form.company_number = ''
  form.company_name = ''
  form.contact_person = ''
  form.mobile = ''
  form.telephone = ''
  form.remark = ''
  form.factory_id = null
  form.attachments = []
}

// ==================== 新建 ====================
const handleCreate = () => {
  modalTitle.value = '新建物流公司'
  isEdit.value = false
  resetForm()
  form.company_number = '(自动生成)'
  editingNumber.value = ''
  modalVisible.value = true
}

// ==================== 编辑 ====================
const handleEdit = async (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  modalTitle.value = '编辑物流公司'
  isEdit.value = true
  try {
    const res: any = await getLogisticsCompanyDetail(record.company_number)
    if (res.success) {
      const d = res.data
      Object.assign(form, {
        company_number: d.company_number,
        company_name: d.company_name?.trim() || '',
        contact_person: d.contact_person?.trim() || '',
        mobile: d.mobile?.trim() || '',
        telephone: d.telephone?.trim() || '',
        remark: d.remark?.trim() || '',
        factory_id: d.factory_id || null,
        attachments: d.attachments || []
      })
      editingNumber.value = d.company_number?.trim()
      modalVisible.value = true
    }
  } catch {
    message.error('获取详情失败')
  }
}

// ==================== 保存 ====================
const handleSave = async () => {
  if (!form.company_name) { message.warning('请输入公司名称'); return }
  saving.value = true
  try {
    const payload = {
      company_name: form.company_name,
      contact_person: form.contact_person,
      mobile: form.mobile,
      telephone: form.telephone,
      remark: form.remark,
      factory_id: form.factory_id
    }
    if (isEdit.value) {
      const res: any = await updateLogisticsCompany(editingNumber.value, payload)
      if (res.success) { message.success('更新成功'); modalVisible.value = false; fetchData() }
    } else {
      const res: any = await createLogisticsCompany(payload)
      if (res.success) { message.success('新建成功'); modalVisible.value = false; fetchData() }
    }
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除物流公司「${(record.company_name || '').trim()}」吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteLogisticsCompany(record.company_number)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// ==================== 启用/禁用 ====================
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
    content: `确定要${newCondition}物流公司「${(record.company_name || '').trim()}」吗？`,
    okText: '确定',
    okType: newCondition === CONDITION_STATUS.DISABLED ? 'danger' : 'primary',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await updateLogisticsCompanyCondition(record.company_number, newCondition)
        if (res.success) { message.success(`已${newCondition}`); fetchData() }
        else { message.error(res.message || '操作失败') }
      } catch { message.error('操作失败') }
    }
  })
}

// ==================== 审核 ====================
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveLogisticsCompany(record.company_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// ==================== 撤消审核 ====================
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消物流公司「${(record.company_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawLogisticsCompany(record.company_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

// ==================== 附件上传 ====================
const handleAttachmentUpload = async (info: UploadChangeParam) => {
  if (!editingNumber.value) { message.warning('请先保存后再上传附件'); return }
  const file = info.file as any
  if (file.status === 'uploading') return
  const formData = new FormData()
  formData.append('file', file.originFileObj || file)
  try {
    const res: any = await uploadLogisticsCompanyAttachment(editingNumber.value, formData)
    if (res.success) {
      message.success('上传成功')
      const detailRes: any = await getLogisticsCompanyDetail(editingNumber.value)
      if (detailRes.success) { form.attachments = detailRes.data.attachments || [] }
    }
  } catch {
    message.error('上传失败')
  }
}

// ==================== 附件下载 ====================
const handleAttachmentDownload = async (att: any) => {
  try {
    const res: any = await downloadLogisticsCompanyAttachment(att.id)
    const blob = new Blob([res.data])
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = att.file_name
    a.click()
    window.URL.revokeObjectURL(url)
  } catch {
    message.error('下载失败')
  }
}

// ==================== 附件删除 ====================
const handleAttachmentDelete = async (att: any) => {
  try {
    const res: any = await removeLogisticsCompanyAttachment(att.id)
    if (res.success) {
      message.success('删除成功')
      form.attachments = form.attachments.filter((a: any) => a.id !== att.id)
    }
  } catch {
    message.error('删除附件失败')
  }
}

// ==================== 格式化文件大小 ====================
const formatFileSize = (size: number) => {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// ==================== 导出 ====================
const handleExport = async () => {
  try {
    const res: any = await exportLogisticsCompanies({ search: searchText.value })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('logistics_companies')
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

const handleImportClick = () => { fileInputRef.value?.click() }

const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    importLoading.value = true
    const formData = new FormData()
    formData.append('file', file)
    const res: any = await importLogisticsCompanies(formData)
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

onMounted(() => {
  loadColumnPreference()
  fetchData()
  loadFactories()
})
</script>

<template>
  <div class="logistics-company-page">
    <a-card title="物流公司管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索编号/名称/联系人"
            style="width: 260px"
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
          <a-button type="primary" @click="handleCreate">
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
        row-key="company_number"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'company_number'">
            {{ (record.company_number || '').trim() }}
          </template>
          <template v-else-if="column.key === 'company_name'">
            {{ (record.company_name || '').trim() }}
          </template>
          <template v-else-if="column.key === 'contact_person'">
            {{ (record.contact_person || '').trim() }}
          </template>
          <template v-else-if="column.key === 'mobile'">
            {{ (record.mobile || '').trim() }}
          </template>
          <template v-else-if="column.key === 'telephone'">
            {{ (record.telephone || '').trim() }}
          </template>
          <template v-else-if="column.key === 'condition'">
            <a-tag :color="(record.condition || '').trim() === CONDITION_STATUS.ENABLED ? 'green' : 'red'">
              {{ (record.condition || '').trim() || CONDITION_STATUS.ENABLED }}
            </a-tag>
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

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="modalTitle"
      :confirm-loading="saving"
      @ok="handleSave"
      width="800px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 17 }" style="margin-top: 16px">
        <a-divider orientation="left" style="margin: 8px 0 12px">基本信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="编号">
              <span style="line-height: 32px; color: #666;">{{ form.company_number }}</span>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="公司名称" required>
              <a-input v-model:value="form.company_name" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="所属工厂">
              <a-select v-model:value="form.factory_id" placeholder="请选择" allow-clear>
                <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="12">
          <a-col :span="8">
            <a-form-item label="联系人">
              <a-input v-model:value="form.contact_person" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="手机">
              <a-input v-model:value="form.mobile" placeholder="请输入" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="电话">
              <a-input v-model:value="form.telephone" placeholder="请输入" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 8px 0 12px">备注信息</a-divider>
        <a-row :gutter="12">
          <a-col :span="24">
            <a-form-item label="备注说明" :label-col="{ span: 2 }" :wrapper-col="{ span: 22 }">
              <a-textarea v-model:value="form.remark" placeholder="请输入" :rows="3" />
            </a-form-item>
          </a-col>
        </a-row>
        <!-- 附件 (编辑模式才显示上传功能) -->
        <a-divider orientation="left" style="margin: 8px 0 12px">附件</a-divider>
        <div style="padding: 0 12px;">
          <div v-if="isEdit">
            <a-upload
              :show-upload-list="false"
              :custom-request="() => {}"
              @change="handleAttachmentUpload"
            >
              <a-button size="small">
                <UploadOutlined /> 上传
              </a-button>
            </a-upload>
            <div v-if="form.attachments.length > 0" style="margin-top: 8px;">
              <div
                v-for="att in form.attachments"
                :key="att.id"
                style="display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f0f0f0;"
              >
                <PaperClipOutlined style="color: #999;" />
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  {{ att.file_name }}
                </span>
                <span style="color: #999; font-size: 12px;">{{ formatFileSize(att.file_size) }}</span>
                <a-button type="link" size="small" @click="handleAttachmentDownload(att)">下载</a-button>
                <a-button type="link" size="small" danger @click="handleAttachmentDelete(att)">删除</a-button>
              </div>
            </div>
          </div>
          <div v-else style="color: #999; font-size: 13px;">保存后可上传附件</div>
        </div>
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
.logistics-company-page {
  padding: 0;
}
</style>
