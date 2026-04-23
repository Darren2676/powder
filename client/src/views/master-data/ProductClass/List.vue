<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, DownOutlined } from '@ant-design/icons-vue'
import { getProductClasses, createProductClass, updateProductClass, deleteProductClass, exportProductClasses, importProductClasses, approveProductClass, withdrawProductClass } from '@/api/master-data/productClass'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

interface ProductClass {
  product_class_number: string
  product_class_name: string
  remark: string
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<ProductClass>(getProductClasses)

const emptyForm = (): ProductClass => ({
  product_class_number: '',
  product_class_name: '',
  remark: ''
})

const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<ProductClass>(emptyForm())

const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<ProductClass>(emptyForm())

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '产品分类编号', dataIndex: 'product_class_number', key: 'product_class_number', width: 160 },
  { title: '产品分类名称', dataIndex: 'product_class_name', key: 'product_class_name', width: 200 },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const handleCreate = () => { Object.assign(createForm, emptyForm()); createModalVisible.value = true }
const handleCreateSubmit = async () => {
  if (!createForm.product_class_number) { message.warning('请输入产品分类编号'); return }
  createLoading.value = true
  try {
    const res = await createProductClass(createForm)
    if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '新建失败') }
  } catch { message.error('新建失败') } finally { createLoading.value = false }
}

const handleEdit = (record: ProductClass) => { Object.assign(editForm, record); editModalVisible.value = true }
const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateProductClass(editForm.product_class_number, editForm)
    if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '修改失败') }
  } catch { message.error('修改失败') } finally { editLoading.value = false }
}

const handleDelete = (record: ProductClass) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除产品分类 "${record.product_class_name}" 吗？`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteProductClass(record.product_class_number)
        if (res.success) { message.success('删除成功'); fetchData() } else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveProductClass(record.product_class_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消产品分类「${(record.product_class_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawProductClass(record.product_class_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

const fileInputRef = ref<HTMLInputElement>()
const handleExport = async () => {
  try {
    const res = await exportProductClasses(searchText.value || undefined)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('product_class'); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}
const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try {
    const formData = new FormData(); formData.append('file', file)
    const res = await importProductClasses(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() } else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') } finally { target.value = '' }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div>
    <a-card title="产品分类管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索编号/名称" style="width: 240px" allow-clear @search="handleSearch" @pressEnter="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建</a-button>
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" :scroll="{ x: 700, y: 'calc(100vh - 280px)' }" row-key="product_class_number" :row-selection="rowSelection" size="middle" bordered @change="handleTableChange">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">修改</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-item @click="handleDelete(record)">删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="editModalVisible" title="修改产品分类" :confirm-loading="editLoading" @ok="handleEditSubmit" width="500px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="产品分类编号"><a-input v-model:value="editForm.product_class_number" disabled /></a-form-item>
        <a-form-item label="产品分类名称"><a-input v-model:value="editForm.product_class_name" /></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="editForm.remark" :rows="3" /></a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="createModalVisible" title="新建产品分类" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="500px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="产品分类编号" required><a-input v-model:value="createForm.product_class_number" placeholder="请输入产品分类编号" /></a-form-item>
        <a-form-item label="产品分类名称"><a-input v-model:value="createForm.product_class_name" placeholder="请输入产品分类名称" /></a-form-item>
        <a-form-item label="备注"><a-textarea v-model:value="createForm.remark" :rows="3" placeholder="请输入备注" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>
