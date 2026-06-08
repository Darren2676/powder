<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="采购退货出库" style="padding: 0; margin: 0 0 8px 0;" />

    <a-card :bordered="false" size="small">
      <a-row :gutter="12" style="margin-bottom: 12px;">
        <a-col :span="6">
          <a-input v-model:value="searchText" placeholder="搜索退货单号/采购订单号/供应商" size="small" allow-clear @pressEnter="fetchList" />
        </a-col>
        <a-col :span="4">
          <a-select v-model:value="filterStatus" placeholder="退货状态" size="small" style="width: 100%;" allow-clear @change="fetchList">
            <a-select-option value="待退货">待退货</a-select-option>
            <a-select-option value="已退货">已退货</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="4">
          <a-select v-model:value="factoryFilter" placeholder="选择工厂" size="small" style="width: 100%;" allow-clear @change="fetchList">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-col>
        <a-col>
          <a-space>
            <a-button size="small" type="primary" @click="fetchList">查询</a-button>
            <a-button size="small" @click="resetFilter">重置</a-button>
          </a-space>
        </a-col>
      </a-row>

      <a-table
        :columns="columns"
        :data-source="listData"
        :loading="loading"
        :pagination="pagination"
        row-key="return_number"
        size="small"
        :scroll="{ x: 1200 }"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'return_type'">
            <a-tag :color="record.return_type === '退货换货' ? 'blue' : 'orange'">{{ record.return_type }}</a-tag>
          </template>
          <template v-else-if="column.key === 'return_status'">
            <a-tag :color="record.return_status === '已退货' ? 'green' : 'orange'">{{ record.return_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'exchange_status'">
            <template v-if="record.return_type === '退货换货'">
              <a-tag :color="record.exchange_status === '已换货' ? 'green' : record.exchange_status === '部分换货' ? 'blue' : 'default'">{{ record.exchange_status }}</a-tag>
            </template>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'total_return_amount'">
            {{ record.total_return_amount ? Number(record.total_return_amount).toFixed(2) : '0.00' }}
          </template>
          <template v-else-if="column.key === 'po_order_status'">
            <a-tag v-if="record.po_order_status" :color="record.po_order_status === '已完成' ? 'green' : record.po_order_status === '执行中' ? 'blue' : 'default'">{{ record.po_order_status }}</a-tag>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="openDetail(record)">详情</a-button>
              <a-button
                v-if="record.return_status !== '已退货'"
                type="link"
                size="small"
                danger
                @click="handleExecute(record)"
              >执行出库</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      :title="`退货出库详情 - ${detailHeader.return_number || ''}`"
      width="900px"
      :footer="null"
    >
      <a-descriptions :column="3" size="small" bordered style="margin-bottom: 16px;">
        <a-descriptions-item label="退货单号">{{ detailHeader.return_number }}</a-descriptions-item>
        <a-descriptions-item label="采购订单号">{{ detailHeader.purchase_order_number }}</a-descriptions-item>
        <a-descriptions-item label="供应商">{{ detailHeader.supplier_name }}</a-descriptions-item>
        <a-descriptions-item label="退货类型">{{ detailHeader.return_type }}</a-descriptions-item>
        <a-descriptions-item label="退货状态">
          <a-tag :color="detailHeader.return_status === '已退货' ? 'green' : 'orange'">{{ detailHeader.return_status }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="换货状态">
          <template v-if="detailHeader.return_type === '退货换货'">
            <a-tag :color="detailHeader.exchange_status === '已换货' ? 'green' : 'default'">{{ detailHeader.exchange_status }}</a-tag>
          </template>
          <span v-else>-</span>
        </a-descriptions-item>
        <a-descriptions-item label="退货仓库">{{ detailHeader.warehouse_name }}</a-descriptions-item>
        <a-descriptions-item label="退货原因">{{ detailHeader.return_reason || '-' }}</a-descriptions-item>
        <a-descriptions-item label="创建人">{{ detailHeader.creation_man }}</a-descriptions-item>
      </a-descriptions>

      <h4 style="margin: 0 0 8px;">退货明细</h4>
      <a-table
        :columns="detailColumns"
        :data-source="detailData"
        :pagination="false"
        row-key="id"
        size="small"
        :scroll="{ x: 1000 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'current_stock'">
            <span :style="{ color: record.current_stock < record.return_quantity ? 'red' : '' }">{{ record.current_stock }}</span>
          </template>
          <template v-else-if="column.key === 'exchange_status'">
            <template v-if="detailHeader.return_type === '退货换货'">
              <a-tag :color="record.exchange_status === '已换货' ? 'green' : 'default'">{{ record.exchange_status }}</a-tag>
            </template>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'batches'">
            <a-popover v-if="record.batches && record.batches.length" trigger="hover">
              <template #content>
                <a-table :columns="batchColumns" :data-source="record.batches" :pagination="false" row-key="batch_number" size="small" />
              </template>
              <a-button type="link" size="small">{{ record.batches.length }}个批次</a-button>
            </a-popover>
            <span v-else style="color: #999;">无库存</span>
          </template>
        </template>
      </a-table>

      <!-- 关联入库单 -->
      <div v-if="detailStockIns.length > 0" style="margin-top: 16px;">
        <h4 style="margin: 0 0 8px;">关联采购入库单</h4>
        <a-table
          :columns="stockInColumns"
          :data-source="detailStockIns"
          :pagination="false"
          row-key="stock_in_number"
          size="small"
        />
      </div>

      <div style="margin-top: 16px; text-align: right;">
        <a-button v-if="detailHeader.return_status !== '已退货'" type="primary" danger @click="handleExecuteFromDetail">执行退货出库</a-button>
        <a-button style="margin-left: 8px;" @click="detailVisible = false">关闭</a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { createVNode } from 'vue'
import { getReturnOutboundList, getReturnOutboundDetail, executeReturnOutbound } from '@/api/warehouse/materialWarehouse'
import { getFactories } from '@/api/system/factory'

const loading = ref(false)
const searchText = ref('')
const filterStatus = ref('')
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}
const listData = ref<any[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
})

const columns = [
  { title: '退货单号', dataIndex: 'return_number', key: 'return_number', width: 150, fixed: 'left' as const },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80,
    customRender: ({ record }: any) => record.factory_short || record.factory_name_val || record.factory_name || '-' },
  { title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 150 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 140 },
  { title: '退货类型', dataIndex: 'return_type', key: 'return_type', width: 100 },
  { title: '退货状态', dataIndex: 'return_status', key: 'return_status', width: 90 },
  { title: '换货状态', dataIndex: 'exchange_status', key: 'exchange_status', width: 90 },
  { title: '退货仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '退货数量', dataIndex: 'total_return_quantity', key: 'total_return_quantity', width: 90 },
  { title: '退货金额', dataIndex: 'total_return_amount', key: 'total_return_amount', width: 110 },
  { title: 'PO状态', dataIndex: 'po_order_status', key: 'po_order_status', width: 90 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '操作', key: 'action', width: 130, fixed: 'right' as const }
]

const detailVisible = ref(false)
const detailHeader = ref<any>({})
const detailData = ref<any[]>([])
const detailStockIns = ref<any[]>([])

const detailColumns = [
  { title: '物料编号', dataIndex: 'item_number', width: 110 },
  { title: '物料名称', dataIndex: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', width: 100 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '已入库数量', dataIndex: 'received_quantity', width: 90 },
  { title: '退货数量', dataIndex: 'return_quantity', width: 90 },
  { title: '当前库存', key: 'current_stock', width: 90 },
  { title: '批次库存', key: 'batches', width: 90 },
  { title: '换货状态', key: 'exchange_status', width: 90 }
]

const batchColumns = [
  { title: '批次号', dataIndex: 'batch_number', width: 140 },
  { title: '数量', dataIndex: 'quantity', width: 80 },
  { title: '入库日期', dataIndex: 'inbound_date', width: 120 },
  { title: '状态', dataIndex: 'status', width: 80 }
]

const stockInColumns = [
  { title: '入库单号', dataIndex: 'stock_in_number', width: 150 },
  { title: '入库状态', dataIndex: 'si_status', width: 100 },
  { title: '入库日期', dataIndex: 'stock_in_date', width: 150 }
]

const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getReturnOutboundList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined,
      return_status: filterStatus.value || undefined,
      factory_id: factoryFilter.value || undefined
    })
    listData.value = res?.data?.items || []
    pagination.total = res?.data?.pagination?.total || 0
  } catch (err: any) {
    message.error(err?.response?.data?.message || '获取列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilter = () => {
  searchText.value = ''
  filterStatus.value = ''
  factoryFilter.value = undefined
  pagination.current = 1
  fetchList()
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchList()
}

const openDetail = async (record: any) => {
  try {
    const res: any = await getReturnOutboundDetail(record.return_number)
    detailHeader.value = res?.data?.header || {}
    detailData.value = res?.data?.details || []
    detailStockIns.value = res?.data?.stockIns || []
    detailVisible.value = true
  } catch (err: any) {
    message.error(err?.response?.data?.message || '获取详情失败')
  }
}

const handleExecute = (record: any) => {
  Modal.confirm({
    title: '确认执行退货出库',
    icon: createVNode(ExclamationCircleOutlined),
    content: `执行退货将扣减库存并回写采购订单，确定要执行退货单「${record.return_number}」吗？`,
    okText: '确定执行',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await executeReturnOutbound(record.return_number)
        message.success('退货出库执行成功')
        fetchList()
      } catch (e: any) {
        message.error(e?.response?.data?.message || '退货出库失败')
      }
    }
  })
}

const handleExecuteFromDetail = () => {
  if (!detailHeader.value.return_number) return
  Modal.confirm({
    title: '确认执行退货出库',
    icon: createVNode(ExclamationCircleOutlined),
    content: `执行退货将扣减库存并回写采购订单，确定要执行退货单「${detailHeader.value.return_number}」吗？`,
    okText: '确定执行',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await executeReturnOutbound(detailHeader.value.return_number)
        message.success('退货出库执行成功')
        detailVisible.value = false
        fetchList()
      } catch (e: any) {
        message.error(e?.response?.data?.message || '退货出库失败')
      }
    }
  })
}

onMounted(() => {
  loadFactories()
  fetchList()
})
</script>
