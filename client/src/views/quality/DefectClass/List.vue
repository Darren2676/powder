<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined,
  DownOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined
} from '@ant-design/icons-vue'
import { getDefectClasses, createDefectClass, updateDefectClass, deleteDefectClass, exportDefectClasses, importDefectClasses, approveDefectClass, withdrawDefectClass } from '@/api/quality/defectClass'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'

interface DefectClass {
  defect_class_number: string
  defect_class_name: string
}








const { loading, dataSource, searchText, pagination, selectedRowKeys, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getDefectClasses)

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<DefectClass>({ defect_class_number: '', defect_class_name: '' })
const createForm = reactive<DefectClass>({ defect_class_number: '', defect_class_name: '' })

const fileInputRef = ref<HTMLInputElement>()

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '缺陷分类编号', dataIndex: 'defect_class_number', key: 'defect_class_number', width: 150 },
  { title: '缺陷分类名称', dataIndex: 'defect_class_name', key: 'defect_class_name' },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 150 }
]

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveDefectClass(record.defect_class_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消缺陷分类「${(record.defect_class_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawDefectClass(record.defect_class_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

const handleEditOk = async () => {
  try { await updateDefectClass(editForm.defect_class_number, editForm); message.success('更新成功'); editModalVisible.value = false; fetchData() }
  catch (error) { message.error('更新失败') }
}

const handleCreateOk = async () => {
  if (!createForm.defect_class_number) { message.warning('请输入缺陷分类编号'); return }
  try {
    await createDefectClass(createForm)
    message.success('创建成功')
    createModalVisible.value = false
    Object.assign(createForm, { defect_class_number: '', defect_class_name: '' })
    fetchData()
  } catch (error) { message.error('创建失败') }
}

const handleExport = async () => {
  try {
    const res = await exportDefectClasses()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('defect_classes')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch (error) { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const formData = new FormData()
    formData.append('file', file)
    await importDefectClasses(formData)
    message.success('导入成功')
    fetchData()
  } catch (error) { message.error('导入失败') }
  finally { target.value = '' }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div>
    <a-card title="缺陷分类管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索缺陷分类" style="width: 200px" @search="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-selection="rowSelection" row-key="defect_class_number" :pagination="pagination" :scroll="{ y: 'calc(100vh - 280px)' }" @change="handleTableChange">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
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

    <a-modal v-model:open="editModalVisible" title="编辑缺陷分类" @ok="handleEditOk" okText="确认" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="缺陷分类编号"><a-input v-model:value="editForm.defect_class_number" disabled /></a-form-item>
        <a-form-item label="缺陷分类名称"><a-input v-model:value="editForm.defect_class_name" /></a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="createModalVisible" title="新建缺陷分类" @ok="handleCreateOk" okText="确认" cancelText="取消">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="缺陷分类编号" required><a-input v-model:value="createForm.defect_class_number" placeholder="请输入缺陷分类编号" /></a-form-item>
        <a-form-item label="缺陷分类名称"><a-input v-model:value="createForm.defect_class_name" placeholder="请输入缺陷分类名称" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
