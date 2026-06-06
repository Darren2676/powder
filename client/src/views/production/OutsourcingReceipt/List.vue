<template>
  <div class="page-container">
    <a-card :bordered="false">
      <div class="table-header">
        <div class="table-header-left">
          <a-input-search v-model:value="searchText" placeholder="搜索收回单号/委外订单号/供应商" style="width: 360px" allow-clear @search="fetchList" @pressEnter="fetchList" />
          <a-select v-model:value="statusFilter" placeholder="状态" style="width: 120px; margin-left: 8px" allow-clear @change="fetchList">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="已审核">已审核</a-select-option>
          </a-select>
        </div>
        <div class="table-header-right">
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建收回单</a-button>
        </div>
      </div>

      <a-table
        :columns="columns" :data-source="tableData" :loading="loading"
        :pagination="{ current: page, pageSize: limit, total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
        @change="handleTableChange"
        :scroll="{ x: 1600 }" row-key="receipt_number" size="small" bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="record.status === '已审核' ? 'green' : 'default'">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'inspection_status'">
            <a-tag v-if="record.inspection_status" :color="record.inspection_status === '合格' ? 'green' : record.inspection_status === '不合格' ? 'red' : 'orange'">{{ record.inspection_status }}</a-tag>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="0" wrap>
              <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" danger @click="handleDelete(record)">删除</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" @click="handleApprove(record)">审核</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 查看/编辑弹窗 -->
    <a-modal v-model:open="detailVisible" :title="detailMode === 'edit' ? '编辑委外收回单' : '查看委外收回单'" :footer="detailMode === 'edit' ? undefined : null" @ok="handleEditOk" okText="保存" cancelText="取消" width="900px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="收回单号">
              <a-input v-model:value="detailData.receipt_number" disabled />
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
            <a-form-item label="收回日期">
              <a-date-picker v-model:value="detailData.receipt_date" format="YYYY/MM/DD" valueFormat="YYYY/MM/DD" style="width: 100%" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" />
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

      <h4>收回明细</h4>
      <a-table
        :columns="detailColumns" :data-source="detailRows" row-key="id" size="small" bordered
        :pagination="false" :scroll="{ x: 1000 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'received_quantity'">
            <a-input-number v-if="detailMode === 'edit' && detailData.status === '草稿'" v-model:value="record.received_quantity" :min="0" :precision="2" size="small" style="width: 100%" />
            <span v-else>{{ record.received_quantity }}</span>
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { getOutsourcingReceipts, createOutsourcingReceipt, approveReceipt } from '@/api/production/outsourcingReceipt'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchText = ref('')
const statusFilter = ref('')
const page = ref(1)
const limit = ref(20)
const total = ref(0)

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '收回单号', dataIndex: 'receipt_number', key: 'receipt_number', width: 150 },
  { title: '委外订单号', dataIndex: 'outsourcing_order_number', key: 'outsourcing_order_number', width: 150 },
  { title: '收回日期', dataIndex: 'receipt_date', key: 'receipt_date', width: 120 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150 },
  { title: '总数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 100 },
  { title: '状态', key: 'status', dataIndex: 'status', width: 100 },
  { title: '质检状态', key: 'inspection_status', dataIndex: 'inspection_status', width: 100 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const }
]

const detailColumns = [
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '收回数量', key: 'received_quantity', dataIndex: 'received_quantity', width: 120 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 }
]

const detailVisible = ref(false)
const detailMode = ref<'view' | 'edit'>('view')
const detailData = reactive<any>({
  receipt_number: '',
  outsourcing_order_number: '',
  receipt_date: '',
  warehouse_name: '',
  remark: '',
  status: ''
})
const detailRows = ref<any[]>([])

const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getOutsourcingReceipts({
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
    receipt_number: '',
    outsourcing_order_number: '',
    receipt_date: '',
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
    await createOutsourcingReceipt({ ...detailData, details: detailRows.value })
    message.success('创建成功')
    detailVisible.value = false
    fetchList()
  } catch (err) {
    message.error('操作失败')
  }
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除收回单 "${record.receipt_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        message.warning('删除功能待实现')
      } catch (err) {
        message.error('删除失败')
      }
    }
  })
}

const handleApprove = async (record: any) => {
  Modal.confirm({
    title: '审核收回单',
    content: `审核后将自动创建质检单，确定要继续吗？`,
    okText: '确定',
    okType: 'primary',
    cancelText: '取消',
    async onOk() {
      try {
        await approveReceipt(record.receipt_number)
        message.success('审核成功，已自动创建质检单')
        fetchList()
      } catch (err) {
        message.error('审核失败')
      }
    }
  })
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
