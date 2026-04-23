<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { getMaterials, updateMaterial, deleteMaterial, createMaterial, exportMaterials, importMaterials } from '@/api/master-data/material'
import { getMaterialClasses } from '@/api/master-data/materialClass'
import { getMateriaProperties } from '@/api/master-data/materiaProperty'
import { getUnits } from '@/api/master-data/unit'
import { createVNode } from 'vue'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'

interface Material {
  item_number: string
  item_name: string
  material_class_number: string
  material_class_name: string
  material_properties: string
  supplier_number: string
  supplier_name: string
  basic_unit: string
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Material>(getMaterials)

// 编辑弹窗相关
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Material>({
  item_number: '',
  item_name: '',
  material_class_number: '',
  material_class_name: '',
  material_properties: '',
  supplier_number: '',
  supplier_name: '',
  basic_unit: ''
})

// 新建弹窗相关
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Material>({
  item_number: '',
  item_name: '',
  material_class_number: '',
  material_class_name: '',
  material_properties: '',
  supplier_number: '',
  supplier_name: '',
  basic_unit: ''
})

// 物料分类下拉数据
const materialClassList = ref<any[]>([])
const materialClassOptions = ref<{ label: string; value: string }[]>([])
const fetchMaterialClasses = async () => {
  try {
    const res = await getMaterialClasses({ page: 1, limit: 9999 })
    const list = res.data?.items || res.items || []
    materialClassList.value = list
    materialClassOptions.value = list.map((c: any) => ({ label: `${c.material_class_number} - ${c.material_class_name}`, value: c.material_class_number }))
  } catch {}
}
const handleMaterialClassChange = (form: Material, val: string) => {
  form.material_class_number = val
  const found = materialClassList.value.find((c: any) => c.material_class_number === val)
  form.material_class_name = found ? found.material_class_name : ''
}

// 物料属性下拉数据
const materiaPropertyList = ref<any[]>([])
const materiaPropertyOptions = ref<{ label: string; value: string }[]>([])
const fetchMateriaProperties = async () => {
  try {
    const res = await getMateriaProperties({ page: 1, limit: 9999 })
    const list = res.data?.items || res.items || []
    materiaPropertyList.value = list
    materiaPropertyOptions.value = list.map((p: any) => ({ label: `${p.materia_properties_number} - ${p.materia_properties_name}`, value: p.materia_properties_name }))
  } catch {}
}

// 单位下拉数据
const unitOptions = ref<{ label: string; value: string }[]>([])
const fetchUnits = async () => {
  try {
    const res = await getUnits({ page: 1, limit: 9999 })
    const list = res.data?.items || res.items || []
    unitOptions.value = list.map((u: any) => ({ label: `${u.unit_code} - ${u.unit_name}`, value: u.unit_name }))
  } catch {}
}

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  {
    title: '物料编号',
    dataIndex: 'item_number',
    key: 'item_number',
    width: 120
  },
  {
    title: '物料名称',
    dataIndex: 'item_name',
    key: 'item_name',
    width: 220
  },
  {
    title: '物料分类编号',
    dataIndex: 'material_class_number',
    key: 'material_class_number',
    width: 130
  },
  {
    title: '物料分类名称',
    dataIndex: 'material_class_name',
    key: 'material_class_name',
    width: 130
  },
  {
    title: '物料属性',
    dataIndex: 'material_properties',
    key: 'material_properties',
    width: 100
  },
  {
    title: '供应商编号',
    dataIndex: 'supplier_number',
    key: 'supplier_number',
    width: 120
  },
  {
    title: '供应商名称',
    dataIndex: 'supplier_name',
    key: 'supplier_name',
    width: 160
  },
  {
    title: '基本单位',
    dataIndex: 'basic_unit',
    key: 'basic_unit',
    width: 90
  },
  {
    title: '操作',
    key: 'action',
    width: 150,
    fixed: 'right' as const
  }
]

// 打开新建弹窗
const handleCreate = () => {
  Object.assign(createForm, {
    item_number: '',
    item_name: '',
    material_class_number: '',
    material_class_name: '',
    material_properties: '',
    supplier_number: '',
    supplier_name: '',
    basic_unit: ''
  })
  createModalVisible.value = true
}

// 提交新建
const handleCreateSubmit = async () => {
  if (!createForm.item_number) {
    message.warning('请输入物料编号')
    return
  }
  createLoading.value = true
  try {
    const res = await createMaterial(createForm)
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

// 打开编辑弹窗
const handleEdit = (record: Material) => {
  Object.assign(editForm, record)
  editModalVisible.value = true
}

// 提交编辑
const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateMaterial(editForm.item_number, editForm)
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

// 删除物料
const handleDelete = (record: Material) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除物料 "${record.item_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteMaterial(record.item_number)
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
    const res = await exportMaterials(searchText.value || undefined)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('materials')
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
    const res = await importMaterials(formData)
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
  fetchMaterialClasses()
  fetchMateriaProperties()
  fetchUnits()
})
</script>

<template>
  <div class="material-page">
    <a-card title="物料管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索物料编号/名称/供应商"
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
        :scroll="{ x: 1250, y: 'calc(100vh - 280px)' }"
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
      title="修改物料"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="物料编号">
          <a-input v-model:value="editForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="物料名称">
          <a-input v-model:value="editForm.item_name" />
        </a-form-item>
        <a-form-item label="物料分类编号">
          <a-select v-model:value="editForm.material_class_number" show-search allow-clear placeholder="请选择或搜索物料分类"
            :options="materialClassOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
            @change="(val: string) => handleMaterialClassChange(editForm, val)" />
        </a-form-item>
        <a-form-item label="物料分类名称">
          <a-input v-model:value="editForm.material_class_name" disabled />
        </a-form-item>
        <a-form-item label="物料属性">
          <a-select v-model:value="editForm.material_properties" show-search allow-clear placeholder="请选择或搜索物料属性"
            :options="materiaPropertyOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
        </a-form-item>
        <a-form-item label="供应商编号">
          <a-input v-model:value="editForm.supplier_number" />
        </a-form-item>
        <a-form-item label="供应商名称">
          <a-input v-model:value="editForm.supplier_name" />
        </a-form-item>
        <a-form-item label="基本单位">
          <a-select v-model:value="editForm.basic_unit" show-search allow-clear placeholder="请选择单位"
            :options="unitOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建物料"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="物料编号" required>
          <a-input v-model:value="createForm.item_number" placeholder="请输入物料编号" />
        </a-form-item>
        <a-form-item label="物料名称">
          <a-input v-model:value="createForm.item_name" placeholder="请输入物料名称" />
        </a-form-item>
        <a-form-item label="物料分类编号">
          <a-select v-model:value="createForm.material_class_number" show-search allow-clear placeholder="请选择或搜索物料分类"
            :options="materialClassOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
            @change="(val: string) => handleMaterialClassChange(createForm, val)" />
        </a-form-item>
        <a-form-item label="物料分类名称">
          <a-input v-model:value="createForm.material_class_name" disabled />
        </a-form-item>
        <a-form-item label="物料属性">
          <a-select v-model:value="createForm.material_properties" show-search allow-clear placeholder="请选择或搜索物料属性"
            :options="materiaPropertyOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
        </a-form-item>
        <a-form-item label="供应商编号">
          <a-input v-model:value="createForm.supplier_number" placeholder="请输入供应商编号" />
        </a-form-item>
        <a-form-item label="供应商名称">
          <a-input v-model:value="createForm.supplier_name" placeholder="请输入供应商名称" />
        </a-form-item>
        <a-form-item label="基本单位">
          <a-select v-model:value="createForm.basic_unit" show-search allow-clear placeholder="请选择单位"
            :options="unitOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.material-page {
  padding: 0;
}
</style>
