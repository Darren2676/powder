<template>
  <div class="page-container">
    <a-card :bordered="false">
      <div class="table-header">
        <div class="table-header-left">
          <a-input-search v-model:value="searchText" placeholder="搜索结算单号/委外订单号" style="width: 360px" allow-clear @search="fetchList" @pressEnter="fetchList" />
          <a-select v-model:value="paymentFilter" placeholder="付款状态" style="width: 120px; margin-left: 8px" allow-clear @change="fetchList">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="未付款">未付款</a-select-option>
            <a-select-option value="部分付款">部分付款</a-select-option>
            <a-select-option value="已付款">已付款</a-select-option>
          </a-select>
        </div>
        <div class="table-header-right">
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建结算单</a-button>
        </div>
      </div>

      <a-table
        :columns="columns" :data-source="tableData" :loading="loading"
        :pagination="{ current: page, pageSize: limit, total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
        @change="handleTableChange"
        :scroll="{ x: 2000 }" row-key="settlement_number" size="small" bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="record.status === '已结算' ? 'green' : record.status === '已审核' ? 'blue' : 'default'">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'payment_status'">
            <a-tag :color="record.payment_status === '已付款' ? 'green' : record.payment_status === '部分付款' ? 'orange' : 'red'">{{ record.payment_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="0" wrap>
              <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" danger @click="handleDelete(record)">删除</a-button>
              <a-button v-if="record.status === '草稿'" type="link" size="small" @click="handleApprove(record)">审核</a-button>
              <a-button v-if="record.status === '已审核' && record.payment_status !== '已付款'" type="link" size="small" style="color: #1890ff" @click="handlePayment(record)">登记付款</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 查看/编辑弹窗 -->
    <a-modal v-model:open="detailVisible" :title="detailMode === 'edit' ? '编辑委外结算单' : '查看委外结算单'" :footer="detailMode === 'edit' ? undefined : null" @ok="handleEditOk" okText="保存" cancelText="取消" width="900px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="结算单号">
              <a-input v-model:value="detailData.settlement_number" disabled />
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
            <a-form-item label="结算日期">
              <a-date-picker v-model:value="detailData.settlement_date" format="YYYY/MM/DD" valueFormat="YYYY/MM/DD" style="width: 100%" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="结算数量">
              <a-input-number v-model:value="detailData.settlement_quantity" :min="0" :precision="2" style="width: 100%" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="单价">
              <a-input-number v-model:value="detailData.unit_price" :min="0" :precision="4" style="width: 100%" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" @change="calculateAmount" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="税率(%)">
              <a-input-number v-model:value="detailData.tax_rate" :min="0" :max="100" :precision="2" style="width: 100%" :disabled="detailMode !== 'edit' || detailData.status !== '草稿'" @change="calculateAmount" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="总金额">
              <a-input-number v-model:value="detailData.total_amount" :min="0" :precision="2" style="width: 100%" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="税额">
              <a-input-number v-model:value="detailData.tax_amount" :min="0" :precision="2" style="width: 100%" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="含税金额">
              <a-input-number v-model:value="detailData.amount_with_tax" :min="0" :precision="2" style="width: 100%" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="付款状态">
              <a-tag :color="detailData.payment_status === '已付款' ? 'green' : detailData.payment_status === '部分付款' ? 'orange' : 'red'">{{ detailData.payment_status }}</a-tag>
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
    </a-modal>

    <!-- 登记付款弹窗 -->
    <a-modal v-model:open="paymentVisible" title="登记付款" @ok="handlePaymentOk" okText="确认付款" cancelText="取消" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="结算单号">
              <a-input :value="paymentForm.settlement_number" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="含税金额">
              <a-input-number :value="paymentForm.amount_with_tax" :precision="2" style="width: 100%" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="已付金额">
              <a-input-number :value="paymentForm.paid_amount" :precision="2" style="width: 100%" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="本次付款" required>
              <a-input-number v-model:value="paymentForm.current_payment" :min="0.01" :precision="2" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { getOutsourcingSettlements, createOutsourcingSettlement, approveSettlement, recordPayment, exportOutsourcingSettlements } from '@/api/production/outsourcingSettlement'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchText = ref('')
const paymentFilter = ref('')
const page = ref(1)
const limit = ref(20)
const total = ref(0)

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '结算单号', dataIndex: 'settlement_number', key: 'settlement_number', width: 150 },
  { title: '委外订单号', dataIndex: 'outsourcing_order_number', key: 'outsourcing_order_number', width: 150 },
  { title: '结算日期', dataIndex: 'settlement_date', key: 'settlement_date', width: 120 },
  { title: '结算数量', dataIndex: 'settlement_quantity', key: 'settlement_quantity', width: 100 },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 100 },
  { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 100 },
  { title: '税率', dataIndex: 'tax_rate', key: 'tax_rate', width: 80 },
  { title: '税额', dataIndex: 'tax_amount', key: 'tax_amount', width: 100 },
  { title: '含税金额', dataIndex: 'amount_with_tax', key: 'amount_with_tax', width: 120 },
  { title: '付款状态', key: 'payment_status', dataIndex: 'payment_status', width: 100 },
  { title: '已付金额', dataIndex: 'paid_amount', key: 'paid_amount', width: 100 },
  { title: '状态', key: 'status', dataIndex: 'status', width: 100 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '操作', key: 'action', width: 240, fixed: 'right' as const }
]

const detailVisible = ref(false)
const detailMode = ref<'view' | 'edit'>('view')
const detailData = reactive<any>({
  settlement_number: '',
  outsourcing_order_number: '',
  settlement_date: '',
  settlement_quantity: 0,
  unit_price: 0,
  total_amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  amount_with_tax: 0,
  payment_status: '未付款',
  paid_amount: 0,
  status: '草稿',
  remark: ''
})

const paymentVisible = ref(false)
const paymentForm = reactive({
  settlement_number: '',
  amount_with_tax: 0,
  paid_amount: 0,
  current_payment: 0
})

const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getOutsourcingSettlements({
      page: page.value,
      limit: limit.value,
      search: searchText.value,
      payment_status: paymentFilter.value
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

const calculateAmount = () => {
  const qty = parseFloat(detailData.settlement_quantity) || 0
  const price = parseFloat(detailData.unit_price) || 0
  const taxRate = parseFloat(detailData.tax_rate) || 0
  
  detailData.total_amount = qty * price
  detailData.tax_amount = detailData.total_amount * (taxRate / 100)
  detailData.amount_with_tax = detailData.total_amount + detailData.tax_amount
}

const handleCreate = () => {
  detailMode.value = 'edit'
  Object.assign(detailData, {
    settlement_number: '',
    outsourcing_order_number: '',
    settlement_date: '',
    settlement_quantity: 0,
    unit_price: 0,
    total_amount: 0,
    tax_rate: 13,
    tax_amount: 0,
    amount_with_tax: 0,
    payment_status: '未付款',
    paid_amount: 0,
    status: '草稿',
    remark: ''
  })
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
    await createOutsourcingSettlement(detailData)
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
    content: `确定要删除结算单 "${record.settlement_number}" 吗？`,
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
  try {
    await approveSettlement(record.settlement_number)
    message.success('审核成功')
    fetchList()
  } catch (err) {
    message.error('审核失败')
  }
}

const handlePayment = (record: any) => {
  Object.assign(paymentForm, {
    settlement_number: record.settlement_number,
    amount_with_tax: parseFloat(record.amount_with_tax) || 0,
    paid_amount: parseFloat(record.paid_amount) || 0,
    current_payment: 0
  })
  paymentVisible.value = true
}

const handlePaymentOk = async () => {
  if (paymentForm.current_payment <= 0) {
    message.warning('请输入付款金额')
    return
  }
  
  try {
    await recordPayment(paymentForm.settlement_number, {
      paid_amount: paymentForm.current_payment
    })
    message.success('付款成功')
    paymentVisible.value = false
    fetchList()
  } catch (err) {
    message.error('付款失败')
  }
}

const handleExport = async () => {
  try {
    const res: any = await exportOutsourcingSettlements(searchText.value)
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `委外结算单_${new Date().getTime()}.xlsx`
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
