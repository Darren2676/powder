<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, CopyOutlined } from '@ant-design/icons-vue'
import { getItems, getItemDetail, createItem, updateItem, deleteItem, exportItems, importItems } from '@/api/itemMaster'
import { getProductClasses } from '@/api/productClass'
import { getMaterialClasses } from '@/api/materialClass'
import { getMateriaProperties } from '@/api/materiaProperty'
import { getUnits } from '@/api/unit'

// ========== Tab定义 ==========
const tabs = [
  { key: '', label: '全部' },
  { key: '成品', label: '成品' },
  { key: '半成品', label: '半成品' },
  { key: '原材料', label: '原材料' },
  { key: '包材', label: '包材' },
  { key: '骨架', label: '骨架' },
  { key: '预成型件', label: '预成型件' }
]
const activeTab = ref('')

// ========== 基础状态 ==========
const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<any[]>([])
const searchText = ref('')

// ========== 分页 ==========
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

// ========== 下拉选项 ==========
const productClassOptions = ref<any[]>([])
const materialClassOptions = ref<any[]>([])
const materiaPropertyOptions = ref<{ label: string; value: string }[]>([])
const unitOptions = ref<{ label: string; value: string }[]>([])

const fetchProductClasses = async () => {
  try {
    const res = await getProductClasses({ page: 1, limit: 9999 })
    productClassOptions.value = res.data?.items || []
  } catch {}
}
const fetchMaterialClasses = async () => {
  try {
    const res = await getMaterialClasses({ page: 1, limit: 9999 })
    materialClassOptions.value = res.data?.items || []
  } catch {}
}
const fetchMateriaProperties = async () => {
  try {
    const res = await getMateriaProperties({ page: 1, limit: 9999 })
    const list = res.data?.items || []
    materiaPropertyOptions.value = list.map((p: any) => ({
      label: `${p.materia_properties_number} - ${p.materia_properties_name}`,
      value: p.materia_properties_name
    }))
  } catch {}
}
const fetchUnits = async () => {
  try {
    const res = await getUnits({ page: 1, limit: 9999 })
    const list = res.data?.items || []
    unitOptions.value = list.map((u: any) => ({
      label: `${u.unit_code} - ${u.unit_name}`,
      value: u.unit_name
    }))
  } catch {}
}

// 根据item_type获取分类选项
const getClassOptions = (itemType: string) => {
  if (itemType === '成品') {
    return productClassOptions.value.map((c: any) => ({
      label: `${c.product_class_number} - ${c.product_class_name}`,
      value: c.product_class_number,
      name: c.product_class_name
    }))
  }
  if (itemType === '原材料') {
    return materialClassOptions.value.map((c: any) => ({
      label: `${c.material_class_number} - ${c.material_class_name}`,
      value: c.material_class_number,
      name: c.material_class_name
    }))
  }
  // 半成品/包材共用产品分类
  return productClassOptions.value.map((c: any) => ({
    label: `${c.product_class_number} - ${c.product_class_name}`,
    value: c.product_class_number,
    name: c.product_class_name
  }))
}

const handleClassChange = (val: string, form: any) => {
  const itemType = form.item_type || activeTab.value
  const options = getClassOptions(itemType)
  const found = options.find((o: any) => o.value === val)
  form.item_class_number = val
  form.item_class_name = found ? found.name : ''
}

// ========== 动态列 ==========
const baseColumns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 180 },
  { title: '物品类型', dataIndex: 'item_type', key: 'item_type', width: 90 },
  { title: '物料属性', dataIndex: 'item_properties', key: 'item_properties', width: 100 },
  { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 90 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 140, ellipsis: true },
  { title: '业务范围', dataIndex: 'business_scope', key: 'business_scope', width: 120 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true }
]

const extColumns: Record<string, any[]> = {
  '成品': [
    { title: '分类编号', dataIndex: 'item_class_number', key: 'item_class_number', width: 110 },
    { title: '分类名称', dataIndex: 'item_class_name', key: 'item_class_name', width: 110 },
    { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 120, ellipsis: true },
    { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number', width: 120 },
    { title: '批次产量定额', dataIndex: 'batch_production_quota', key: 'batch_production_quota', width: 120 },
    { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate', width: 110 }
  ],
  '原材料': [
    { title: '供应商编号', dataIndex: 'supplier_number', key: 'supplier_number', width: 120 },
    { title: '供应商名称', dataIndex: 'supplier_name', key: 'supplier_name', width: 160 }
  ],
  '半成品': [
    { title: '来源BOM编号', dataIndex: 'source_bom_number', key: 'source_bom_number', width: 140 }
  ],
  '包材': [
    { title: '包材备注', dataIndex: 'packaging_remark', key: 'packaging_remark', width: 160, ellipsis: true }
  ],
  '骨架': [
    { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 120, ellipsis: true },
    { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate', width: 110 }
  ],
  '预成型件': [
    { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number', width: 120 },
    { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate', width: 110 }
  ]
}

const actionColumn = { title: '操作', key: 'action', width: 200, fixed: 'right' as const }

const columns = computed(() => {
  const cols = [...baseColumns]
  // 全部tab不显示item_type列以外的扩展列；特定tab隐藏item_type列并追加扩展列
  if (activeTab.value) {
    // 隐藏item_type列
    const filtered = cols.filter(c => c.key !== 'item_type')
    const ext = extColumns[activeTab.value] || []
    return [...filtered, ...ext, actionColumn]
  }
  return [...cols, actionColumn]
})

const scrollX = computed(() => {
  return columns.value.reduce((sum, c) => sum + (c.width || 100), 0)
})

// ========== 数据加载 ==========
const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined
    }
    if (activeTab.value) params.item_type = activeTab.value
    const res = await getItems(params)
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch {
    message.error('获取数据失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => {
  pagination.current = 1
  fetchData()
}

const handleReset = () => {
  searchText.value = ''
  pagination.current = 1
  fetchData()
}

const handleTabChange = (key: string) => {
  activeTab.value = key
  pagination.current = 1
  fetchData()
}

// ========== 业务范围多选转换 ==========
const scopeToArray = (val: any): string[] => {
  if (Array.isArray(val)) return val
  if (typeof val === 'string' && val) return val.split(',')
  return []
}
const scopeToString = (val: any): string => {
  if (Array.isArray(val)) return val.join(',')
  if (typeof val === 'string') return val
  return ''
}

// ========== 空表单 ==========
const emptyForm = () => ({
  item_number: '',
  item_name: '',
  item_type: activeTab.value || '成品',
  item_class_number: '',
  item_class_name: '',
  item_properties: '',
  basic_unit: '',
  specifications: '',
  business_scope: [] as string[],
  remark: '',
  // 成品扩展
  product_drawing_number: '',
  rubber_compound_number: '',
  batch_production_quota: '',
  standard_pass_rate: '',
  // 原材料扩展
  supplier_number: '',
  supplier_name: '',
  // 半成品扩展
  source_bom_number: '',
  // 包材扩展
  packaging_remark: ''
})

// ========== 新建弹窗 ==========
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<any>(emptyForm())

const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.item_number) { message.warning('请输入物料编号'); return }
  if (!createForm.item_type) { message.warning('请选择物品类型'); return }
  createLoading.value = true
  try {
    const res = await createItem({ ...createForm, business_scope: scopeToString(createForm.business_scope) })
    if (res.success) {
      message.success('新建成功')
      createModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '新建失败')
    }
  } catch {
    message.error('新建失败')
  } finally {
    createLoading.value = false
  }
}

// ========== 复制弹窗 ==========
const copyModalVisible = ref(false)
const copyLoading = ref(false)
const copyForm = reactive<any>(emptyForm())

const handleCopy = async (record: any) => {
  try {
    const res = await getItemDetail(record.item_number)
    if (res.success) {
      Object.assign(copyForm, emptyForm(), res.data)
      copyForm.item_number = ''
      copyForm.business_scope = scopeToArray(copyForm.business_scope)
    } else {
      Object.assign(copyForm, emptyForm(), record)
      copyForm.item_number = ''
      copyForm.business_scope = scopeToArray(copyForm.business_scope)
    }
  } catch {
    Object.assign(copyForm, emptyForm(), record)
    copyForm.item_number = ''
    copyForm.business_scope = scopeToArray(copyForm.business_scope)
  }
  copyModalVisible.value = true
}

const handleCopySubmit = async () => {
  if (!copyForm.item_number) { message.warning('请输入新的物料编号'); return }
  if (!copyForm.item_type) { message.warning('请选择物品类型'); return }
  copyLoading.value = true
  try {
    const res = await createItem({ ...copyForm, business_scope: scopeToString(copyForm.business_scope) })
    if (res.success) {
      message.success('复制成功')
      copyModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '复制失败，物料编号可能已存在')
    }
  } catch {
    message.error('复制失败')
  } finally {
    copyLoading.value = false
  }
}

// ========== 编辑弹窗 ==========
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<any>(emptyForm())

const handleEdit = (record: any) => {
  Object.assign(editForm, emptyForm(), record)
  editForm.business_scope = scopeToArray(editForm.business_scope)
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateItem(editForm.item_number, { ...editForm, business_scope: scopeToString(editForm.business_scope) })
    if (res.success) {
      message.success('修改成功')
      editModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '修改失败')
    }
  } catch {
    message.error('修改失败')
  } finally {
    editLoading.value = false
  }
}

// ========== 删除 ==========
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除 "${record.item_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteItem(record.item_number)
        if (res.success) {
          message.success('删除成功')
          fetchData()
        } else {
          message.error(res.message || '删除失败')
        }
      } catch {
        message.error('删除失败')
      }
    }
  })
}

// ========== 导入导出 ==========
const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const params: any = { search: searchText.value || undefined }
    if (activeTab.value) params.item_type = activeTab.value
    const res = await exportItems(params)
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `items_${activeTab.value || 'all'}.xlsx`
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch {
    message.error('导出失败')
  }
}

const handleImportClick = () => {
  if (!activeTab.value) {
    message.warning('请先选择具体的物品类型Tab后再导入')
    return
  }
  fileInputRef.value?.click()
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await importItems(formData, activeTab.value)
    if (res.success) {
      message.success(res.message || '导入成功')
      fetchData()
    } else {
      message.error(res.message || '导入失败')
    }
  } catch {
    message.error('导入失败')
  } finally {
    target.value = ''
  }
}

// ========== 初始化 ==========
onMounted(() => {
  fetchData()
  fetchProductClasses()
  fetchMaterialClasses()
  fetchMateriaProperties()
  fetchUnits()
})
</script>

<template>
  <div class="item-master-page">
    <a-card title="物品主数据管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索编号/名称/分类"
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
          <a-button @click="handleImportClick">
            <template #icon><UploadOutlined /></template>
            导入
          </a-button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".xlsx,.xls"
            style="display: none"
            @change="handleFileChange"
          />
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
        </a-space>
      </template>

      <!-- Tab切换 -->
      <a-tabs v-model:activeKey="activeTab" @change="handleTabChange" style="margin-bottom: 8px">
        <a-tab-pane v-for="tab in tabs" :key="tab.key" :tab="tab.label" />
      </a-tabs>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :row-selection="rowSelection"
        :scroll="{ x: scrollX, y: 'calc(100vh - 340px)' }"
        row-key="item_number"
        size="middle"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'item_type'">
            <a-tag :color="record.item_type === '成品' ? 'blue' : record.item_type === '原材料' ? 'green' : record.item_type === '半成品' ? 'orange' : record.item_type === '骨架' ? 'cyan' : record.item_type === '预成型件' ? 'geekblue' : 'purple'">
              {{ record.item_type }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'business_scope'">
            <template v-if="record.business_scope">
              <a-tag v-for="s in record.business_scope.split(',')" :key="s" color="blue" style="margin: 1px; font-size: 11px; padding: 0 4px; line-height: 18px">{{ s }}</a-tag>
            </template>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">
                <template #icon><EditOutlined /></template>
                修改
              </a-button>
              <a-button type="link" size="small" @click="handleCopy(record)">
                <template #icon><CopyOutlined /></template>
                复制
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

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建物料"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="640px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="物料编号" required>
          <a-input v-model:value="createForm.item_number" placeholder="请输入物料编号" />
        </a-form-item>
        <a-form-item label="物料名称">
          <a-input v-model:value="createForm.item_name" placeholder="请输入物料名称" />
        </a-form-item>
        <a-form-item label="物品类型" required>
          <a-select v-model:value="createForm.item_type" :disabled="!!activeTab">
            <a-select-option value="成品">成品</a-select-option>
            <a-select-option value="半成品">半成品</a-select-option>
            <a-select-option value="原材料">原材料</a-select-option>
            <a-select-option value="包材">包材</a-select-option>
            <a-select-option value="骨架">骨架</a-select-option>
            <a-select-option value="预成型件">预成型件</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="物料属性">
          <a-select
            v-model:value="createForm.item_properties"
            placeholder="请选择物料属性"
            show-search allow-clear
            :options="materiaPropertyOptions"
            :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
          />
        </a-form-item>
        <a-form-item label="基本单位">
          <a-select
            v-model:value="createForm.basic_unit"
            placeholder="请选择单位"
            show-search allow-clear
            :options="unitOptions"
            :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
          />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="createForm.specifications" placeholder="请输入规格" />
        </a-form-item>
        <a-form-item label="业务范围">
          <a-select v-model:value="createForm.business_scope" placeholder="请选择业务范围" mode="multiple" allow-clear>
            <a-select-option value="销售">销售</a-select-option>
            <a-select-option value="生产">生产</a-select-option>
            <a-select-option value="采购">采购</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="createForm.remark" placeholder="请输入备注" />
        </a-form-item>
        <!-- 成品扩展字段 -->
        <template v-if="createForm.item_type === '成品'">
          <a-form-item label="分类编号">
            <a-select
              :value="createForm.item_class_number"
              placeholder="请选择分类"
              show-search
              allow-clear
              :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
              @change="(val: string) => handleClassChange(val, createForm)"
            >
              <a-select-option
                v-for="opt in getClassOptions(createForm.item_type)"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              >{{ opt.label }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="分类名称">
            <a-input v-model:value="createForm.item_class_name" disabled />
          </a-form-item>
          <a-form-item label="产品图号">
            <a-input v-model:value="createForm.product_drawing_number" placeholder="请输入产品图号" />
          </a-form-item>
          <a-form-item label="胶料编号">
            <a-input v-model:value="createForm.rubber_compound_number" placeholder="请输入胶料编号" />
          </a-form-item>
          <a-form-item label="批次产量定额">
            <a-input v-model:value="createForm.batch_production_quota" placeholder="请输入批次产量定额" />
          </a-form-item>
          <a-form-item label="标准合格率">
            <a-input v-model:value="createForm.standard_pass_rate" placeholder="请输入标准合格率" />
          </a-form-item>
        </template>
        <!-- 原材料扩展字段 -->
        <template v-if="createForm.item_type === '原材料'">
          <a-form-item label="供应商编号">
            <a-input v-model:value="createForm.supplier_number" placeholder="请输入供应商编号" />
          </a-form-item>
          <a-form-item label="供应商名称">
            <a-input v-model:value="createForm.supplier_name" placeholder="请输入供应商名称" />
          </a-form-item>
        </template>
        <!-- 半成品扩展字段 -->
        <template v-if="createForm.item_type === '半成品'">
          <a-form-item label="来源BOM编号">
            <a-input v-model:value="createForm.source_bom_number" placeholder="请输入来源BOM编号" />
          </a-form-item>
        </template>
        <!-- 包材扩展字段 -->
        <template v-if="createForm.item_type === '包材'">
          <a-form-item label="包材备注">
            <a-input v-model:value="createForm.packaging_remark" placeholder="请输入包材备注" />
          </a-form-item>
        </template>
        <!-- 骨架扩展字段 -->
        <template v-if="createForm.item_type === '骨架'">
          <a-form-item label="产品图号">
            <a-input v-model:value="createForm.product_drawing_number" placeholder="请输入产品图号" />
          </a-form-item>
          <a-form-item label="标准合格率">
            <a-input v-model:value="createForm.standard_pass_rate" placeholder="请输入标准合格率" />
          </a-form-item>
        </template>
      </a-form>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editModalVisible"
      title="修改物料"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="640px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="物料编号">
          <a-input v-model:value="editForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="物料名称">
          <a-input v-model:value="editForm.item_name" />
        </a-form-item>
        <a-form-item label="物品类型">
          <a-select v-model:value="editForm.item_type" disabled>
            <a-select-option value="成品">成品</a-select-option>
            <a-select-option value="半成品">半成品</a-select-option>
            <a-select-option value="原材料">原材料</a-select-option>
            <a-select-option value="包材">包材</a-select-option>
            <a-select-option value="骨架">骨架</a-select-option>
            <a-select-option value="预成型件">预成型件</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="物料属性">
          <a-select
            v-model:value="editForm.item_properties"
            placeholder="请选择物料属性"
            show-search allow-clear
            :options="materiaPropertyOptions"
            :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
          />
        </a-form-item>
        <a-form-item label="基本单位">
          <a-select
            v-model:value="editForm.basic_unit"
            placeholder="请选择单位"
            show-search allow-clear
            :options="unitOptions"
            :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
          />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="editForm.specifications" />
        </a-form-item>
        <a-form-item label="业务范围">
          <a-select v-model:value="editForm.business_scope" placeholder="请选择业务范围" mode="multiple" allow-clear>
            <a-select-option value="销售">销售</a-select-option>
            <a-select-option value="生产">生产</a-select-option>
            <a-select-option value="采购">采购</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="editForm.remark" />
        </a-form-item>
        <!-- 成品扩展字段 -->
        <template v-if="editForm.item_type === '成品'">
          <a-form-item label="分类编号">
            <a-select
              :value="editForm.item_class_number"
              placeholder="请选择分类"
              show-search
              allow-clear
              :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
              @change="(val: string) => handleClassChange(val, editForm)"
            >
              <a-select-option
                v-for="opt in getClassOptions(editForm.item_type)"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              >{{ opt.label }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="分类名称">
            <a-input v-model:value="editForm.item_class_name" disabled />
          </a-form-item>
          <a-form-item label="产品图号">
            <a-input v-model:value="editForm.product_drawing_number" />
          </a-form-item>
          <a-form-item label="胶料编号">
            <a-input v-model:value="editForm.rubber_compound_number" />
          </a-form-item>
          <a-form-item label="批次产量定额">
            <a-input v-model:value="editForm.batch_production_quota" />
          </a-form-item>
          <a-form-item label="标准合格率">
            <a-input v-model:value="editForm.standard_pass_rate" />
          </a-form-item>
        </template>
        <!-- 原材料扩展字段 -->
        <template v-if="editForm.item_type === '原材料'">
          <a-form-item label="供应商编号">
            <a-input v-model:value="editForm.supplier_number" />
          </a-form-item>
          <a-form-item label="供应商名称">
            <a-input v-model:value="editForm.supplier_name" />
          </a-form-item>
        </template>
        <!-- 半成品扩展字段 -->
        <template v-if="editForm.item_type === '半成品'">
          <a-form-item label="来源BOM编号">
            <a-input v-model:value="editForm.source_bom_number" />
          </a-form-item>
        </template>
        <!-- 包材扩展字段 -->
        <template v-if="editForm.item_type === '包材'">
          <a-form-item label="包材备注">
            <a-input v-model:value="editForm.packaging_remark" />
          </a-form-item>
        </template>
        <!-- 骨架扩展字段 -->
        <template v-if="editForm.item_type === '骨架'">
          <a-form-item label="产品图号">
            <a-input v-model:value="editForm.product_drawing_number" />
          </a-form-item>
          <a-form-item label="标准合格率">
            <a-input v-model:value="editForm.standard_pass_rate" />
          </a-form-item>
        </template>
        <!-- 预成型件扩展字段 -->
        <template v-if="editForm.item_type === '预成型件'">
          <a-form-item label="胶料编号">
            <a-input v-model:value="editForm.rubber_compound_number" />
          </a-form-item>
          <a-form-item label="标准合格率">
            <a-input v-model:value="editForm.standard_pass_rate" />
          </a-form-item>
        </template>
      </a-form>
    </a-modal>
    <a-modal
      v-model:open="copyModalVisible"
      title="复制物料"
      :confirm-loading="copyLoading"
      @ok="handleCopySubmit"
      width="640px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="物料编号" required>
          <a-input v-model:value="copyForm.item_number" placeholder="请输入新的物料编号" />
        </a-form-item>
        <a-form-item label="物料名称">
          <a-input v-model:value="copyForm.item_name" />
        </a-form-item>
        <a-form-item label="物品类型">
          <a-select v-model:value="copyForm.item_type" disabled>
            <a-select-option value="成品">成品</a-select-option>
            <a-select-option value="半成品">半成品</a-select-option>
            <a-select-option value="原材料">原材料</a-select-option>
            <a-select-option value="包材">包材</a-select-option>
            <a-select-option value="骨架">骨架</a-select-option>
            <a-select-option value="预成型件">预成型件</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="物料属性">
          <a-select
            v-model:value="copyForm.item_properties"
            placeholder="请选择物料属性"
            show-search allow-clear
            :options="materiaPropertyOptions"
            :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
          />
        </a-form-item>
        <a-form-item label="基本单位">
          <a-select
            v-model:value="copyForm.basic_unit"
            placeholder="请选择单位"
            show-search allow-clear
            :options="unitOptions"
            :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
          />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="copyForm.specifications" />
        </a-form-item>
        <a-form-item label="业务范围">
          <a-select v-model:value="copyForm.business_scope" placeholder="请选择业务范围" mode="multiple" allow-clear>
            <a-select-option value="销售">销售</a-select-option>
            <a-select-option value="生产">生产</a-select-option>
            <a-select-option value="采购">采购</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="copyForm.remark" />
        </a-form-item>
        <!-- 成品扩展字段 -->
        <template v-if="copyForm.item_type === '成品'">
          <a-form-item label="分类编号">
            <a-select
              :value="copyForm.item_class_number"
              placeholder="请选择分类"
              show-search allow-clear
              :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
              @change="(val: string) => handleClassChange(val, copyForm)"
            >
              <a-select-option
                v-for="opt in getClassOptions(copyForm.item_type)"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              >{{ opt.label }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="分类名称">
            <a-input v-model:value="copyForm.item_class_name" disabled />
          </a-form-item>
          <a-form-item label="产品图号">
            <a-input v-model:value="copyForm.product_drawing_number" />
          </a-form-item>
          <a-form-item label="胶料编号">
            <a-input v-model:value="copyForm.rubber_compound_number" />
          </a-form-item>
          <a-form-item label="批次产量定额">
            <a-input v-model:value="copyForm.batch_production_quota" />
          </a-form-item>
          <a-form-item label="标准合格率">
            <a-input v-model:value="copyForm.standard_pass_rate" />
          </a-form-item>
        </template>
        <!-- 原材料扩展字段 -->
        <template v-if="copyForm.item_type === '原材料'">
          <a-form-item label="供应商编号">
            <a-input v-model:value="copyForm.supplier_number" />
          </a-form-item>
          <a-form-item label="供应商名称">
            <a-input v-model:value="copyForm.supplier_name" />
          </a-form-item>
        </template>
        <!-- 半成品扩展字段 -->
        <template v-if="copyForm.item_type === '半成品'">
          <a-form-item label="来源BOM编号">
            <a-input v-model:value="copyForm.source_bom_number" />
          </a-form-item>
        </template>
        <!-- 包材扩展字段 -->
        <template v-if="copyForm.item_type === '包材'">
          <a-form-item label="包材备注">
            <a-input v-model:value="copyForm.packaging_remark" />
          </a-form-item>
        </template>
        <!-- 骨架扩展字段 -->
        <template v-if="copyForm.item_type === '骨架'">
          <a-form-item label="产品图号">
            <a-input v-model:value="copyForm.product_drawing_number" />
          </a-form-item>
          <a-form-item label="标准合格率">
            <a-input v-model:value="copyForm.standard_pass_rate" />
          </a-form-item>
        </template>
        <!-- 预成型件扩展字段 -->
        <template v-if="copyForm.item_type === '预成型件'">
          <a-form-item label="胶料编号">
            <a-input v-model:value="copyForm.rubber_compound_number" />
          </a-form-item>
          <a-form-item label="标准合格率">
            <a-input v-model:value="copyForm.standard_pass_rate" />
          </a-form-item>
        </template>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.item-master-page {
  padding: 0;
}
</style>
