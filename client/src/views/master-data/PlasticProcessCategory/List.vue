<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined,
  SettingOutlined, DownOutlined
} from '@ant-design/icons-vue'
import {
  getPlasticProcessCategories, createPlasticProcessCategory, updatePlasticProcessCategory,
  deletePlasticProcessCategory, exportPlasticProcessCategories, importPlasticProcessCategories,
  approvePlasticProcessCategory, withdrawPlasticProcessCategory
} from '@/api/master-data/plasticProcessCategory'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'
import { useModalDrag } from '@/composables/useModalDrag'

defineOptions({ name: 'PlasticProcessCategoryList' })

interface CategoryForm {
  category_code: string
  category_name: string
  remark: string
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getPlasticProcessCategories)

// 编辑弹窗
const editModalVisible = ref(false)
const { modalStyle: editModalStyle, onDragStart: editDragStart, resetDrag: editResetDrag } = useModalDrag()
const modalLoading = ref(false)
const editingId = ref<number | null>(null)
const editForm = reactive<CategoryForm>({ category_code: '', category_name: '', remark: '' })

// 新增弹窗
const createModalVisible = ref(false)
const { modalStyle: createModalStyle, onDragStart: createDragStart, resetDrag: createResetDrag } = useModalDrag()
const createForm = reactive<CategoryForm>({ category_code: '', category_name: '', remark: '' })

// 详情弹窗
const detailModalVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const detailData = ref<any>({})

const fileInputRef = ref<HTMLInputElement>()

const defaultDataColumns: any[] = [
  { title: '分类编码', dataIndex: 'category_code', key: 'category_code', width: 120, resizable: true },
  { title: '分类名称', dataIndex: 'category_name', key: 'category_name', width: 150, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 200, ellipsis: true, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('plastic_process_category_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 140, fixed: 'right' as const }]
})

// 行号计算
const getRowIndex = (_: any, index: number) => (pagination.current - 1) * pagination.pageSize + index + 1

// 详情
const handleDetail = (record: any) => {
  detailData.value = { ...record }
  detailResetDrag()
  detailModalVisible.value = true
}

// 编辑
const handleEdit = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审批的记录不允许编辑，请先撤审')
    return
  }
  editingId.value = record.id
  Object.assign(editForm, { category_code: record.category_code, category_name: record.category_name, remark: record.remark })
  editResetDrag()
  editModalVisible.value = true
}

const handleEditSave = async () => {
  if (!editForm.category_code) { message.warning('分类编码不能为空'); return }
  if (!editForm.category_name) { message.warning('分类名称不能为空'); return }
  modalLoading.value = true
  try {
    const res: any = await updatePlasticProcessCategory(editingId.value!, { ...editForm })
    if (res.success) { message.success('更新成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '更新失败') }
  } catch { message.error('更新失败') }
  modalLoading.value = false
}

// 新增
const handleCreate = () => {
  Object.assign(createForm, { category_code: '', category_name: '', remark: '' })
  createResetDrag()
  createModalVisible.value = true
}

const handleCreateSave = async () => {
  if (!createForm.category_code) { message.warning('分类编码不能为空'); return }
  if (!createForm.category_name) { message.warning('分类名称不能为空'); return }
  modalLoading.value = true
  try {
    const res: any = await createPlasticProcessCategory({ ...createForm })
    if (res.success) { message.success('创建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '创建失败') }
  } catch { message.error('创建失败') }
  modalLoading.value = false
}

// 删除
const handleDelete = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审批的记录不允许删除，请先撤审')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除分类「${record.category_name}」吗？`,
    okText: '确定',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await deletePlasticProcessCategory(record.id)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// 审批
const handleApprove = async (record: any) => {
  try {
    const res: any = await approvePlasticProcessCategory(record.id)
    if (res.success) { message.success('审批成功'); fetchData() }
    else { message.error(res.message || '审批失败') }
  } catch { message.error('审批失败') }
}

// 撤审
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤审',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消分类「${(record.category_name || '').trim()}」的审批吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawPlasticProcessCategory(record.id)
        if (res.success) { message.success('已撤审'); fetchData() }
        else { message.error(res.message || '撤审失败') }
      } catch { message.error('撤审失败') }
    }
  })
}

// 导出
const handleExport = async () => {
  try {
    const res = await exportPlasticProcessCategories(searchText.value)
    const blob = new Blob([res as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = generateExportFilename('工艺分类')
    a.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

// 导入
const handleImport = () => { fileInputRef.value?.click() }
const onFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const formData = new FormData()
  formData.append('file', file)
  try {
    const res: any = await importPlasticProcessCategories(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  ;(e.target as HTMLInputElement).value = ''
}

onMounted(() => { loadColumnPreference(); fetchData() })
</script>

<template>
  <div style="padding: 0;">
    <a-card :bordered="false" :body-style="{ padding: '16px' }">
      <!-- 标题 + 操作栏 -->
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">工艺分类</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-input-search v-model:value="searchText" placeholder="搜索分类编码/名称" @search="handleSearch" style="width: 220px;" allow-clear @change="(e: any) => !e.target.value && handleReset()" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImport"><template #icon><UploadOutlined /></template>导入</a-button>
          <input type="file" ref="fileInputRef" accept=".xlsx,.xls" style="display: none;" @change="onFileChange" />
          <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新增</a-button>
        </div>
      </div>

      <!-- 数据表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :row-selection="rowSelection"
        :row-key="(record: any) => record.id"
        :scroll="{ x: 'max-content' }"
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
        size="small"
        bordered
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ getRowIndex(record, index) }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="record.approval_status === '已审批' ? 'green' : record.approval_status === '待审批' ? 'orange' : 'default'">
              {{ record.approval_status }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleDetail(record)">查看</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== '已审批'" @click="handleApprove(record)">审批</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤审</a-menu-item>
                    <a-menu-item @click="handleEdit(record)">编辑</a-menu-item>
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

    <!-- 新增弹窗 -->
    <a-modal
      v-model:open="createModalVisible"
      @ok="handleCreateSave"
      :confirm-loading="modalLoading"
      width="500px"
      :style="createModalStyle"
    >
      <template #title>
        <div @mousedown="createDragStart" style="cursor: move; user-select: none;">新增工艺分类</div>
      </template>
      <div>
        <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }">
          <a-form-item label="分类编码" required>
            <a-input v-model:value="createForm.category_code" placeholder="请输入分类编码" />
          </a-form-item>
          <a-form-item label="分类名称" required>
            <a-input v-model:value="createForm.category_name" placeholder="请输入分类名称" />
          </a-form-item>
          <a-form-item label="备注">
            <a-textarea v-model:value="createForm.remark" :rows="2" placeholder="请输入备注" />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editModalVisible"
      @ok="handleEditSave"
      :confirm-loading="modalLoading"
      width="500px"
      :style="editModalStyle"
    >
      <template #title>
        <div @mousedown="editDragStart" style="cursor: move; user-select: none;">编辑工艺分类</div>
      </template>
      <div>
        <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }">
          <a-form-item label="分类编码" required>
            <a-input v-model:value="editForm.category_code" placeholder="请输入分类编码" />
          </a-form-item>
          <a-form-item label="分类名称" required>
            <a-input v-model:value="editForm.category_name" placeholder="请输入分类名称" />
          </a-form-item>
          <a-form-item label="备注">
            <a-textarea v-model:value="editForm.remark" :rows="2" placeholder="请输入备注" />
          </a-form-item>
        </a-form>
      </div>
    </a-modal>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailModalVisible"
      :footer="null"
      width="500px"
      :style="detailModalStyle"
    >
      <template #title>
        <div @mousedown="detailDragStart" style="cursor: move; user-select: none;">工艺分类详情</div>
      </template>
      <div>
        <a-descriptions bordered :column="1" size="small">
          <a-descriptions-item label="分类编码">{{ detailData.category_code }}</a-descriptions-item>
          <a-descriptions-item label="分类名称">{{ detailData.category_name }}</a-descriptions-item>
          <a-descriptions-item label="备注">{{ detailData.remark }}</a-descriptions-item>
          <a-descriptions-item label="审批状态">
            <a-tag :color="detailData.approval_status === '已审批' ? 'green' : detailData.approval_status === '待审批' ? 'orange' : 'default'">
              {{ detailData.approval_status }}
            </a-tag>
          </a-descriptions-item>
        </a-descriptions>
      </div>
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
