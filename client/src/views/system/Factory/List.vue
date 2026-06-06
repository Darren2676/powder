<template>
  <div>
    <a-page-header title="工厂管理" style="padding: 0; margin-bottom: 16px;">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="handleCreate"><PlusOutlined /> 新建工厂</a-button>
        </a-space>
      </template>
    </a-page-header>

    <a-card :bordered="false" size="small">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索工厂编码/名称/简称"
            style="width: 240px"
            allow-clear
            @search="handleSearch"
          />
          <a-select
            v-model:value="statusFilter"
            placeholder="状态"
            style="width: 100px"
            allow-clear
            @change="handleSearch"
          >
            <a-select-option value="启用">启用</a-select-option>
            <a-select-option value="停用">停用</a-select-option>
          </a-select>
          <a-button @click="handleReset"><ReloadOutlined /></a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-if="column.key === 'is_headquarters'">
            <a-tag v-if="record.is_headquarters" color="blue">总部</a-tag>
            <span v-else style="color: #999;">-</span>
          </template>
          <template v-if="column.key === 'status'">
            <a-tag :color="record.status === '启用' ? 'green' : 'default'">
              {{ record.status || '启用' }}
            </a-tag>
          </template>
          <template v-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-popconfirm
                v-if="record.status === '启用'"
                title="确定要停用此工厂吗？"
                @confirm="handleToggleStatus(record)"
              >
                <a-button type="link" size="small" danger>停用</a-button>
              </a-popconfirm>
              <a-popconfirm
                v-else
                title="确定要启用此工厂吗？"
                @confirm="handleToggleStatus(record)"
              >
                <a-button type="link" size="small" style="color: #52c41a;">启用</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- Create/Edit Modal -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑工厂' : '新建工厂'"
      :confirm-loading="saving"
      width="560px"
      @ok="handleSave"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 16 }"
      >
        <a-form-item label="工厂编码" name="factory_code">
          <a-input
            v-model:value="formData.factory_code"
            placeholder="如: N, G, SH"
            :maxlength="10"
          />
        </a-form-item>
        <a-form-item label="工厂名称" name="factory_name">
          <a-input
            v-model:value="formData.factory_name"
            placeholder="如: 宁国工厂"
            :maxlength="100"
          />
        </a-form-item>
        <a-form-item label="工厂简称" name="factory_short">
          <a-input
            v-model:value="formData.factory_short"
            placeholder="如: 宁国，留空则使用全称"
            :maxlength="20"
          />
        </a-form-item>
        <a-form-item label="地址" name="address">
          <a-input
            v-model:value="formData.address"
            placeholder="工厂详细地址"
            :maxlength="200"
          />
        </a-form-item>
        <a-form-item label="联系人" name="contact_name">
          <a-input
            v-model:value="formData.contact_name"
            placeholder="联系人姓名"
            :maxlength="50"
          />
        </a-form-item>
        <a-form-item label="联系电话" name="contact_phone">
          <a-input
            v-model:value="formData.contact_phone"
            placeholder="联系电话"
            :maxlength="30"
          />
        </a-form-item>
        <a-form-item label="是否总部" name="is_headquarters">
          <a-switch v-model:checked="formData.is_headquarters" />
          <span style="margin-left: 8px; color: #999; font-size: 12px;">
            仅可设置一个总部，启用后 HQ 汇总报表将以此工厂汇总
          </span>
        </a-form-item>
        <a-form-item v-if="editingRecord" label="状态" name="status">
          <a-select v-model:value="formData.status">
            <a-select-option value="启用">启用</a-select-option>
            <a-select-option value="停用">停用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { useTableList } from '@/composables/useTableList'
import {
  getFactories,
  getFactoryById,
  createFactory,
  updateFactory,
  deleteFactory,
  type FactoryInfo
} from '@/api/system/factory'

const { loading, dataSource, searchText, pagination } = useTableList(getFactories)

const columns = [
  { title: '行号', key: 'rowIndex', width: 60, align: 'center' as const },
  { title: '工厂编码', dataIndex: 'factory_code', key: 'factory_code', width: 100 },
  { title: '工厂名称', dataIndex: 'factory_name', key: 'factory_name', width: 160 },
  { title: '简称', dataIndex: 'factory_short', key: 'factory_short', width: 80 },
  { title: '总部', key: 'is_headquarters', width: 70, align: 'center' as const },
  { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
  { title: '联系人', dataIndex: 'contact_name', key: 'contact_name', width: 90 },
  { title: '电话', dataIndex: 'contact_phone', key: 'contact_phone', width: 120 },
  { title: '状态', key: 'status', width: 70 },
  { title: '操作', key: 'action', width: 130, fixed: 'right' as const }
]

// Filter
const statusFilter = ref<string | undefined>(undefined)

// Custom fetch with status filter support
const customFetchData = () => {
  const params: Record<string, any> = {}
  if (statusFilter.value) params.status = statusFilter.value
  loading.value = true
  getFactories({
    page: pagination.current,
    limit: pagination.pageSize,
    search: searchText.value || undefined,
    ...params
  }).then((res: any) => {
    const data = res.data || res
    if (data.items !== undefined) {
      dataSource.value = data.items
      pagination.total = data.pagination?.total ?? data.total ?? 0
    } else if (Array.isArray(data)) {
      dataSource.value = data
    }
  }).catch((err: any) => {
    console.error('获取数据失败:', err)
  }).finally(() => {
    loading.value = false
  })
}

const handleSearch = () => {
  pagination.current = 1
  customFetchData()
}

const handleReset = () => {
  searchText.value = ''
  statusFilter.value = undefined
  pagination.current = 1
  customFetchData()
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  customFetchData()
}

// Form
const modalVisible = ref(false)
const saving = ref(false)
const formRef = ref()
const editingRecord = ref<FactoryInfo | null>(null)
const formData = reactive({
  factory_code: '',
  factory_name: '',
  factory_short: '',
  address: '',
  contact_name: '',
  contact_phone: '',
  is_headquarters: false,
  status: '启用'
})
const formRules = {
  factory_code: [{ required: true, message: '请输入工厂编码' }],
  factory_name: [{ required: true, message: '请输入工厂名称' }]
}

const handleCreate = () => {
  editingRecord.value = null
  formData.factory_code = ''
  formData.factory_name = ''
  formData.factory_short = ''
  formData.address = ''
  formData.contact_name = ''
  formData.contact_phone = ''
  formData.is_headquarters = false
  formData.status = '启用'
  modalVisible.value = true
}

const handleEdit = async (record: FactoryInfo) => {
  editingRecord.value = record
  formData.factory_code = record.factory_code
  formData.factory_name = record.factory_name
  formData.factory_short = record.factory_short || ''
  formData.address = record.address || ''
  formData.contact_name = record.contact_name || ''
  formData.contact_phone = record.contact_phone || ''
  formData.is_headquarters = !!record.is_headquarters
  formData.status = record.status || '启用'
  modalVisible.value = true
}

const handleSave = async () => {
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    const payload = {
      factory_code: formData.factory_code,
      factory_name: formData.factory_name,
      factory_short: formData.factory_short || undefined,
      address: formData.address || undefined,
      contact_name: formData.contact_name || undefined,
      contact_phone: formData.contact_phone || undefined,
      is_headquarters: formData.is_headquarters
    }

    if (editingRecord.value) {
      await updateFactory(editingRecord.value.id, {
        ...payload,
        status: formData.status
      })
      message.success('更新成功')
    } else {
      await createFactory(payload)
      message.success('创建成功')
    }
    modalVisible.value = false
    customFetchData()
  } catch (e: any) {
    message.error(e?.response?.data?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

const handleToggleStatus = async (record: FactoryInfo) => {
  try {
    const newStatus = record.status === '启用' ? '停用' : '启用'
    if (newStatus === '停用' && record.is_headquarters) {
      message.warning('总部工厂不可停用，请先取消总部标识')
      return
    }
    await updateFactory(record.id, { status: newStatus })
    message.success(newStatus === '启用' ? '已启用' : '已停用')
    customFetchData()
  } catch (e: any) {
    message.error(e?.response?.data?.message || '操作失败')
  }
}

onMounted(() => {
  customFetchData()
})
</script>
