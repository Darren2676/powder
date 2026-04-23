<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, DownOutlined, SettingOutlined
} from '@ant-design/icons-vue'
import { getProcedures, createProcedure, updateProcedure, deleteProcedure, exportProcedures, importProcedures, approveProcedure, withdrawProcedure } from '@/api/master-data/procedure'
import { getWorkCenters } from '@/api/master-data/workCenter'
import { getWarehouses } from '@/api/master-data/warehouse'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

defineOptions({ name: 'ProcedureList' })

interface Procedure {
  standard_process_number?: string
  standard_process_name: string
  work_center_number: string
  work_center_name: string
  workshop_warehouse: string
  inspection_process: string
  inspection_schemes: string
  inspection_specification: string
  inspection_process_inspector: string
  over_staffing_reporting: string
  excess_reporting_ratio: string
  ingredient_addition: string
  self_inspection: string
  self_inspection_inspection_plan: string
  self_inspection_specification: string
}

const emptyForm = (): Procedure => ({
  standard_process_number: undefined,
  standard_process_name: '',
  work_center_number: '',
  work_center_name: '',
  workshop_warehouse: '',
  inspection_process: '',
  inspection_schemes: '',
  inspection_specification: '',
  inspection_process_inspector: '',
  over_staffing_reporting: '',
  excess_reporting_ratio: '',
  ingredient_addition: '',
  self_inspection: '',
  self_inspection_inspection_plan: '',
  self_inspection_specification: ''
})

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Procedure>(getProcedures)

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<Procedure>(emptyForm())
const createForm = reactive<Procedure>(emptyForm())
const fileInputRef = ref<HTMLInputElement>()

// 工作中心下拉
const workCenterOptions = ref<{ label: string; value: string }[]>([])
const workCenterList = ref<any[]>([])

// 仓库下拉
const warehouseOptions = ref<{ value: string }[]>([])

const fetchWorkCenters = async () => {
  try {
    const res = await getWorkCenters({ page: 1, limit: 9999 })
    const list = res.data.items || []
    workCenterList.value = list
    workCenterOptions.value = list.map((w: any) => ({ label: `${w.work_cente_number} - ${w.work_cente_name}`, value: w.work_cente_number }))
  } catch {}
}

const fetchWarehouses = async () => {
  try {
    const res = await getWarehouses({ page: 1, limit: 9999 })
    const list = res.data?.items || []
    warehouseOptions.value = list.map((w: any) => ({
      value: w.warehouse_name ? `${w.warehouse_number} - ${w.warehouse_name}` : w.warehouse_number
    }))
  } catch (e) {
    console.error('获取仓库列表失败', e)
  }
}

const handleWorkCenterChange = (form: Procedure, val: string) => {
  form.work_center_number = val
  const found = workCenterList.value.find((w: any) => w.work_cente_number === val)
  form.work_center_name = found ? found.work_cente_name : ''
}

const defaultDataColumns: any[] = [
  { title: '标准工序编号', dataIndex: 'standard_process_number', key: 'standard_process_number', width: 140, resizable: true },
  { title: '标准工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 140, resizable: true },
  { title: '工作中心编号', dataIndex: 'work_center_number', key: 'work_center_number', width: 140, resizable: true },
  { title: '工作中心名称', dataIndex: 'work_center_name', key: 'work_center_name', width: 140, resizable: true },
  { title: '车间仓库', dataIndex: 'workshop_warehouse', key: 'workshop_warehouse', width: 100, resizable: true },
  { title: '是否检验工序', dataIndex: 'inspection_process', key: 'inspection_process', width: 120, resizable: true },
  { title: '检验方案', dataIndex: 'inspection_schemes', key: 'inspection_schemes', width: 100, resizable: true },
  { title: '检验规范', dataIndex: 'inspection_specification', key: 'inspection_specification', width: 100, resizable: true },
  { title: '检验员', dataIndex: 'inspection_process_inspector', key: 'inspection_process_inspector', width: 100, resizable: true },
  { title: '超额报工', dataIndex: 'over_staffing_reporting', key: 'over_staffing_reporting', width: 100, resizable: true },
  { title: '超额报工比例', dataIndex: 'excess_reporting_ratio', key: 'excess_reporting_ratio', width: 120, resizable: true },
  { title: '配料方式', dataIndex: 'ingredient_addition', key: 'ingredient_addition', width: 100, resizable: true },
  { title: '是否自检', dataIndex: 'self_inspection', key: 'self_inspection', width: 100, resizable: true },
  { title: '自检检验方案', dataIndex: 'self_inspection_inspection_plan', key: 'self_inspection_inspection_plan', width: 130, resizable: true },
  { title: '自检规范', dataIndex: 'self_inspection_specification', key: 'self_inspection_specification', width: 100, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('procedure_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 150, fixed: 'right' as const }]
})

const handleEdit = (record: Procedure) => {
  Object.assign(editForm, { ...emptyForm(), ...record })
  editModalVisible.value = true
}

const handleDelete = (record: Procedure) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除工序"${record.standard_process_name}"吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteProcedure(record.standard_process_number!); message.success('删除成功'); fetchData() }
      catch { message.error('删除失败') }
    }
  })
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveProcedure(record.standard_process_number)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消工序「${(record.standard_process_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawProcedure(record.standard_process_number)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

const handleEditOk = async () => {
  try { await updateProcedure(editForm.standard_process_number!, editForm); message.success('更新成功'); editModalVisible.value = false; fetchData() }
  catch { message.error('更新失败') }
}

const handleCreateOk = async () => {
  try {
    await createProcedure(createForm); message.success('创建成功'); createModalVisible.value = false
    Object.assign(createForm, emptyForm()); fetchData()
  } catch { message.error('创建失败') }
}

const handleExport = async (format: string = 'xlsx') => {
  try {
    const res = await exportProcedures(format)
    const ext = format === 'xls' ? 'xls' : 'xlsx'
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('procedures', ext); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try { const formData = new FormData(); formData.append('file', file); await importProcedures(formData); message.success('导入成功'); fetchData() }
  catch { message.error('导入失败') } finally { target.value = '' }
}

onMounted(() => { loadColumnPreference(); fetchData(); fetchWorkCenters(); fetchWarehouses() })
</script>

<template>
  <div>
    <a-card title="标准工序管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索工序编号/名称" style="width: 200px" @search="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-dropdown>
            <a-button><template #icon><DownloadOutlined /></template>导出</a-button>
            <template #overlay>
              <a-menu @click="({ key }: any) => handleExport(key)">
                <a-menu-item key="xlsx">导出为 xlsx</a-menu-item>
                <a-menu-item key="xls">导出为 xls</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>
      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-key="(record: Procedure) => record.standard_process_number!" :row-selection="rowSelection" :pagination="pagination" :scroll="{ x: 'max-content' }" @change="handleTableChange" @resizeColumn="handleResizeColumn">
        <template #bodyCell="{ column, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(dataSource[index].approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (dataSource[index].approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(dataSource[index])">编辑</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(dataSource[index].approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(dataSource[index])">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(dataSource[index])">撤消</a-menu-item>
                    <a-menu-item @click="handleDelete(dataSource[index])">删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="editModalVisible" title="编辑标准工序" @ok="handleEditOk" okText="确认" cancelText="取消" width="700px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序编号"><a-input v-model:value="editForm.standard_process_number" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序名称"><a-input v-model:value="editForm.standard_process_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="工作中心编号">
              <a-select v-model:value="editForm.work_center_number" show-search allow-clear placeholder="请选择"
                :options="workCenterOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleWorkCenterChange(editForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="工作中心名称"><a-input v-model:value="editForm.work_center_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="车间仓库">
              <a-auto-complete v-model:value="editForm.workshop_warehouse" placeholder="请选择或手工录入"
                :options="warehouseOptions" :filter-option="(input: string, option: any) => option.value.toLowerCase().includes(input.toLowerCase())" allow-clear />
            </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="是否检验工序"><a-select v-model:value="editForm.inspection_process" placeholder="请选择"><a-select-option value="Y">Y</a-select-option><a-select-option value="N">N</a-select-option></a-select></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="检验员"><a-input v-model:value="editForm.inspection_process_inspector" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="检验方案"><a-input v-model:value="editForm.inspection_schemes" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="检验规范"><a-input v-model:value="editForm.inspection_specification" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="超额报工"><a-input v-model:value="editForm.over_staffing_reporting" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="超额报工比例"><a-input v-model:value="editForm.excess_reporting_ratio" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="配料方式"><a-select v-model:value="editForm.ingredient_addition" placeholder="请选择"><a-select-option value="备料">备料</a-select-option><a-select-option value="领料">领料</a-select-option></a-select></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="是否自检"><a-select v-model:value="editForm.self_inspection" placeholder="请选择"><a-select-option value="Y">Y</a-select-option><a-select-option value="N">N</a-select-option></a-select></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="自检检验方案"><a-input v-model:value="editForm.self_inspection_inspection_plan" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="自检规范"><a-input v-model:value="editForm.self_inspection_specification" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <a-modal v-model:open="createModalVisible" title="新建标准工序" @ok="handleCreateOk" okText="确认" cancelText="取消" width="700px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序编号"><a-input v-model:value="createForm.standard_process_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序名称"><a-input v-model:value="createForm.standard_process_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="工作中心编号">
              <a-select v-model:value="createForm.work_center_number" show-search allow-clear placeholder="请选择"
                :options="workCenterOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleWorkCenterChange(createForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="工作中心名称"><a-input v-model:value="createForm.work_center_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="车间仓库">
              <a-auto-complete v-model:value="createForm.workshop_warehouse" placeholder="请选择或手工录入"
                :options="warehouseOptions" :filter-option="(input: string, option: any) => option.value.toLowerCase().includes(input.toLowerCase())" allow-clear />
            </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="是否检验工序"><a-select v-model:value="createForm.inspection_process" placeholder="请选择"><a-select-option value="Y">Y</a-select-option><a-select-option value="N">N</a-select-option></a-select></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="检验员"><a-input v-model:value="createForm.inspection_process_inspector" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="检验方案"><a-input v-model:value="createForm.inspection_schemes" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="检验规范"><a-input v-model:value="createForm.inspection_specification" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="超额报工"><a-input v-model:value="createForm.over_staffing_reporting" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="超额报工比例"><a-input v-model:value="createForm.excess_reporting_ratio" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="配料方式"><a-select v-model:value="createForm.ingredient_addition" placeholder="请选择"><a-select-option value="备料">备料</a-select-option><a-select-option value="领料">领料</a-select-option></a-select></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="是否自检"><a-select v-model:value="createForm.self_inspection" placeholder="请选择"><a-select-option value="Y">Y</a-select-option><a-select-option value="N">N</a-select-option></a-select></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="自检检验方案"><a-input v-model:value="createForm.self_inspection_inspection_plan" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="自检规范"><a-input v-model:value="createForm.self_inspection_specification" /></a-form-item></a-col>
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
:deep(.ant-card-extra) { padding: 0; }
</style>
