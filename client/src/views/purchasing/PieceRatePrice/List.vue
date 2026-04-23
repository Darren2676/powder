<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, DownloadOutlined, UploadOutlined, DeleteOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons-vue'
import { getPieceRatePrices, getPieceRatePriceDetail, createPieceRatePrice, updatePieceRatePrice, deletePieceRatePrice, exportPieceRatePrices, importPieceRatePrice } from '@/api/purchasing/pieceRatePrice'
import { getItems } from '@/api/master-data/itemMaster'
import { getProcedures } from '@/api/master-data/procedure'
import { getEquipments } from '@/api/equipment/equipment'
import { getEmployees } from '@/api/master-data/employee'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

// ==================== 数据 ====================

const dataList = ref<any[]>([])


const filterApproval = ref('')

const modalVisible = ref(false)
const modalTitle = ref('新建计件单价')
const isView = ref(false)
const formData = ref<any>({})

const itemOptions = ref<any[]>([])
const procedureOptions = ref<any[]>([])
const equipmentOptions = ref<any[]>([])
const employeeOptions = ref<any[]>([])

const importFileRef = ref<HTMLInputElement | null>(null)

// ==================== 列定义 ====================
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getPieceRatePrices)

const columns = [
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 110 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 100 },
  { title: '工序编号', dataIndex: 'standard_process_number', key: 'standard_process_number', width: 90 },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 100 },
  { title: '物料分类名称', dataIndex: 'item_category', key: 'item_category', width: 110 },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 90 },
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 100 },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 100 },
  { title: '人员编号', dataIndex: 'employee_number', key: 'employee_number', width: 90 },
  { title: '人员名称', dataIndex: 'employee_name', key: 'employee_name', width: 90 },
  { title: '自定义项', dataIndex: 'custom_field', key: 'custom_field', width: 100 },
  { title: '合格品计件单价', dataIndex: 'qualified_piece_rate', key: 'qualified_piece_rate', width: 130 },
  { title: '次品计件单价', dataIndex: 'defective_piece_rate', key: 'defective_piece_rate', width: 120 },
  { title: '生效时间', dataIndex: 'effective_date', key: 'effective_date', width: 100, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '失效时间', dataIndex: 'expiration_date', key: 'expiration_date', width: 100, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '图号', dataIndex: 'drawing_number', key: 'drawing_number', width: 130 },
  { title: '版本', dataIndex: 'version', key: 'version', width: 60 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
  { title: '材质', dataIndex: 'material_type', key: 'material_type', width: 140 },
  { title: '操作', key: 'action', width: 320, fixed: 'right' as const }
]

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getPieceRatePrices({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterApproval.value
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

const loadDropdowns = async () => {
  try {
    const [itemRes, procRes, equipRes, empRes]: any = await Promise.all([
      getItems({ limit: 9999 }),
      getProcedures({ limit: 9999 }),
      getEquipments({ limit: 9999 }),
      getEmployees({ limit: 9999 })
    ])
    itemOptions.value = itemRes.data?.items || []
    procedureOptions.value = procRes.data?.items || []
    equipmentOptions.value = equipRes.data?.items || []
    employeeOptions.value = empRes.data?.items || []
  } catch { /* ignore */ }
}

onMounted(() => { fetchList(); loadDropdowns() })

// ==================== CRUD ====================
const openCreate = () => {
  modalTitle.value = '新建计件单价'
  isView.value = false
  formData.value = emptyForm()
  modalVisible.value = true
}

const openView = async (record: any) => {
  modalTitle.value = '查看计件单价'
  isView.value = true
  const res: any = await getPieceRatePriceDetail(record.id)
  const d = res.data || {}
  formData.value = {
    ...d,
    effective_date: d.effective_date ? dayjs(d.effective_date).format('YYYY-MM-DD') : null,
    expiration_date: d.expiration_date ? dayjs(d.expiration_date).format('YYYY-MM-DD') : null
  }
  modalVisible.value = true
}

const openEdit = async (record: any) => {
  modalTitle.value = '编辑计件单价'
  isView.value = false
  const res: any = await getPieceRatePriceDetail(record.id)
  const d = res.data || {}
  formData.value = {
    ...d,
    effective_date: d.effective_date ? dayjs(d.effective_date).format('YYYY-MM-DD') : null,
    expiration_date: d.expiration_date ? dayjs(d.expiration_date).format('YYYY-MM-DD') : null
  }
  modalVisible.value = true
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除', content: `确定删除该计件单价记录？`,
    icon: () => null,
    onOk: async () => {
      await deletePieceRatePrice(record.id)
      message.success('删除成功')
      fetchList()
    }
  })
}

// ==================== 自动填充 ====================
const onItemSelect = (val: string) => {
  const item = itemOptions.value.find((i: any) => i.item_number === val)
  if (item) {
    formData.value.item_name = item.item_name || ''
    formData.value.item_category = item.item_class_name || ''
    formData.value.specifications = item.specifications || ''
  }
}

const onProcessSelect = (val: string) => {
  const proc = procedureOptions.value.find((p: any) => p.standard_process_number === val)
  if (proc) {
    formData.value.standard_process_name = proc.standard_process_name || ''
  }
}

const onEquipmentSelect = (val: string) => {
  const eq = equipmentOptions.value.find((e: any) => e.equipment_number === val)
  if (eq) {
    formData.value.equipment_name = eq.equipment_name || ''
  }
}

const onEmployeeSelect = (val: string) => {
  const emp = employeeOptions.value.find((e: any) => e.employee_number === val)
  if (emp) {
    formData.value.employee_name = emp.employee_name || ''
  }
}

// ==================== 保存 ====================
const handleSave = async () => {
  if (!formData.value.item_number) { message.warning('请选择物料编号'); return }
  if (!formData.value.standard_process_number) { message.warning('请选择工序编号'); return }
  if (formData.value.qualified_piece_rate == null) { message.warning('请填写合格品计件单价'); return }
  if (!formData.value.effective_date) { message.warning('请选择生效时间'); return }
  if (!formData.value.expiration_date) { message.warning('请选择失效时间'); return }

  const payload = { ...formData.value }
  if (formData.value.id) {
    await updatePieceRatePrice(formData.value.id, payload)
    message.success('更新成功')
  } else {
    await createPieceRatePrice(payload)
    message.success('创建成功')
  }
  modalVisible.value = false
  fetchList()
}

// ==================== 审批 ====================
const handleSubmitApproval = async (record: any) => { await submitForApproval('piece_rate_price', String(record.id)); message.success('提交审批成功'); fetchList() }
const handleApprove = async (record: any) => { await approveRecord('piece_rate_price', String(record.id)); message.success('审批通过'); fetchList() }
const handleWithdraw = async (record: any) => { await withdrawApproval('piece_rate_price', String(record.id)); message.success('撤回成功'); fetchList() }
const handleReverse = async (record: any) => { await reverseApproval('piece_rate_price', String(record.id)); message.success('反审批成功'); fetchList() }

// ==================== 导出 ====================
const handleExport = async () => {
  const res: any = await exportPieceRatePrices(searchText.value, filterApproval.value)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'piece_rate_prices.xlsx')
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
    const res: any = await importPieceRatePrice(fd)
    message.success(res.message || '导入成功')
    fetchList()
  } catch { /* error handled by request interceptor */ }
  if (importFileRef.value) importFileRef.value.value = ''
}
</script>

<template>
  <div style="padding: 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">计件单价管理</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <a-input-search v-model:value="searchText" placeholder="搜索物料编号/名称/工序编号/名称" style="width:300px" @search="handleSearch" allow-clear />
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

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handleTableChange" row-key="id" :scroll="{ x: 2200 }" size="small">
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
    <a-modal v-model:open="modalVisible" :title="modalTitle" width="960px" @ok="handleSave" :ok-button-props="{ style: isView ? { display: 'none' } : {} }" :cancel-text="isView ? '关闭' : '取消'">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="物料编号" required>
            <a-select v-model:value="formData.item_number" show-search option-filter-prop="label" style="width:100%" @change="onItemSelect" :disabled="isView" placeholder="选择物料" allow-clear>
              <a-select-option v-for="item in itemOptions" :key="item.item_number" :value="item.item_number" :label="item.item_number + ' ' + item.item_name">{{ item.item_number }} {{ item.item_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="物料名称">
            <a-input v-model:value="formData.item_name" disabled />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="工序编号" required>
            <a-select v-model:value="formData.standard_process_number" show-search option-filter-prop="label" style="width:100%" @change="onProcessSelect" :disabled="isView" placeholder="选择工序" allow-clear>
              <a-select-option v-for="p in procedureOptions" :key="p.standard_process_number" :value="p.standard_process_number" :label="p.standard_process_number + ' ' + p.standard_process_name">{{ p.standard_process_number }} {{ p.standard_process_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="工序名称">
            <a-input v-model:value="formData.standard_process_name" disabled />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="设备编号">
            <a-select v-model:value="formData.equipment_number" show-search option-filter-prop="label" style="width:100%" @change="onEquipmentSelect" :disabled="isView" placeholder="选择设备" allow-clear>
              <a-select-option v-for="eq in equipmentOptions" :key="eq.equipment_number" :value="eq.equipment_number" :label="eq.equipment_number + ' ' + eq.equipment_name">{{ eq.equipment_number }} {{ eq.equipment_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="设备名称">
            <a-input v-model:value="formData.equipment_name" disabled />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="人员编号">
            <a-select v-model:value="formData.employee_number" show-search option-filter-prop="label" style="width:100%" @change="onEmployeeSelect" :disabled="isView" placeholder="选择人员" allow-clear>
              <a-select-option v-for="emp in employeeOptions" :key="emp.employee_number" :value="emp.employee_number" :label="emp.employee_number + ' ' + emp.employee_name">{{ emp.employee_number }} {{ emp.employee_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="人员名称">
            <a-input v-model:value="formData.employee_name" disabled />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="合格品计件单价（元/产品）" required>
            <a-input-number v-model:value="formData.qualified_piece_rate" :min="0" :precision="6" style="width:100%" :disabled="isView" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="次品计件单价（元/产品）" required>
            <a-input-number v-model:value="formData.defective_piece_rate" :min="0" :precision="6" style="width:100%" :disabled="isView" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="生效时间" required>
            <a-date-picker v-model:value="formData.effective_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="失效时间" required>
            <a-date-picker v-model:value="formData.expiration_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="图号">
            <a-input v-model:value="formData.drawing_number" :disabled="isView" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="版本">
            <a-input v-model:value="formData.version" :disabled="isView" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="规格">
            <a-input v-model:value="formData.specifications" :disabled="isView" />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="材质">
            <a-input v-model:value="formData.material_type" :disabled="isView" />
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="物料分类名称">
            <a-input v-model:value="formData.item_category" disabled />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="自定义项">
            <a-input v-model:value="formData.custom_field" :disabled="isView" />
          </a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>
