<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, ImportOutlined } from '@ant-design/icons-vue'
import { getPendingReturnInbound, getReturnInboundDetail, returnInbound, getWarehouseOptions } from '@/api/warehouse/finishedGoods'
import { useOpenAccountingPeriods } from '@/composables/useOpenAccountingPeriods'
import dayjs from 'dayjs'

const loading = ref(false)
const submitLoading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const warehouseOptions = ref<any[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const columns = [
  { title: '退货单号', dataIndex: 'return_order_number', key: 'return_order_number', width: 160 },
  { title: '发货单号', dataIndex: 'shipping_order_number', key: 'shipping_order_number', width: 160 },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 180 },
  { title: '退货原因', dataIndex: 'reason', key: 'reason', width: 150 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '确认人', dataIndex: 'confirmed_by', key: 'confirmed_by', width: 100 },
  { title: '确认日期', dataIndex: 'confirmed_date', key: 'confirmed_date', width: 120 },
  { title: '入库状态', dataIndex: 'inbound_status', key: 'inbound_status', width: 100 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' as const }
]

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getPendingReturnInbound({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取待退货入库列表失败')
  } finally {
    loading.value = false
  }
}

const fetchWarehouseOptions = async () => {
  try {
    const res: any = await getWarehouseOptions()
    if (res?.success) {
      warehouseOptions.value = res.data || []
    }
  } catch { /* ignore */ }
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

// 入库弹窗
const inboundVisible = ref(false)
const inboundHeader = ref<any>({})
const inboundDetails = ref<any[]>([])
const inboundWarehouse = reactive({ warehouse_number: '', warehouse_name: '' })
const inboundRemark = ref('')
const inboundAccountingPeriod = ref('')

const { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod } = useOpenAccountingPeriods()

const handleInbound = async (record: any) => {
  try {
    const res: any = await getReturnInboundDetail(record.return_order_number)
    if (res?.success) {
      inboundHeader.value = res.data.header
      // 将批次展开为独立行，每个批次可以单独设置质量状态
      const rows: any[] = []
      for (const d of (res.data.details || [])) {
        const batches = d.batches || []
        if (batches.length > 0) {
          for (const b of batches) {
            const qty = Number(b.quantity) || 0
            rows.push({
              _uid: `${d.id}_${b.id}`,
              detail_id: d.id,
              batch_id: b.id,
              batch_number: b.batch_number || '',
              item_number: d.item_number,
              item_name: d.item_name,
              specifications: d.specifications,
              basic_unit: d.basic_unit,
              product_drawing_number: d.product_drawing_number,
              return_quantity: qty,
              qualified_qty: 0,
              unqualified_qty: qty
            })
          }
        } else {
          // 没有批次信息，直接用明细行
          const qty = Number(d.return_quantity) || 0
          rows.push({
            _uid: `${d.id}_0`,
            detail_id: d.id,
            batch_id: null,
            batch_number: '',
            item_number: d.item_number,
            item_name: d.item_name,
            specifications: d.specifications,
            basic_unit: d.basic_unit,
            product_drawing_number: d.product_drawing_number,
            return_quantity: qty,
            qualified_qty: 0,
            unqualified_qty: qty
          })
        }
      }
      inboundDetails.value = rows
      // 默认使用退货单上的仓库
      inboundWarehouse.warehouse_number = res.data.header.warehouse_number || ''
      inboundWarehouse.warehouse_name = res.data.header.warehouse_name || ''
      inboundRemark.value = ''
      inboundAccountingPeriod.value = getDefaultPeriod()
      if (noOpenPeriod.value) {
        message.warning('当前没有已开启的会计期间，请联系财务开启后再操作')
      }
      inboundVisible.value = true
    }
  } catch {
    message.error('获取退货单详情失败')
  }
}

const handleWarehouseChange = (value: string) => {
  const w = warehouseOptions.value.find((o: any) => o.warehouse_number === value)
  if (w) {
    inboundWarehouse.warehouse_number = w.warehouse_number
    inboundWarehouse.warehouse_name = w.warehouse_name
  }
}

const inboundColumns = [
  { title: '产品编号', dataIndex: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', width: 100 },
  { title: '批次号', dataIndex: 'batch_number', width: 130 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '退货数量', dataIndex: 'return_quantity', width: 90 },
  { title: '合格品数量', key: 'qualified_qty', width: 110 },
  { title: '不合格品数量', key: 'unqualified_qty', width: 110 }
]

const handleInboundSubmit = async () => {
  if (!inboundWarehouse.warehouse_number) {
    message.warning('请选择入库仓库'); return
  }
  const invalidRow = inboundDetails.value.find((d: any) => {
    const q = Number(d.qualified_qty) || 0
    const u = Number(d.unqualified_qty) || 0
    return q < 0 || u < 0 || Math.abs(q + u - Number(d.return_quantity)) > 0.001
  })
  if (invalidRow) {
    message.warning(`产品 ${invalidRow.item_number}${invalidRow.batch_number ? ' 批次' + invalidRow.batch_number : ''} 的合格品数量 + 不合格品数量必须等于退货数量`); return
  }

  submitLoading.value = true
  try {
    const res: any = await returnInbound(inboundHeader.value.return_order_number, {
      warehouse_number: inboundWarehouse.warehouse_number,
      warehouse_name: inboundWarehouse.warehouse_name,
      remark: inboundRemark.value,
      accounting_period: inboundAccountingPeriod.value,
      details: inboundDetails.value.map((d: any) => ({
        detail_id: d.detail_id,
        batch_id: d.batch_id || null,
        batch_number: d.batch_number || '',
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications,
        basic_unit: d.basic_unit,
        product_drawing_number: d.product_drawing_number,
        return_quantity: d.return_quantity,
        qualified_qty: Number(d.qualified_qty) || 0,
        unqualified_qty: Number(d.unqualified_qty) || 0
      }))
    })
    if (res?.success) {
      const batchNos = res.data?.batchNumbers
      if (batchNos && batchNos.length > 0) {
        message.success(`退货入库成功，生成批次号: ${batchNos.join(', ')}`)
      } else {
        message.success('退货入库成功')
      }
      inboundVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '退货入库操作失败')
  } finally {
    submitLoading.value = false
  }
}

// 批量设置：全部合格 / 全部不合格
const applyAllQualified = () => {
  inboundDetails.value.forEach((d: any) => {
    d.qualified_qty = Number(d.return_quantity) || 0
    d.unqualified_qty = 0
  })
}
const applyAllUnqualified = () => {
  inboundDetails.value.forEach((d: any) => {
    d.qualified_qty = 0
    d.unqualified_qty = Number(d.return_quantity) || 0
  })
}

// 联动：修改合格品数量时自动计算不合格品数量
const onQualifiedQtyChange = (record: any, val: number | null) => {
  const q = Number(val) || 0
  record.qualified_qty = q
  record.unqualified_qty = Math.max(0, (Number(record.return_quantity) || 0) - q)
}
const onUnqualifiedQtyChange = (record: any, val: number | null) => {
  const u = Number(val) || 0
  record.unqualified_qty = u
  record.qualified_qty = Math.max(0, (Number(record.return_quantity) || 0) - u)
}

onMounted(() => {
  fetchOpenPeriods()
  fetchWarehouseOptions()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索退货单号/客户名称/发货单号"
          style="width: 300px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
      </div>
    </div>

    <a-alert
      message="退货入库说明：此列表显示已确认的退货单，点击「入库」为退货商品填写合格品和不合格品数量后入库到成品仓库。"
      type="info"
      show-icon
      style="margin-bottom: 12px"
    />

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="return_order_number"
      :scroll="{ x: 1200 }"
      size="small"
      bordered
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'confirmed_date'">
          {{ formatDate(record.confirmed_date) }}
        </template>
        <template v-else-if="column.key === 'inbound_status'">
          <a-tag :color="record.inbound_status === '已入库' ? 'green' : 'orange'">
            {{ record.inbound_status || '待入库' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button type="link" size="small" @click="handleInbound(record)">
            <ImportOutlined /> 入库
          </a-button>
        </template>
      </template>
    </a-table>

    <!-- 退货入库弹窗 -->
    <a-modal
      v-model:open="inboundVisible"
      title="退货入库"
      width="1000px"
      :bodyStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
      @ok="handleInboundSubmit"
      :confirmLoading="submitLoading"
      okText="确认入库"
    >
      <a-descriptions :column="3" bordered size="small" style="margin-bottom: 16px">
        <a-descriptions-item label="退货单号">{{ inboundHeader.return_order_number }}</a-descriptions-item>
        <a-descriptions-item label="发货单号">{{ inboundHeader.shipping_order_number }}</a-descriptions-item>
        <a-descriptions-item label="客户名称">{{ inboundHeader.customer_name }}</a-descriptions-item>
        <a-descriptions-item label="退货原因" :span="3">{{ inboundHeader.reason || '-' }}</a-descriptions-item>
      </a-descriptions>

      <a-form layout="inline" style="margin-bottom: 16px">
        <a-form-item label="入库仓库" required>
          <a-select
            v-model:value="inboundWarehouse.warehouse_number"
            placeholder="请选择仓库"
            style="width: 250px"
            @change="handleWarehouseChange"
          >
            <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">
              {{ w.warehouse_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="inboundRemark" placeholder="可选" style="width: 200px" />
        </a-form-item>
        <a-form-item label="会计期间">
          <a-select v-model:value="inboundAccountingPeriod" style="width: 150px"
            :loading="openPeriodLoading" placeholder="请选择会计期间">
            <a-select-option v-for="opt in openPeriodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
            <a-select-option v-if="noOpenPeriod" disabled value="">无已开启期间</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="批量设置">
          <a-button type="link" @click="applyAllQualified">全部合格</a-button>
          <a-button type="link" @click="applyAllUnqualified">全部不合格</a-button>
        </a-form-item>
      </a-form>

      <a-table
        :columns="inboundColumns"
        :data-source="inboundDetails"
        :pagination="false"
        row-key="_uid"
        size="small"
        bordered
        :scroll="{ x: 920 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'qualified_qty'">
            <a-input-number v-model:value="record.qualified_qty" :min="0" :max="Number(record.return_quantity)" size="small" style="width: 100px" @change="(val: number | null) => onQualifiedQtyChange(record, val)" />
          </template>
          <template v-else-if="column.key === 'unqualified_qty'">
            <a-input-number v-model:value="record.unqualified_qty" :min="0" :max="Number(record.return_quantity)" size="small" style="width: 100px" @change="(val: number | null) => onUnqualifiedQtyChange(record, val)" />
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>
