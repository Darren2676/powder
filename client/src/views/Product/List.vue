<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { getProducts, createProduct, updateProduct, deleteProduct, exportProducts, importProducts } from '@/api/product'
import { getProductClasses } from '@/api/productClass'
import { getMateriaProperties } from '@/api/materiaProperty'

interface Product {
  item_number: string
  item_name: string
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

const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<Product[]>([])
const searchText = ref('')

// 产品分类选项
const productClassOptions = ref<{ product_class_number: string; product_class_name: string }[]>([])

const fetchProductClasses = async () => {
  try {
    const res = await getProductClasses({ page: 1, limit: 9999 })
    if (res.success) {
      productClassOptions.value = res.data.items
    }
  } catch {
    // ignore
  }
}

const handleProductClassChange = (value: string, form: Product) => {
  const found = productClassOptions.value.find(item => item.product_class_number === value)
  form.product_class_number = value
  form.product_class_name = found ? found.product_class_name : ''
}

// 物料属性选项
const materiaPropertyOptions = ref<{ materia_properties_number: string; materia_properties_name: string }[]>([])

const fetchMateriaProperties = async () => {
  try {
    const res = await getMateriaProperties({ page: 1, limit: 9999 })
    if (res.success) {
      materiaPropertyOptions.value = res.data.items
    }
  } catch {
    // ignore
  }
}

const emptyForm = (): Product => ({
  item_number: '',
  item_name: '',
  product_class_number: '',
  product_class_name: '',
  product_properties: '',
  basic_unit: '',
  specifications: '',
  product_drawing_number: '',
  rubber_compound_number: '',
  batch_production_quota: '',
  standard_pass_rate: ''
})

// 编辑弹窗
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Product>(emptyForm())

// 新建弹窗
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Product>(emptyForm())

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
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 180 },
  { title: '产品分类编号', dataIndex: 'product_class_number', key: 'product_class_number', width: 120 },
  { title: '产品分类名称', dataIndex: 'product_class_name', key: 'product_class_name', width: 120 },
  { title: '产品属性', dataIndex: 'product_properties', key: 'product_properties', width: 100 },
  { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 90 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 120, ellipsis: true },
  { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number', width: 120 },
  { title: '班产定额', dataIndex: 'batch_production_quota', key: 'batch_production_quota', width: 120 },
  { title: '标准合格率', dataIndex: 'standard_pass_rate', key: 'standard_pass_rate', width: 110 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getProducts({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch (err: any) {
    message.error('获取产品数据失败')
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

// 新建
const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.item_number) {
    message.warning('请输入产品编号')
    return
  }
  createLoading.value = true
  try {
    const res = await createProduct(createForm)
    if (res.success) {
      message.success('新建成功')
      createModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '新建失败')
    }
  } catch (err: any) {
    message.error('新建失败')
  } finally {
    createLoading.value = false
  }
}

// 编辑
const handleEdit = (record: Product) => {
  Object.assign(editForm, record)
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateProduct(editForm.item_number, editForm)
    if (res.success) {
      message.success('修改成功')
      editModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '修改失败')
    }
  } catch (err: any) {
    message.error('修改失败')
  } finally {
    editLoading.value = false
  }
}

// 删除
const handleDelete = (record: Product) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除产品 "${record.item_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteProduct(record.item_number)
        if (res.success) {
          message.success('删除成功')
          fetchData()
        } else {
          message.error(res.message || '删除失败')
        }
      } catch (err: any) {
        message.error('删除失败')
      }
    }
  })
}

const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const res = await exportProducts(searchText.value || undefined)
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'products.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch (err: any) {
    message.error('导出失败')
  }
}

const handleImportClick = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await importProducts(formData)
    if (res.success) {
      message.success(res.message || '导入成功')
      fetchData()
    } else {
      message.error(res.message || '导入失败')
    }
  } catch (err: any) {
    message.error('导入失败')
  } finally {
    target.value = ''
  }
}

onMounted(() => {
  fetchData()
  fetchProductClasses()
  fetchMateriaProperties()
})
</script>

<template>
  <div class="product-page">
    <a-card title="产品管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索产品编号/名称"
            style="width: 280px"
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

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :row-selection="rowSelection"
        :scroll="{ x: 1600, y: 'calc(100vh - 280px)' }"
        row-key="item_number"
        size="middle"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'action'">
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
    <a-modal
      v-model:open="editModalVisible"
      title="修改产品"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="产品编号">
          <a-input v-model:value="editForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="editForm.item_name" />
        </a-form-item>
        <a-form-item label="产品分类">
          <a-select
            :value="editForm.product_class_number"
            placeholder="请选择产品分类"
            show-search
            option-filter-prop="label"
            @change="(val: string) => handleProductClassChange(val, editForm)"
          >
            <a-select-option
              v-for="item in productClassOptions"
              :key="item.product_class_number"
              :value="item.product_class_number"
              :label="item.product_class_number + ' ' + item.product_class_name"
            >
              {{ item.product_class_number }} - {{ item.product_class_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="产品属性">
          <a-select
            v-model:value="editForm.product_properties"
            placeholder="请选择产品属性"
            show-search
            option-filter-prop="label"
          >
            <a-select-option
              v-for="item in materiaPropertyOptions"
              :key="item.materia_properties_name"
              :value="item.materia_properties_name"
              :label="item.materia_properties_number + ' ' + item.materia_properties_name"
            >
              {{ item.materia_properties_number }} - {{ item.materia_properties_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="基本单位">
          <a-input v-model:value="editForm.basic_unit" />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="editForm.specifications" />
        </a-form-item>
        <a-form-item label="产品图号">
          <a-input v-model:value="editForm.product_drawing_number" />
        </a-form-item>
        <a-form-item label="胶料编号">
          <a-input v-model:value="editForm.rubber_compound_number" />
        </a-form-item>
        <a-form-item label="班产定额">
          <a-input v-model:value="editForm.batch_production_quota" />
        </a-form-item>
        <a-form-item label="标准合格率">
          <a-input v-model:value="editForm.standard_pass_rate" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建产品"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="产品编号" required>
          <a-input v-model:value="createForm.item_number" placeholder="请输入产品编号" />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="createForm.item_name" placeholder="请输入产品名称" />
        </a-form-item>
        <a-form-item label="产品分类">
          <a-select
            :value="createForm.product_class_number"
            placeholder="请选择产品分类"
            show-search
            option-filter-prop="label"
            @change="(val: string) => handleProductClassChange(val, createForm)"
          >
            <a-select-option
              v-for="item in productClassOptions"
              :key="item.product_class_number"
              :value="item.product_class_number"
              :label="item.product_class_number + ' ' + item.product_class_name"
            >
              {{ item.product_class_number }} - {{ item.product_class_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="产品属性">
          <a-select
            v-model:value="createForm.product_properties"
            placeholder="请选择产品属性"
            show-search
            option-filter-prop="label"
          >
            <a-select-option
              v-for="item in materiaPropertyOptions"
              :key="item.materia_properties_name"
              :value="item.materia_properties_name"
              :label="item.materia_properties_number + ' ' + item.materia_properties_name"
            >
              {{ item.materia_properties_number }} - {{ item.materia_properties_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="基本单位">
          <a-input v-model:value="createForm.basic_unit" placeholder="请输入基本单位" />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="createForm.specifications" placeholder="请输入规格" />
        </a-form-item>
        <a-form-item label="产品图号">
          <a-input v-model:value="createForm.product_drawing_number" placeholder="请输入产品图号" />
        </a-form-item>
        <a-form-item label="胶料编号">
          <a-input v-model:value="createForm.rubber_compound_number" placeholder="请输入胶料编号" />
        </a-form-item>
        <a-form-item label="班产定额">
          <a-input v-model:value="createForm.batch_production_quota" placeholder="请输入班产定额" />
        </a-form-item>
        <a-form-item label="标准合格率">
          <a-input v-model:value="createForm.standard_pass_rate" placeholder="请输入标准合格率" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.product-page {
  padding: 0;
}
</style>
