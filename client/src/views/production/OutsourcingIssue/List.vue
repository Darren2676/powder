<template>
  <div class="page-container">
    <a-card :bordered="false">
      <div class="table-header">
        <div class="table-header-left">
          <a-input-search v-model:value="searchText" placeholder="搜索发料单号/委外订单号/供应商" style="width: 360px" allow-clear @search="fetchList" @pressEnter="fetchList" />
          <a-select v-model:value="statusFilter" placeholder="状态" style="width: 120px; margin-left: 8px" allow-clear @change="fetchList">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="已审核">已审核</a-select-option>
            <a-select-option value="已发料">已发料</a-select-option>
          </a-select>
        </div>
        <div class="table-header-right">
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建发料单</a-button>
        </div>
      </div>

      <a-table
        :columns="columns" :data-source="tableData" :loading="loading"
        :pagination="{ current: page, pageSize: limit, total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
        @change="handleTableChange"
        :scroll="{ x: 1600 }" row-key="issue_number" size="small" bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="record.status === '已发料' ? 'green' : record.status === '已审核' ? 'blue' : 'default'">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="0" wrap>
              <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" danger @click="handleDelete(record)">删除</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" @click="handleApprove(record)">审核</a-button>
              <a-button v-if="record.status === '已审核'" type="link" size="small" style="color: #1890ff" @click="handleConfirm(record)">确认发料</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 查看/编辑弹窗 -->
    <a-modal v-model:open="detailVisible" :title="detailMode === 'edit' ? '编辑委外发料单' : '查看委外发料单'" :footer="detailMode === 'edit' ? undefined : null" @ok="handleEditOk" okText="保存" cancelText="取消" width="900px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="发料单号">
              <a-input v-model:value="detailData.issue_number" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="委外订单号">
              <a-input v-model:value="detailData.outsourcing_order_number" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="发料日期">
              <a-date-picker v-model:value="detailData.issue_date" format="YYYY/MM/DD" valueFormat="YYYY/MM/DD" style="width: 100%" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="仓库">
              <a-input v-model:value="detailData.warehouse_name" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="备注">
              <a-textarea v-model:value="detailData.remark" :rows="2" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>

      <h4>发料明细</h4>
      <a-table
        :columns="detailColumns" :data-source="detailRows" row-key="id" size="small" bordered
        :pagination="false" :scroll="{ x: 1000 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'issued_quantity'">
            <a-input-number v-if="detailMode === 'edit' && detailData.status === '草稿'" v-model:value="record.issued_quantity" :min="0" :precision="2" size="small" style="width: 100%" />
            <span v-else>{{ record.issued_quantity }}</span>
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { getOutsourcingIssues, createOutsourcingIssue, updateOutsourcingIssue, deleteOutsourcingIssue, approveIssue, confirmIssue, exportOutsourcingIssues } from '@/api/production/outsourcingIssue'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchText = ref('')
const statusFilter = ref('')
const page = ref(1)
const limit = ref(20)
const total = ref(0)

const columns = [
  { title: '发料单号', dataIndex: 'issue_number', key: 'issue_number', width: 150 },
  { title: '委外订单号', dataIndex: 'outsourcing_order_number', key: 'outsourcing_order_number', width: 150 },
  { title: '发料日期', dataIndex: 'issue_date', key: 'issue_date', width: 120 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150 },
  { title: '总数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 100 },
  { title: '状态', key: 'status', dataIndex: 'status', width: 100 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '操作', key: 'action', width: 240, fixed: 'right' as const }
]

const detailColumns = [
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '应发数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100 },
  { title: '实发数量', key: 'issued_quantity', dataIndex: 'issued_quantity', width: 120 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 }
]

const detailVisible = ref(false)
const detailMode = ref<'view' | 'edit'>('view')
const detailData = reactive<any>({
  issue_number: '',
  outsourcing_order_number: '',
  issue_date: '',
  warehouse_name: '',
  remark: '',
  status: ''
})
const detailRows = ref<any[]>([])

const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getOutsourcingIssues({
      page: page.value,
      limit: limit.value,
      search: searchText.value,
      status: statusFilter.value
    })
    if (res.success) {
      tableData.value = res.data.items
      total.value = res.data.pagination.total
    }
  } catch (err) {
    message.error('获取列表失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  page.value = pag.current
  limit.value = pag.pageSize
  fetchList()
}

const handleCreate = () => {
  detailMode.value = 'edit'
  Object.assign(detailData, {
    issue_number: '',
    outsourcing_order_number: '',
    issue_date: '',
    warehouse_name: '',
    remark: '',
    status: '草稿'
  })
  detailRows.value = []
  detailVisible.value = true
}

const handleEdit = (record: any) => {
  detailMode.value = 'edit'
  Object.assign(detailData, record)
  detailVisible.value = true
}

const handleView = (record: any) => {
  detailMode.value = 'view'
  Object.assign(detailData, record)
  detailVisible.value = true
}

const handleEditOk = async () => {
  try {
    if (detailData.issue_number) {
      await updateOutsourcingIssue(detailData.issue_number, detailData)
      message.success('更新成功')
    } else {
      await createOutsourcingIssue({ ...detailData, details: detailRows.value })
      message.success('创建成功')
    }
    detailVisible.value = false
    fetchList()
  } catch (err) {
    message.error('操作失败')
  }
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除发料单 "${record.issue_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deleteOutsourcingIssue(record.issue_number)
        message.success('删除成功')
        fetchList()
      } catch (err) {
        message.error('删除失败')
      }
    }
  })
}

const handleApprove = async (record: any) => {
  try {
    await approveIssue(record.issue_number)
    message.success('审核成功')
    fetchList()
  } catch (err) {
    message.error('审核失败')
  }
}

const handleConfirm = async (record: any) => {
  Modal.confirm({
    title: '确认发料',
    content: `确认发料后将扣减库存，确定要继续吗？`,
    okText: '确定',
    okType: 'primary',
    cancelText: '取消',
    async onOk() {
      try {
        await confirmIssue(record.issue_number)
        message.success('发料成功，库存已扣减')
        fetchList()
      } catch (err) {
        message.error('发料失败')
      }
    }
  })
}

const handleExport = async () => {
  try {
    const res: any = await exportOutsourcingIssues(searchText.value)
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `委外发料单_${new Date().getTime()}.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (err) {
    message.error('导出失败')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.page-container {
  padding: 0;
}
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.table-header-left {
  display: flex;
  align-items: center;
}
.table-header-right {
  display: flex;
  gap: 8px;
}
</style>
