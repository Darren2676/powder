<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, exportCustomers, importCustomers } from '@/api/customer'

interface Customer {
  customer_number: string
  customer_name: string
  country: string
  region: string
  head_of_sales: string
  linkman: string
  contacts: string
  detail_address: string
  telephone: string
}

const loading = ref(false)
const selectedRowKeys = ref<string[]>([])
const rowSelection = {
  selectedRowKeys,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}
const dataSource = ref<Customer[]>([])
const searchText = ref('')

const emptyForm = (): Customer => ({
  customer_number: '',
  customer_name: '',
  country: '',
  region: '',
  head_of_sales: '',
  linkman: '',
  contacts: '',
  detail_address: '',
  telephone: ''
})

// 编辑弹窗
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Customer>(emptyForm())

// 新建弹窗
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Customer>(emptyForm())

// 导入
const importLoading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

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
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 120 },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 180 },
  { title: '国家', dataIndex: 'country', key: 'country', width: 100 },
  { title: '地区', dataIndex: 'region', key: 'region', width: 100 },
  { title: '销售负责人', dataIndex: 'head_of_sales', key: 'head_of_sales', width: 120 },
  { title: '联系人', dataIndex: 'linkman', key: 'linkman', width: 100 },
  { title: '联系方式', dataIndex: 'contacts', key: 'contacts', width: 120 },
  { title: '电话', dataIndex: 'telephone', key: 'telephone', width: 120 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getCustomers({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch (err: any) {
    message.error('获取客户数据失败')
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
  if (!createForm.customer_number) {
    message.warning('请输入客户编号')
    return
  }
  createLoading.value = true
  try {
    const res = await createCustomer(createForm)
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
const handleEdit = (record: Customer) => {
  Object.assign(editForm, record)
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const res = await updateCustomer(editForm.customer_number, editForm)
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
const handleDelete = (record: Customer) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除客户 "${record.customer_name}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteCustomer(record.customer_number)
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

// 导出
const handleExport = async () => {
  try {
    const res = await exportCustomers()
    const blob = new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'customers.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (err) {
    message.error('导出失败')
  }
}

// 导入
const handleImportClick = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    importLoading.value = true
    const formData = new FormData()
    formData.append('file', file)
    const res = await importCustomers(formData)
    if (res.success) {
      message.success(res.message || '导入成功')
      fetchData()
    } else {
      message.error(res.message || '导入失败')
    }
  } catch {
    message.error('导入失败')
  } finally {
    importLoading.value = false
    target.value = ''
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="customer-page">
    <a-card title="客户管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索客户编号/名称/联系人"
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
          <a-button @click="handleImportClick" :loading="importLoading">
            <template #icon><UploadOutlined /></template>
            导入
          </a-button>
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :row-selection="rowSelection"
        :scroll="{ x: 1200, y: 'calc(100vh - 280px)' }"
        row-key="customer_number"
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
      title="修改客户"
      :confirm-loading="editLoading"
      @ok="handleEditSubmit"
      width="650px"
    >
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="客户编号">
          <a-input v-model:value="editForm.customer_number" disabled />
        </a-form-item>
        <a-form-item label="客户名称">
          <a-input v-model:value="editForm.customer_name" />
        </a-form-item>
        <a-form-item label="国家">
          <a-input v-model:value="editForm.country" />
        </a-form-item>
        <a-form-item label="地区">
          <a-input v-model:value="editForm.region" />
        </a-form-item>
        <a-form-item label="销售负责人">
          <a-input v-model:value="editForm.head_of_sales" />
        </a-form-item>
        <a-form-item label="联系人">
          <a-input v-model:value="editForm.linkman" />
        </a-form-item>
        <a-form-item label="联系方式">
          <a-input v-model:value="editForm.contacts" />
        </a-form-item>
        <a-form-item label="详细地址">
          <a-input v-model:value="editForm.detail_address" />
        </a-form-item>
        <a-form-item label="电话">
          <a-input v-model:value="editForm.telephone" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建客户"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      width="650px"
    >
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="客户编号" required>
          <a-input v-model:value="createForm.customer_number" placeholder="请输入客户编号" />
        </a-form-item>
        <a-form-item label="客户名称">
          <a-input v-model:value="createForm.customer_name" placeholder="请输入客户名称" />
        </a-form-item>
        <a-form-item label="国家">
          <a-input v-model:value="createForm.country" placeholder="请输入国家" />
        </a-form-item>
        <a-form-item label="地区">
          <a-input v-model:value="createForm.region" placeholder="请输入地区" />
        </a-form-item>
        <a-form-item label="销售负责人">
          <a-input v-model:value="createForm.head_of_sales" placeholder="请输入销售负责人" />
        </a-form-item>
        <a-form-item label="联系人">
          <a-input v-model:value="createForm.linkman" placeholder="请输入联系人" />
        </a-form-item>
        <a-form-item label="联系方式">
          <a-input v-model:value="createForm.contacts" placeholder="请输入联系方式" />
        </a-form-item>
        <a-form-item label="详细地址">
          <a-input v-model:value="createForm.detail_address" placeholder="请输入详细地址" />
        </a-form-item>
        <a-form-item label="电话">
          <a-input v-model:value="createForm.telephone" placeholder="请输入电话" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.customer-page {
  padding: 0;
}
</style>
