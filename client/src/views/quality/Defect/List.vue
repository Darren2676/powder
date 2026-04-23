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
import { getDefects, createDefect, updateDefect, deleteDefect, exportDefects, importDefects, approveDefect, withdrawDefect } from '@/api/quality/defect'
import { getDefectClasses } from '@/api/quality/defectClass'
import { getDefectReasons } from '@/api/quality/defectReason'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'
interface Defect {
  defect_number: string
  defect_name: string
  defect_class_number: string
  defect_class_name: string
  defect_reason_name: string
  defect_level: string
}

const {
  loading, dataSource, searchText, selectedRowKeys,
  pagination, rowSelection, fetchData,
  handleTableChange, handleSearch, handleReset
} = useTableList<Defect>(getDefects)

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const emptyForm = (): Defect => ({ defect_number: '', defect_name: '', defect_class_number: '', defect_class_name: '', defect_reason_name: '', defect_level: '' })
const editForm = reactive<Defect>(emptyForm())
const createForm = reactive<Defect>(emptyForm())

const defectClassList = ref<any[]>([])
const defectReasonList = ref<any[]>([])
const fileInputRef = ref<HTMLInputElement>()

const levelOptions = ['A', 'B', 'C', 'D']

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '缺陷编号', dataIndex: 'defect_number', key: 'defect_number', width: 120 },
  { title: '缺陷名称', dataIndex: 'defect_name', key: 'defect_name', width: 150 },
  { title: '缺陷分类编号', dataIndex: 'defect_class_number', key: 'defect_class_number', width: 120 },
  { title: '缺陷分类名称', dataIndex: 'defect_class_name', key: 'defect_class_name', width: 130 },
  { title: '缺陷原因', dataIndex: 'defect_reason_name', key: 'defect_reason_name', width: 150 },
  { title: '缺陷等级', dataIndex: 'defect_level', key: 'defect_level', width: 90 },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 150 }
]

const loadDropdowns = async () => {
  try {
    const [clsRes, rsRes]: any[] = await Promise.all([
      getDefectClasses({ limit: 1000 }),
      getDefectReasons({ limit: 1000 })
    ])
    defectClassList.value = clsRes?.data?.items || []
    defectReasonList.value = rsRes?.data?.items || []
  } catch (e) { console.error('加载下拉数据失败:', e) }
}

const onClassChange = (val: string, form: Defect) => {
  const cls = defectClassList.value.find((c: any) => c.defect_class_number === val)
  form.defect_class_name = cls?.defect_class_name || ''
}

const filterOption = (input: string, option: any) => {
  const label = option.children?.[0]?.children || option.label || ''
  return String(label).toLowerCase().includes(input.toLowerCase())
}

const handleEdit = (record: Defect) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  Object.assign(editForm, record)
  editModalVisible.value = true
}

const handleDelete = (record: Defect) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除缺陷"${record.defect_name}"吗?`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteDefect(record.defect_number); message.success('删除成功'); fetchData() }
      catch (error) { message.error('删除失败') }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveDefect(record.defect_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消缺陷「${(record.defect_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawDefect(record.defect_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

const handleEditOk = async () => {
  try { await updateDefect(editForm.defect_number, editForm); message.success('更新成功'); editModalVisible.value = false; fetchData() }
  catch (error) { message.error('更新失败') }
}

const handleCreateOk = async () => {
  if (!createForm.defect_number) { message.warning('请输入缺陷编号'); return }
  try {
    await createDefect(createForm)
    message.success('创建成功')
    createModalVisible.value = false
    Object.assign(createForm, emptyForm())
    fetchData()
  } catch (error) { message.error('创建失败') }
}

const handleExport = async () => {
  try {
    const res = await exportDefects()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('defects')
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
    await importDefects(formData)
    message.success('导入成功'); fetchData()
  } catch (error) { message.error('导入失败') }
  finally { target.value = '' }
}

onMounted(() => { loadDropdowns(); fetchData() })
</script>

<template>
  <div>
    <a-card title="缺陷管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索缺陷" style="width: 200px" @search="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-selection="rowSelection" row-key="defect_number" :pagination="pagination" :scroll="{ y: 'calc(100vh - 280px)' }" @change="handleTableChange">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
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

    <!-- 编辑模态框 -->
    <a-modal v-model:open="editModalVisible" title="编辑缺陷" @ok="handleEditOk" okText="确认" cancelText="取消" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="缺陷编号"><a-input v-model:value="editForm.defect_number" disabled /></a-form-item>
        <a-form-item label="缺陷名称"><a-input v-model:value="editForm.defect_name" /></a-form-item>
        <a-form-item label="缺陷分类">
          <a-select v-model:value="editForm.defect_class_number" placeholder="选择缺陷分类" allow-clear show-search :filter-option="filterOption" @change="(val: string) => onClassChange(val, editForm)">
            <a-select-option v-for="c in defectClassList" :key="c.defect_class_number" :value="c.defect_class_number">{{ c.defect_class_name }} ({{ c.defect_class_number }})</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="缺陷原因">
          <a-select v-model:value="editForm.defect_reason_name" placeholder="选择缺陷原因" allow-clear show-search :filter-option="filterOption">
            <a-select-option v-for="r in defectReasonList" :key="r.defect_reason_number" :value="r.defect_reason_name">{{ r.defect_reason_name }} ({{ r.defect_reason_number }})</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="缺陷等级">
          <a-select v-model:value="editForm.defect_level" placeholder="选择缺陷等级" allow-clear>
            <a-select-option v-for="l in levelOptions" :key="l" :value="l">{{ l }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建模态框 -->
    <a-modal v-model:open="createModalVisible" title="新建缺陷" @ok="handleCreateOk" okText="确认" cancelText="取消" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="缺陷编号" required><a-input v-model:value="createForm.defect_number" placeholder="请输入缺陷编号" /></a-form-item>
        <a-form-item label="缺陷名称"><a-input v-model:value="createForm.defect_name" placeholder="请输入缺陷名称" /></a-form-item>
        <a-form-item label="缺陷分类">
          <a-select v-model:value="createForm.defect_class_number" placeholder="选择缺陷分类" allow-clear show-search :filter-option="filterOption" @change="(val: string) => onClassChange(val, createForm)">
            <a-select-option v-for="c in defectClassList" :key="c.defect_class_number" :value="c.defect_class_number">{{ c.defect_class_name }} ({{ c.defect_class_number }})</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="缺陷原因">
          <a-select v-model:value="createForm.defect_reason_name" placeholder="选择缺陷原因" allow-clear show-search :filter-option="filterOption">
            <a-select-option v-for="r in defectReasonList" :key="r.defect_reason_number" :value="r.defect_reason_name">{{ r.defect_reason_name }} ({{ r.defect_reason_number }})</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="缺陷等级">
          <a-select v-model:value="createForm.defect_level" placeholder="选择缺陷等级" allow-clear>
            <a-select-option v-for="l in levelOptions" :key="l" :value="l">{{ l }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
