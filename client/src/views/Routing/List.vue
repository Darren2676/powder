<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined
} from '@ant-design/icons-vue'
import { getRoutings, createRouting, updateRouting, deleteRouting, exportRoutings, importRoutings } from '@/api/routing'
import { getProcedures } from '@/api/procedure'
import { getWorkCenters } from '@/api/workCenter'
import { getItems } from '@/api/itemMaster'

defineOptions({ name: 'RoutingList' })

interface Routing {
  process_route_number?: string
  process_route_name: string
  item_number: string
  item_name: string
  production_automatic_inventory_entry_rules: string
  standard_process_number: string
  standard_process_name: string
  post_processing_sequence_number: string
  post_processing_sequence_name: string
  work_center_number: string
  work_center_name: string
  excess_reporting_ratio: string
  ingredient_addition_method: string
  process_material_input_number: string
  process_material_input_quantity: string
  process_material_input_unit: string
  material_wastage_rate: string
  flowing_backward: string
  'default_ repository': string
}

const emptyForm = (): Routing => ({
  process_route_number: undefined,
  process_route_name: '',
  item_number: '',
  item_name: '',
  production_automatic_inventory_entry_rules: '',
  standard_process_number: '',
  standard_process_name: '',
  post_processing_sequence_number: '',
  post_processing_sequence_name: '',
  work_center_number: '',
  work_center_name: '',
  excess_reporting_ratio: '',
  ingredient_addition_method: '',
  process_material_input_number: '',
  process_material_input_quantity: '',
  process_material_input_unit: '',
  material_wastage_rate: '',
  flowing_backward: '',
  'default_ repository': ''
})

const searchText = ref('')
const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<Routing[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<Routing>(emptyForm())
const createForm = reactive<Routing>(emptyForm())
const fileInputRef = ref<HTMLInputElement>()

// 工序、工作中心和产品下拉数据
const procedureOptions = ref<{ label: string; value: string }[]>([])
const procedureList = ref<any[]>([])
const workCenterOptions = ref<{ label: string; value: string }[]>([])
const workCenterList = ref<any[]>([])
const productOptions = ref<{ label: string; value: string }[]>([])
const productList = ref<any[]>([])

const fetchProcedures = async () => {
  try {
    const res = await getProcedures({ page: 1, limit: 9999 })
    const list = res.data.items || []
    procedureList.value = list
    procedureOptions.value = list.map((p: any) => ({ label: `${p.standard_process_number} - ${p.standard_process_name}`, value: p.standard_process_number }))
  } catch {}
}

const fetchWorkCenters = async () => {
  try {
    const res = await getWorkCenters({ page: 1, limit: 9999 })
    const list = res.data.items || []
    workCenterList.value = list
    workCenterOptions.value = list.map((w: any) => ({ label: `${w.work_cente_number} - ${w.work_cente_name}`, value: w.work_cente_number }))
  } catch {}
}

const fetchProducts = async () => {
  try {
    const res = await getItems({ item_type: '成品', page: 1, limit: 9999 })
    const list = res.data.items || []
    productList.value = list
    productOptions.value = list.map((p: any) => ({ label: `${p.item_number} - ${p.item_name}`, value: p.item_number }))
  } catch {}
}

const handleProductChange = (form: Routing, val: string) => {
  form.item_number = val
  const found = productList.value.find((p: any) => p.item_number === val)
  form.item_name = found ? found.item_name : ''
}

const handleProcedureChange = (form: Routing, val: string) => {
  form.standard_process_number = val
  const found = procedureList.value.find((p: any) => p.standard_process_number === val)
  form.standard_process_name = found ? found.standard_process_name : ''
}

const handleWorkCenterChange = (form: Routing, val: string) => {
  form.work_center_number = val
  const found = workCenterList.value.find((w: any) => w.work_cente_number === val)
  form.work_center_name = found ? found.work_cente_name : ''
}

const handlePostProcessChange = (form: Routing, val: string) => {
  form.post_processing_sequence_number = val
  const found = procedureList.value.find((p: any) => p.standard_process_number === val)
  form.post_processing_sequence_name = found ? found.standard_process_name : ''
}

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '工艺路线编号', dataIndex: 'process_route_number', key: 'process_route_number', width: 140 },
  { title: '工艺路线名称', dataIndex: 'process_route_name', key: 'process_route_name', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '生产自动入库规则', dataIndex: 'production_automatic_inventory_entry_rules', key: 'production_automatic_inventory_entry_rules', width: 150 },
  { title: '标准工序编号', dataIndex: 'standard_process_number', key: 'standard_process_number', width: 130 },
  { title: '标准工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 130 },
  { title: '后置工序编号', dataIndex: 'post_processing_sequence_number', key: 'post_processing_sequence_number', width: 120 },
  { title: '后置工序名称', dataIndex: 'post_processing_sequence_name', key: 'post_processing_sequence_name', width: 120 },
  { title: '工作中心编号', dataIndex: 'work_center_number', key: 'work_center_number', width: 130 },
  { title: '工作中心名称', dataIndex: 'work_center_name', key: 'work_center_name', width: 130 },
  { title: '超额报工比例', dataIndex: 'excess_reporting_ratio', key: 'excess_reporting_ratio', width: 120 },
  { title: '配料方式', dataIndex: 'ingredient_addition_method', key: 'ingredient_addition_method', width: 100 },
  { title: '工序物料投入编号', dataIndex: 'process_material_input_number', key: 'process_material_input_number', width: 150 },
  { title: '工序物料投入数量', dataIndex: 'process_material_input_quantity', key: 'process_material_input_quantity', width: 150 },
  { title: '工序物料投入单位', dataIndex: 'process_material_input_unit', key: 'process_material_input_unit', width: 150 },
  { title: '物料损耗率', dataIndex: 'material_wastage_rate', key: 'material_wastage_rate', width: 110 },
  { title: '倒冲', dataIndex: 'flowing_backward', key: 'flowing_backward', width: 80 },
  { title: '默认仓库', dataIndex: 'default_ repository', key: 'default_repository', width: 100 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getRoutings({ page: pagination.current, limit: pagination.pageSize, search: searchText.value })
    dataSource.value = res.data.items
    pagination.total = res.data.pagination.total
  } catch { message.error('获取数据失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; pagination.current = 1; fetchData() }
const handleTableChange = (pag: any) => { pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchData() }

const handleEdit = (record: Routing) => {
  Object.assign(editForm, { ...emptyForm(), ...record })
  editModalVisible.value = true
}

const handleDelete = (record: Routing) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除工艺路线"${record.process_route_name}"吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteRouting(record.process_route_number!); message.success('删除成功'); fetchData() }
      catch { message.error('删除失败') }
    }
  })
}

const handleEditOk = async () => {
  try { await updateRouting(editForm.process_route_number!, editForm); message.success('更新成功'); editModalVisible.value = false; fetchData() }
  catch { message.error('更新失败') }
}

const handleCreateOk = async () => {
  try {
    await createRouting(createForm); message.success('创建成功'); createModalVisible.value = false
    Object.assign(createForm, emptyForm()); fetchData()
  } catch { message.error('创建失败') }
}

const handleExport = async () => {
  try {
    const res = await exportRoutings()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'routings.xlsx'; link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try { const formData = new FormData(); formData.append('file', file); await importRoutings(formData); message.success('导入成功'); fetchData() }
  catch { message.error('导入失败') } finally { target.value = '' }
}

onMounted(() => {
  fetchData()
  fetchProcedures()
  fetchWorkCenters()
  fetchProducts()
})
</script>

<template>
  <div>
    <a-card title="工艺路线管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索编号/名称/产品编号" style="width: 250px" @search="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>
      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-key="(record: Routing) => record.process_route_number!" :row-selection="rowSelection" :pagination="pagination" :scroll="{ x: 1500, y: 'calc(100vh - 280px)' }" @change="handleTableChange">
        <template #bodyCell="{ column, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(dataSource[index])"><template #icon><EditOutlined /></template>编辑</a-button>
              <a-button type="link" danger size="small" @click="handleDelete(dataSource[index])"><template #icon><DeleteOutlined /></template>删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="editModalVisible" title="编辑工艺路线" @ok="handleEditOk" okText="确认" cancelText="取消" width="750px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工艺路线编号"><a-input v-model:value="editForm.process_route_number" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工艺路线名称"><a-input v-model:value="editForm.process_route_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品编号">
              <a-select v-model:value="editForm.item_number" show-search allow-clear placeholder="请选择或输入产品编号"
                :options="productOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleProductChange(editForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="产品名称"><a-input v-model:value="editForm.item_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="标准工序编号">
              <a-select v-model:value="editForm.standard_process_number" show-search allow-clear placeholder="请选择"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleProcedureChange(editForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="标准工序名称"><a-input v-model:value="editForm.standard_process_name" disabled /></a-form-item></a-col>
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
          <a-col :span="12">
            <a-form-item label="后置工序编号">
              <a-select v-model:value="editForm.post_processing_sequence_number" show-search allow-clear placeholder="请选择或输入后置工序"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handlePostProcessChange(editForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="后置工序名称"><a-input v-model:value="editForm.post_processing_sequence_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="超额报工比例"><a-input v-model:value="editForm.excess_reporting_ratio" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="配料方式"><a-select v-model:value="editForm.ingredient_addition_method" allow-clear placeholder="请选择"><a-select-option value="备料">备料</a-select-option><a-select-option value="领料">领料</a-select-option></a-select></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="物料损耗率"><a-input v-model:value="editForm.material_wastage_rate" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="生产自动入库规则"><a-input v-model:value="editForm.production_automatic_inventory_entry_rules" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序物料投入编号"><a-input v-model:value="editForm.process_material_input_number" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序物料投入数量"><a-input v-model:value="editForm.process_material_input_quantity" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序物料投入单位"><a-input v-model:value="editForm.process_material_input_unit" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="倒冲"><a-input v-model:value="editForm.flowing_backward" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="默认仓库"><a-input v-model:value="editForm['default_ repository']" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <a-modal v-model:open="createModalVisible" title="新建工艺路线" @ok="handleCreateOk" okText="确认" cancelText="取消" width="750px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工艺路线编号"><a-input v-model:value="createForm.process_route_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工艺路线名称"><a-input v-model:value="createForm.process_route_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品编号">
              <a-select v-model:value="createForm.item_number" show-search allow-clear placeholder="请选择或输入产品编号"
                :options="productOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleProductChange(createForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="产品名称"><a-input v-model:value="createForm.item_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="标准工序编号">
              <a-select v-model:value="createForm.standard_process_number" show-search allow-clear placeholder="请选择"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleProcedureChange(createForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="标准工序名称"><a-input v-model:value="createForm.standard_process_name" disabled /></a-form-item></a-col>
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
          <a-col :span="12">
            <a-form-item label="后置工序编号">
              <a-select v-model:value="createForm.post_processing_sequence_number" show-search allow-clear placeholder="请选择或输入后置工序"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handlePostProcessChange(createForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="后置工序名称"><a-input v-model:value="createForm.post_processing_sequence_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="超额报工比例"><a-input v-model:value="createForm.excess_reporting_ratio" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="配料方式"><a-select v-model:value="createForm.ingredient_addition_method" allow-clear placeholder="请选择"><a-select-option value="备料">备料</a-select-option><a-select-option value="领料">领料</a-select-option></a-select></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="物料损耗率"><a-input v-model:value="createForm.material_wastage_rate" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="生产自动入库规则"><a-input v-model:value="createForm.production_automatic_inventory_entry_rules" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序物料投入编号"><a-input v-model:value="createForm.process_material_input_number" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序物料投入数量"><a-input v-model:value="createForm.process_material_input_quantity" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序物料投入单位"><a-input v-model:value="createForm.process_material_input_unit" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="倒冲"><a-input v-model:value="createForm.flowing_backward" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="默认仓库"><a-input v-model:value="createForm['default_ repository']" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
