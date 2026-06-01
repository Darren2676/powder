<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, SwapOutlined, DownOutlined, EyeOutlined
} from '@ant-design/icons-vue'
import { getUnits, getAllUnits, createUnit, updateUnit, deleteUnit, exportUnits, importUnits, getUnitConversions, approveUnit, withdrawUnit } from '@/api/master-data/unit'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'
import { useModalDrag } from '@/composables/useModalDrag'

defineOptions({ name: 'UnitList' })

interface ConversionRow {
  id?: number
  to_unit_name: string
  conversion_rate: number | string
}

interface UnitForm {
  unit_code: string
  unit_name: string
  remark: string
  default_product: boolean
  default_semi: boolean
  default_material: boolean
  conversions: ConversionRow[]
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getUnits)

const editModalVisible = ref(false)
const { modalStyle: editModalStyle, onDragStart: editDragStart, resetDrag: editResetDrag } = useModalDrag()
const createModalVisible = ref(false)
const { modalStyle: createModalStyle, onDragStart: createDragStart, resetDrag: createResetDrag } = useModalDrag()
const detailModalVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const modalLoading = ref(false)
const detailData = ref<any>({})
const detailConversions = ref<any[]>([])
const editForm = reactive<UnitForm>({ unit_code: '', unit_name: '', remark: '', default_product: false, default_semi: false, default_material: false, conversions: [] })
const createForm = reactive<UnitForm>({ unit_code: '', unit_name: '', remark: '', default_product: false, default_semi: false, default_material: false, conversions: [] })
const fileInputRef = ref<HTMLInputElement>()

// 所有单位选项（用于换算下拉）
const unitOptions = ref<{ unit_code: string; unit_name: string }[]>([])

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '单位编码', dataIndex: 'unit_code', key: 'unit_code', width: 100 },
  { title: '单位名称', dataIndex: 'unit_name', key: 'unit_name' },
  { title: '备注', dataIndex: 'remark', key: 'remark' },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 120 }
]

const fetchAllUnits = async () => {
  try {
    const res = await getAllUnits()
    unitOptions.value = res.data || []
  } catch { /* ignore */ }
}

const handleDetail = async (record: any) => {
  detailData.value = { ...record }
  detailConversions.value = []
  detailResetDrag()
  detailModalVisible.value = true
  try {
    const res = await getUnitConversions(record.unit_code)
    detailConversions.value = res.data || []
  } catch { /* ignore */ }
}

const handleEdit = async (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  Object.assign(editForm, {
    unit_code: record.unit_code,
    unit_name: record.unit_name,
    remark: record.remark || '',
    default_product: !!record.default_product,
    default_semi: !!record.default_semi,
    default_material: !!record.default_material,
    conversions: []
  })
  editResetDrag()
  editModalVisible.value = true
  // 加载该单位的换算关系
  try {
    const res = await getUnitConversions(record.unit_code)
    const items = res.data || []
    editForm.conversions = items.map((c: any) => ({
      id: c.id,
      to_unit_name: c.to_unit_name,
      conversion_rate: c.conversion_rate
    }))
  } catch { /* ignore */ }
}

const handleDelete = (record: any) => {
  if ((record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除单位"${record.unit_name}"吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteUnit(record.unit_code); message.success('删除成功'); fetchData() }
      catch { message.error('删除失败') }
    }
  })
}

const handleEditOk = async () => {
  if (!editForm.unit_name) { message.warning('请输入单位名称'); return }
  modalLoading.value = true
  try {
    await updateUnit(editForm.unit_code, {
      unit_name: editForm.unit_name,
      remark: editForm.remark,
      default_product: editForm.default_product,
      default_semi: editForm.default_semi,
      default_material: editForm.default_material,
      conversions: editForm.conversions.filter(c => c.to_unit_name)
    })
    message.success('更新成功')
    editModalVisible.value = false
    fetchData()
    fetchAllUnits()
  } catch { message.error('更新失败') }
  finally { modalLoading.value = false }
}

const handleCreateOk = async () => {
  if (!createForm.unit_code) { message.warning('请输入单位编码'); return }
  if (!createForm.unit_name) { message.warning('请输入单位名称'); return }
  modalLoading.value = true
  try {
    await createUnit({
      unit_code: createForm.unit_code,
      unit_name: createForm.unit_name,
      remark: createForm.remark,
      default_product: createForm.default_product,
      default_semi: createForm.default_semi,
      default_material: createForm.default_material,
      conversions: createForm.conversions.filter(c => c.to_unit_name)
    })
    message.success('创建成功')
    createModalVisible.value = false
    resetCreateForm()
    fetchData()
    fetchAllUnits()
  } catch { message.error('创建失败') }
  finally { modalLoading.value = false }
}

const resetCreateForm = () => {
  Object.assign(createForm, { unit_code: '', unit_name: '', remark: '', default_product: false, default_semi: false, default_material: false, conversions: [] })
}

const handleOpenCreate = () => {
  resetCreateForm()
  createResetDrag()
  createModalVisible.value = true
}

// 换算关系操作
const addConversion = (form: UnitForm) => {
  form.conversions.push({ to_unit_name: '', conversion_rate: '' })
}
const removeConversion = (form: UnitForm, index: number) => {
  form.conversions.splice(index, 1)
}

// 获取可选的目标单位（排除自身和已选择的）
const getAvailableUnits = (form: UnitForm, currentIndex: number) => {
  const usedNames = form.conversions
    .filter((_, i) => i !== currentIndex)
    .map(c => c.to_unit_name)
  return unitOptions.value.filter(u => u.unit_name !== form.unit_name && !usedNames.includes(u.unit_name))
}

const handleExport = async () => {
  try {
    const res = await exportUnits()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('units'); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}
const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try {
    const formData = new FormData(); formData.append('file', file)
    await importUnits(formData); message.success('导入成功'); fetchData(); fetchAllUnits()
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

const handleToggleStatus = async (record: any) => {
  try {
    await toggleUnitStatus(record.unit_code)
    message.success('状态更新成功')
    fetchData()
  } catch (error) {
    message.error('状态更新失败')
  }
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveUnit(record.unit_code)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消单位「${(record.unit_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawUnit(record.unit_code)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

onMounted(() => { fetchData(); fetchAllUnits() })
</script>

<template>
  <div>
    <a-card title="单位管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索单位编码/名称" style="width: 200px" @search="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button type="primary" @click="handleOpenCreate"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-selection="rowSelection"
        row-key="unit_code" :pagination="pagination" :scroll="{ y: 'calc(100vh - 280px)' }" @change="handleTableChange">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleDetail(record)">
                <EyeOutlined /> 详情
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="handleEdit(record)"><EditOutlined /> 编辑</a-menu-item>
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

    <!-- 详情查看模态框 -->
    <a-modal v-model:open="detailModalVisible" :footer="null" :width="600" :style="detailModalStyle" destroyOnClose>
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">单位详情 - {{ detailData.unit_code }}</div>
      </template>
      <a-descriptions :column="2" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '120px' }">
        <a-descriptions-item label="单位编码">{{ detailData.unit_code }}</a-descriptions-item>
        <a-descriptions-item label="单位名称">{{ detailData.unit_name }}</a-descriptions-item>
        <a-descriptions-item label="审核状态"><a-tag :color="(detailData.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (detailData.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag></a-descriptions-item>
        <a-descriptions-item label="默认单位">
          <a-tag v-if="detailData.default_product" color="blue">产品</a-tag>
          <a-tag v-if="detailData.default_semi" color="green">半成品</a-tag>
          <a-tag v-if="detailData.default_material" color="orange">原料</a-tag>
          <span v-if="!detailData.default_product && !detailData.default_semi && !detailData.default_material" style="color: #ccc;">-</span>
        </a-descriptions-item>
        <a-descriptions-item label="备注" :span="2">{{ detailData.remark || '-' }}</a-descriptions-item>
      </a-descriptions>

      <div v-if="detailConversions.length > 0" style="margin-top: 16px;">
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">换算关系</div>
        <a-table :data-source="detailConversions" :pagination="false" size="small" bordered row-key="id">
          <a-table-column title="源单位" data-index="from_unit_code" :width="100" />
          <a-table-column title="目标单位" data-index="to_unit_name" :width="100" />
          <a-table-column title="换算率" data-index="conversion_rate" :width="100" />
          <a-table-column title="备注" data-index="remark" />
        </a-table>
      </div>
      <a-empty v-else description="暂无换算关系" style="margin-top: 16px;" />
    </a-modal>

    <!-- 编辑模态框 -->
    <a-modal v-model:open="editModalVisible" :width="600" :style="editModalStyle" @ok="handleEditOk"
      okText="确定" cancelText="取消" :confirmLoading="modalLoading" destroyOnClose>
      <template #title>
        <div class="drag-handle" @mousedown="editDragStart">编辑</div>
      </template>
      <div class="unit-modal-body">
        <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }">
          <a-form-item label="单位名称" required>
            <a-input v-model:value="editForm.unit_name" placeholder="请输入单位名称" />
          </a-form-item>
          <a-form-item label="默认单位">
            <a-space :size="16">
              <a-checkbox v-model:checked="editForm.default_product">产品</a-checkbox>
              <a-checkbox v-model:checked="editForm.default_semi">半成品</a-checkbox>
              <a-checkbox v-model:checked="editForm.default_material">原料</a-checkbox>
            </a-space>
          </a-form-item>
          <a-form-item label="备注">
            <a-textarea v-model:value="editForm.remark" :rows="2" placeholder="请输入备注" />
          </a-form-item>
        </a-form>
        <div class="conversion-section">
          <div v-for="(conv, idx) in editForm.conversions" :key="idx" class="conversion-row">
            <span class="conv-qty">1</span>
            <a-select class="conv-unit-select" :value="editForm.unit_name" disabled>
              <a-select-option v-for="u in unitOptions" :key="u.unit_name" :value="u.unit_name">{{ u.unit_name }}</a-select-option>
            </a-select>
            <SwapOutlined class="conv-swap-icon" />
            <a-input-number class="conv-rate-input" v-model:value="conv.conversion_rate"
              :min="0" :step="0.001" :controls="false" placeholder="换算值" string-mode />
            <a-select class="conv-unit-select" v-model:value="conv.to_unit_name" placeholder="选择单位">
              <a-select-option v-for="u in getAvailableUnits(editForm, idx)" :key="u.unit_name" :value="u.unit_name">{{ u.unit_name }}</a-select-option>
            </a-select>
            <a-button type="text" danger size="small" @click="removeConversion(editForm, idx)">
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </div>
          <div class="conversion-add" @click="addConversion(editForm)">添加换算关系</div>
        </div>
      </div>
    </a-modal>

    <!-- 新建模态框 -->
    <a-modal v-model:open="createModalVisible" :width="600" :style="createModalStyle" @ok="handleCreateOk"
      okText="确定" cancelText="取消" :confirmLoading="modalLoading" destroyOnClose>
      <template #title>
        <div class="drag-handle" @mousedown="createDragStart">新建</div>
      </template>
      <div class="unit-modal-body">
        <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }">
          <a-form-item label="单位编码" required>
            <a-input v-model:value="createForm.unit_code" placeholder="请输入单位编码" />
          </a-form-item>
          <a-form-item label="单位名称" required>
            <a-input v-model:value="createForm.unit_name" placeholder="请输入单位名称" />
          </a-form-item>
          <a-form-item label="默认单位">
            <a-space :size="16">
              <a-checkbox v-model:checked="createForm.default_product">产品</a-checkbox>
              <a-checkbox v-model:checked="createForm.default_semi">半成品</a-checkbox>
              <a-checkbox v-model:checked="createForm.default_material">原料</a-checkbox>
            </a-space>
          </a-form-item>
          <a-form-item label="备注">
            <a-textarea v-model:value="createForm.remark" :rows="2" placeholder="请输入备注" />
          </a-form-item>
        </a-form>

        <div class="conversion-section">
          <div v-for="(conv, idx) in createForm.conversions" :key="idx" class="conversion-row">
            <span class="conv-qty">1</span>
            <a-select class="conv-unit-select" :value="createForm.unit_name || '当前单位'" disabled>
              <a-select-option value="">{{ createForm.unit_name || '当前单位' }}</a-select-option>
            </a-select>
            <SwapOutlined class="conv-swap-icon" />
            <a-input-number class="conv-rate-input" v-model:value="conv.conversion_rate"
              :min="0" :step="0.001" :controls="false" placeholder="换算值" string-mode />
            <a-select class="conv-unit-select" v-model:value="conv.to_unit_name" placeholder="选择单位">
              <a-select-option v-for="u in getAvailableUnits(createForm, idx)" :key="u.unit_name" :value="u.unit_name">{{ u.unit_name }}</a-select-option>
            </a-select>
            <a-button type="text" danger size="small" @click="removeConversion(createForm, idx)">
              <template #icon><DeleteOutlined /></template>
            </a-button>
          </div>
          <div class="conversion-add" @click="addConversion(createForm)">添加换算关系</div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }

.drag-handle {
  cursor: move;
  user-select: none;
}

.unit-modal-body {
  padding: 8px 0;
}

.conversion-section {
  margin: 4px 24px 0;
  border-top: 1px dashed #e8e8e8;
  padding-top: 16px;
}

.conversion-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.conv-qty {
  width: 32px;
  text-align: center;
  font-size: 14px;
  color: #333;
  flex-shrink: 0;
}

.conv-unit-select {
  width: 120px;
  flex-shrink: 0;
}

.conv-swap-icon {
  font-size: 16px;
  color: #999;
  flex-shrink: 0;
}

.conv-rate-input {
  width: 120px;
  flex-shrink: 0;
}

.conversion-add {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  color: #999;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.conversion-add:hover {
  border-color: #1890ff;
  color: #1890ff;
}
</style>
