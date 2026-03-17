<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { getMoulds, createMould, updateMould, deleteMould, exportMoulds, importMoulds } from '@/api/mould'
import { getItems } from '@/api/itemMaster'

interface Mould {
  item_number: string
  item_name: string
  product_item_number: string
  product_net_weight: string
  unit_consumption: string
  formed_part_specifications: string
  formed_part_materia_consumption: string
  formed_parts_number: string
  design_cavities_number: string
  actual_cavities_number: string
  actual_operation_frequency: string
  design_operation_frequency: string
  design_production_number: string
  actual_production_number: string
  equipment_type: string
}

interface MouldRow extends Mould {
  product_number: string
  product_name: string
  product_class_number: string
  product_class_name: string
  product_properties: string
  basic_unit: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
  standard_pass_rate: string
}

interface Product {
  item_number: string
  item_name: string
}

const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<MouldRow[]>([])
const searchText = ref('')

// 产品搜索
const productOptions = ref<Product[]>([])
const productSearchLoading = ref(false)
let searchTimer: any = null

const handleProductSearch = (val: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!val) { productOptions.value = []; return }
  searchTimer = setTimeout(async () => {
    productSearchLoading.value = true
    try {
      const res = await getItems({ item_type: '成品', page: 1, limit: 20, search: val })
      if (res.success) productOptions.value = res.data.items
    } catch {}
    finally { productSearchLoading.value = false }
  }, 300)
}

const handleProductSelect = (val: string, form: Mould) => {
  form.product_item_number = val
}

const emptyForm = (): Mould => ({
  item_number: '',
  item_name: '',
  product_item_number: '',
  product_net_weight: '',
  unit_consumption: '',
  formed_part_specifications: '',
  formed_part_materia_consumption: '',
  formed_parts_number: '',
  design_cavities_number: '',
  actual_cavities_number: '',
  actual_operation_frequency: '',
  design_operation_frequency: '',
  design_production_number: '',
  actual_production_number: '',
  equipment_type: ''
})

const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Mould>(emptyForm())

const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Mould>(emptyForm())

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const columns = [
  { title: '模具编号', dataIndex: 'item_number', key: 'item_number' },
  { title: '模具名称', dataIndex: 'item_name', key: 'item_name' },
  { title: '产品编号', dataIndex: 'product_number', key: 'product_number' },
  { title: '产品净重', dataIndex: 'product_net_weight', key: 'product_net_weight' },
  { title: '单耗', dataIndex: 'unit_consumption', key: 'unit_consumption' },
  { title: '成型件规格', dataIndex: 'formed_part_specifications', key: 'formed_part_specifications' },
  { title: '成型件单耗', dataIndex: 'formed_part_materia_consumption', key: 'formed_part_materia_consumption' },
  { title: '成型件数量', dataIndex: 'formed_parts_number', key: 'formed_parts_number' },
  { title: '设计模穴数', dataIndex: 'design_cavities_number', key: 'design_cavities_number' },
  { title: '设计模次', dataIndex: 'design_operation_frequency', key: 'design_operation_frequency' },
  { title: '理论班产', dataIndex: 'design_production_number', key: 'design_production_number' },
  { title: '实际模穴数', dataIndex: 'actual_cavities_number', key: 'actual_cavities_number' },
  { title: '实际模次', dataIndex: 'actual_operation_frequency', key: 'actual_operation_frequency' },
  { title: '实际班产', dataIndex: 'actual_production_number', key: 'actual_production_number' },
  { title: '设备类型', dataIndex: 'equipment_type', key: 'equipment_type' },
  { title: '产品名称', dataIndex: 'product_name', key: 'product_name' },
  { title: '产品分类编号', dataIndex: 'product_class_number', key: 'product_class_number' },
  { title: '产品分类名称', dataIndex: 'product_class_name', key: 'product_class_name' },
  { title: '产品属性', dataIndex: 'product_properties', key: 'product_properties' },
  { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit' },
  { title: '规格', dataIndex: 'specifications', key: 'specifications' },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number' },
  { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number' },
  { title: '班产定额', dataIndex: 'batch_production_quota', key: 'batch_production_quota' },
  { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate' },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getMoulds({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch {
    message.error('获取模具数据失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; pagination.current = 1; fetchData() }

const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  productOptions.value = []
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.item_number) { message.warning('请输入模具编号'); return }
  createLoading.value = true
  try {
    const res = await createMould(createForm)
    if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '新建失败') }
  } catch { message.error('新建失败') }
  finally { createLoading.value = false }
}

const handleEdit = (record: MouldRow) => {
  const form = emptyForm()
  for (const key of Object.keys(form) as (keyof Mould)[]) {
    (form as any)[key] = (record as any)[key] || ''
  }
  // product_item_number 可能来自 record.product_item_number 或 record.product_number
  if (!form.product_item_number && record.product_number) {
    form.product_item_number = record.product_number
  }
  Object.assign(editForm, form)
  if (record.product_number) {
    productOptions.value = [{ item_number: record.product_number, item_name: record.product_name || '' }]
  }
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateMould(editForm.item_number, editForm)
    if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '修改失败') }
  } catch { message.error('修改失败') }
  finally { editLoading.value = false }
}

const handleDelete = (record: MouldRow) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除模具 "${record.item_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteMould(record.item_number)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const res = await exportMoulds(searchText.value || undefined)
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'moulds.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await importMoulds(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

const calcDesignProduction = (form: Mould) => {
  const cavities = parseFloat(form.design_cavities_number)
  const frequency = parseFloat(form.design_operation_frequency)
  if (!isNaN(cavities) && !isNaN(frequency)) {
    form.design_production_number = String(cavities * frequency)
  } else {
    form.design_production_number = ''
  }
}

const calcActualProduction = (form: Mould) => {
  const cavities = parseFloat(form.actual_cavities_number)
  const frequency = parseFloat(form.actual_operation_frequency)
  if (!isNaN(cavities) && !isNaN(frequency)) {
    form.actual_production_number = String(cavities * frequency)
  } else {
    form.actual_production_number = ''
  }
}

watch(() => [createForm.design_cavities_number, createForm.design_operation_frequency], () => {
  calcDesignProduction(createForm)
})

watch(() => [editForm.design_cavities_number, editForm.design_operation_frequency], () => {
  calcDesignProduction(editForm)
})

watch(() => [createForm.actual_cavities_number, createForm.actual_operation_frequency], () => {
  calcActualProduction(createForm)
})

watch(() => [editForm.actual_cavities_number, editForm.actual_operation_frequency], () => {
  calcActualProduction(editForm)
})

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="mould-page">
    <a-card title="模具管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索模具编号/名称/产品编号"
            style="width: 300px"
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
          <a-button @click="handleImportClick">
            <template #icon><UploadOutlined /></template>
            导入
          </a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        :row-selection="rowSelection"
        row-key="item_number"
        size="middle"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">
                <template #icon><EditOutlined /></template>
                修改
              </a-button>
              <a-button type="link" danger size="small" @click="handleDelete(record)">
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" title="修改模具" :confirm-loading="editLoading" @ok="handleEditSubmit" width="700px">
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 15 }">
        <a-form-item label="模具编号">
          <a-input v-model:value="editForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="模具名称">
          <a-input v-model:value="editForm.item_name" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-auto-complete
            v-model:value="editForm.product_item_number"
            placeholder="输入产品编号搜索"
            :options="productOptions.map(p => ({ value: p.item_number, label: p.item_number + ' - ' + p.item_name }))"
            @search="handleProductSearch"
            @select="(val: string) => handleProductSelect(val, editForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="产品净重">
          <a-input v-model:value="editForm.product_net_weight" />
        </a-form-item>
        <a-form-item label="单耗">
          <a-input v-model:value="editForm.unit_consumption" />
        </a-form-item>
        <a-form-item label="成型件规格">
          <a-input v-model:value="editForm.formed_part_specifications" />
        </a-form-item>
        <a-form-item label="成型件单耗">
          <a-input v-model:value="editForm.formed_part_materia_consumption" />
        </a-form-item>
        <a-form-item label="成型件数量">
          <a-input v-model:value="editForm.formed_parts_number" />
        </a-form-item>
        <a-form-item label="设计模穴数">
          <a-input v-model:value="editForm.design_cavities_number" />
        </a-form-item>
        <a-form-item label="设计模次">
          <a-input v-model:value="editForm.design_operation_frequency" />
        </a-form-item>
        <a-form-item label="理论班产">
          <a-input v-model:value="editForm.design_production_number" disabled />
        </a-form-item>
        <a-form-item label="实际模穴数">
          <a-input v-model:value="editForm.actual_cavities_number" />
        </a-form-item>
        <a-form-item label="实际模次">
          <a-input v-model:value="editForm.actual_operation_frequency" />
        </a-form-item>
        <a-form-item label="实际班产">
          <a-input v-model:value="editForm.actual_production_number" disabled />
        </a-form-item>
        <a-form-item label="设备类型">
          <a-input v-model:value="editForm.equipment_type" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建模具" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="700px">
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 15 }">
        <a-form-item label="模具编号" required>
          <a-input v-model:value="createForm.item_number" placeholder="请输入模具编号" />
        </a-form-item>
        <a-form-item label="模具名称">
          <a-input v-model:value="createForm.item_name" placeholder="请输入模具名称" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-auto-complete
            v-model:value="createForm.product_item_number"
            placeholder="输入产品编号搜索"
            :options="productOptions.map(p => ({ value: p.item_number, label: p.item_number + ' - ' + p.item_name }))"
            @search="handleProductSearch"
            @select="(val: string) => handleProductSelect(val, createForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="产品净重">
          <a-input v-model:value="createForm.product_net_weight" placeholder="请输入产品净重" />
        </a-form-item>
        <a-form-item label="单耗">
          <a-input v-model:value="createForm.unit_consumption" placeholder="请输入单耗" />
        </a-form-item>
        <a-form-item label="成型件规格">
          <a-input v-model:value="createForm.formed_part_specifications" placeholder="请输入成型件规格" />
        </a-form-item>
        <a-form-item label="成型件单耗">
          <a-input v-model:value="createForm.formed_part_materia_consumption" placeholder="请输入成型件单耗" />
        </a-form-item>
        <a-form-item label="成型件数量">
          <a-input v-model:value="createForm.formed_parts_number" placeholder="请输入成型件数量" />
        </a-form-item>
        <a-form-item label="设计模穴数">
          <a-input v-model:value="createForm.design_cavities_number" placeholder="请输入设计模穴数" />
        </a-form-item>
        <a-form-item label="设计模次">
          <a-input v-model:value="createForm.design_operation_frequency" placeholder="请输入设计模次" />
        </a-form-item>
        <a-form-item label="理论班产">
          <a-input v-model:value="createForm.design_production_number" disabled placeholder="自动计算" />
        </a-form-item>
        <a-form-item label="实际模穴数">
          <a-input v-model:value="createForm.actual_cavities_number" placeholder="请输入实际模穴数" />
        </a-form-item>
        <a-form-item label="实际模次">
          <a-input v-model:value="createForm.actual_operation_frequency" placeholder="请输入实际模次" />
        </a-form-item>
        <a-form-item label="实际班产">
          <a-input v-model:value="createForm.actual_production_number" disabled placeholder="自动计算" />
        </a-form-item>
        <a-form-item label="设备类型">
          <a-input v-model:value="createForm.equipment_type" placeholder="请输入设备类型" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.mould-page {
  padding: 0;
}
</style>
