<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined,
  DownOutlined
} from '@ant-design/icons-vue'
import { getProductionlines, createProductionline, updateProductionline, deleteProductionline, exportProductionlines, importProductionlines, approveProductionline, withdrawProductionline } from '@/api/master-data/productionline'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

interface Productionline {
  productionline_number?: number
  productionline_name: string
  remark: string
}

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Productionline>(getProductionlines)

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const editForm = reactive<Productionline>({
  productionline_number: undefined,
  productionline_name: '',
  remark: ''
})
const createForm = reactive<Productionline>({
  productionline_number: undefined,
  productionline_name: '',
  remark: ''
})

const fileInputRef = ref<HTMLInputElement>()

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  {
    title: '生产线编号',
    dataIndex: 'productionline_number',
    key: 'productionline_number',
    width: 120
  },
  {
    title: '生产线名称',
    dataIndex: 'productionline_name',
    key: 'productionline_name'
  },
  {
    title: '备注',
    dataIndex: 'remark',
    key: 'remark'
  },
  {
    title: '审核状态',
    dataIndex: 'approval_status',
    key: 'approval_status',
    width: 100
  },
  {
    title: '操作',
    key: 'action',
    width: 120
  }
]

const handleEdit = (record: Productionline) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  editForm.productionline_number = record.productionline_number
  editForm.productionline_name = record.productionline_name
  editForm.remark = record.remark
  editModalVisible.value = true
}

const handleDelete = (record: Productionline) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除生产线"${record.productionline_name}"吗?`,
    okText: '确认',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteProductionline(record.productionline_number!)
        message.success('删除成功')
        fetchData()
      } catch (error) {
        message.error('删除失败')
      }
    }
  })
}

const handleEditOk = async () => {
  try {
    await updateProductionline(editForm.productionline_number!, editForm)
    message.success('更新成功')
    editModalVisible.value = false
    fetchData()
  } catch (error) {
    message.error('更新失败')
  }
}

const handleCreateOk = async () => {
  try {
    await createProductionline(createForm)
    message.success('创建成功')
    createModalVisible.value = false
    Object.assign(createForm, {
      productionline_number: undefined,
      productionline_name: '',
      remark: ''
    })
    fetchData()
  } catch (error) {
    message.error('创建失败')
  }
}

const handleExport = async () => {
  try {
    const res = await exportProductionlines()
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('productionlines')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch (error) {
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
    await importProductionlines(formData)
    message.success('导入成功')
    fetchData()
  } catch (error) {
    message.error('导入失败')
  } finally {
    target.value = ''
  }
}

const handleToggleStatus = async (record: Productionline) => {
  try {
    await toggleProductionlineStatus(record.productionline_number!)
    message.success('状态更新成功')
    fetchData()
  } catch (error) {
    message.error('状态更新失败')
  }
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveProductionline(record.productionline_number!)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消生产线「${(record.productionline_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawProductionline(record.productionline_number!)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div>
    <a-card title="生产线管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索生产线名称"
            style="width: 200px"
            @search="handleSearch"
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
          <a-button type="primary" @click="createModalVisible = true">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".xlsx,.xls"
            style="display: none"
            @change="handleFileChange"
          />
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :row-key="(record: Productionline) => record.productionline_number!"
        :row-selection="rowSelection"
        :pagination="pagination"
        :scroll="{ y: 'calc(100vh - 280px)' }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">
                编辑
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
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

    <!-- 编辑模态框 -->
    <a-modal
      v-model:open="editModalVisible"
      title="编辑生产线"
      @ok="handleEditOk"
      okText="确认"
      cancelText="取消"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="生产线编号">
          <a-input v-model:value="editForm.productionline_number" disabled />
        </a-form-item>
        <a-form-item label="生产线名称">
          <a-input v-model:value="editForm.productionline_name" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="4" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建模态框 -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建生产线"
      @ok="handleCreateOk"
      okText="确认"
      cancelText="取消"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="生产线编号">
          <a-input v-model:value="createForm.productionline_number" />
        </a-form-item>
        <a-form-item label="生产线名称">
          <a-input v-model:value="createForm.productionline_name" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="4" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) {
  padding: 0;
}
</style>
