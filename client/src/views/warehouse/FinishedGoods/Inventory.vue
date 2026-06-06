<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, BarChartOutlined, EditOutlined, ProfileOutlined, DownOutlined, SafetyCertificateOutlined } from '@ant-design/icons-vue'
import { getInventoryList, getInventoryDetail, adjustInventory, getWarehouseOptions, getFinishedBatchOptions, updateFinishedGoodsSafetyStock } from '@/api/warehouse/finishedGoods'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const warehouseFilter = ref('')
const qualityStatusFilter = ref('')
const warehouseOptions = ref<any[]>([])
const summary = ref<any>({})

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
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 140 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 180 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 140 },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 130 },
  { title: '基本单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 80 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 140 },
  { title: '质量状态', dataIndex: 'quality_status', key: 'quality_status', width: 100 },
  { title: '库存数量', dataIndex: 'quantity', key: 'quantity', width: 120 },
  { title: '最后更新', dataIndex: 'last_updated', key: 'last_updated', width: 160 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getInventoryList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      warehouse_number: warehouseFilter.value,
      quality_status: qualityStatusFilter.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
      summary.value = res.data.summary || {}
    }
  } catch {
    message.error('获取库存列表失败')
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

// 查看流水详情
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailInventory = ref<any[]>([])
const detailTransactions = ref<any[]>([])
const detailTitle = ref('')

const handleViewDetail = async (record: any) => {
  detailTitle.value = `${record.item_name} (${record.item_number}) - ${record.warehouse_name}`
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res: any = await getInventoryDetail({
      item_number: record.item_number,
      warehouse_number: record.warehouse_number
    })
    if (res?.success) {
      detailInventory.value = res.data.inventory || []
      detailTransactions.value = res.data.transactions || []
    }
  } catch {
    message.error('获取库存详情失败')
  } finally {
    detailLoading.value = false
  }
}

const detailColumns = [
  { title: '流水编号', dataIndex: 'transaction_number', width: 160 },
  { title: '类型', dataIndex: 'transaction_type', key: 'transaction_type', width: 80 },
  { title: '来源', dataIndex: 'source_type', width: 100 },
  { title: '来源单号', dataIndex: 'source_number', width: 160 },
  { title: '批次号', dataIndex: 'batch_number', width: 150 },
  { title: '数量', dataIndex: 'quantity', width: 90 },
  { title: '变动前', dataIndex: 'before_quantity', width: 90 },
  { title: '变动后', dataIndex: 'after_quantity', width: 90 },
  { title: '操作人', dataIndex: 'operator', width: 100 },
  { title: '操作时间', dataIndex: 'operation_date', key: 'operation_date', width: 160 }
]

// 批次库存详情
const batchVisible = ref(false)
const batchLoading = ref(false)
const batchData = ref<any[]>([])
const batchTitle = ref('')
const batchSummaryQty = ref(0)

const batchColumns = [
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 170 },
  { title: '库存数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
  { title: '初始数量', dataIndex: 'initial_quantity', key: 'initial_quantity', width: 100 },
  { title: '生产工单', dataIndex: 'production_order_number', key: 'production_order_number', width: 160 },
  { title: '入库日期', dataIndex: 'inbound_date', key: 'inbound_date', width: 160 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 140 }
]

const handleViewBatch = async (record: any) => {
  batchTitle.value = `${record.item_name} (${record.item_number}) - ${record.warehouse_name} - 批次明细`
  batchVisible.value = true
  batchLoading.value = true
  batchData.value = []
  batchSummaryQty.value = 0
  try {
    const res: any = await getFinishedBatchOptions({
      item_number: record.item_number,
      warehouse_number: record.warehouse_number
    })
    if (res?.success) {
      batchData.value = res.data || []
      batchSummaryQty.value = batchData.value.reduce((s: number, b: any) => s + (Number(b.quantity) || 0), 0)
    }
  } catch {
    message.error('获取批次明细失败')
  } finally {
    batchLoading.value = false
  }
}

// 手动调整库存
const adjustVisible = ref(false)
const adjustLoading = ref(false)
const adjustForm = reactive({
  item_number: '',
  item_name: '',
  specifications: '',
  basic_unit: '',
  product_drawing_number: '',
  warehouse_number: '',
  warehouse_name: '',
  current_quantity: 0,
  adjust_quantity: 0,
  remark: ''
})

const handleAdjust = (record: any) => {
  adjustForm.item_number = record.item_number
  adjustForm.item_name = record.item_name
  adjustForm.specifications = record.specifications
  adjustForm.basic_unit = record.basic_unit
  adjustForm.product_drawing_number = record.product_drawing_number
  adjustForm.warehouse_number = record.warehouse_number
  adjustForm.warehouse_name = record.warehouse_name
  adjustForm.current_quantity = Number(record.quantity) || 0
  adjustForm.adjust_quantity = 0
  adjustForm.remark = ''
  adjustVisible.value = true
}

const handleAdjustSubmit = async () => {
  if (adjustForm.adjust_quantity === 0) {
    message.warning('调整数量不能为0'); return
  }
  adjustLoading.value = true
  try {
    const res: any = await adjustInventory({
      item_number: adjustForm.item_number,
      item_name: adjustForm.item_name,
      specifications: adjustForm.specifications,
      basic_unit: adjustForm.basic_unit,
      product_drawing_number: adjustForm.product_drawing_number,
      warehouse_number: adjustForm.warehouse_number,
      warehouse_name: adjustForm.warehouse_name,
      adjust_quantity: adjustForm.adjust_quantity,
      remark: adjustForm.remark
    })
    if (res?.success) {
      message.success('库存调整成功')
      adjustVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '库存调整失败')
  } finally {
    adjustLoading.value = false
  }
}

// 安全库存编辑
const safetyStockVisible = ref(false)
const safetyStockLoading = ref(false)
const safetyStockForm = reactive({ item_number: '', item_name: '', warehouse_number: '', warehouse_name: '', safety_stock_quantity: 0 })

const handleEditSafetyStock = (record: any) => {
  safetyStockForm.item_number = record.item_number
  safetyStockForm.item_name = record.item_name
  safetyStockForm.warehouse_number = record.warehouse_number
  safetyStockForm.warehouse_name = record.warehouse_name
  safetyStockForm.safety_stock_quantity = Number(record.safety_stock_quantity) || 0
  safetyStockVisible.value = true
}

const handleSafetyStockSubmit = async () => {
  safetyStockLoading.value = true
  try {
    const res: any = await updateFinishedGoodsSafetyStock({
      item_number: safetyStockForm.item_number,
      warehouse_number: safetyStockForm.warehouse_number,
      safety_stock_quantity: safetyStockForm.safety_stock_quantity
    })
    if (res?.success) {
      message.success('更新安全库存成功')
      safetyStockVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '更新失败')
  } finally { safetyStockLoading.value = false }
}

onMounted(() => {
  fetchWarehouseOptions()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <!-- 统计卡片 -->
    <div style="display: flex; gap: 16px; margin-bottom: 20px">
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="物料种类" :value="summary.total_items || 0" :value-style="{ color: '#1890ff' }" />
      </a-card>
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="涉及仓库" :value="summary.total_warehouses || 0" :value-style="{ color: '#52c41a' }" />
      </a-card>
      <a-card size="small" style="flex: 1; text-align: center">
        <a-statistic title="总库存量" :value="summary.total_quantity || 0" :precision="2" :value-style="{ color: '#fa8c16' }" />
      </a-card>
    </div>

    <!-- 搜索栏 -->
    <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索物料编号/名称/规格/图号"
        style="width: 300px"
        @search="handleSearch"
        @pressEnter="handleSearch"
        allow-clear
      >
        <template #prefix><SearchOutlined /></template>
      </a-input-search>
      <a-select
        v-model:value="warehouseFilter"
        placeholder="按仓库筛选"
        style="width: 200px"
        allow-clear
        @change="handleSearch"
      >
        <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">
          {{ w.warehouse_name }}
        </a-select-option>
      </a-select>
      <a-select
        v-model:value="qualityStatusFilter"
        placeholder="质量状态"
        style="width: 130px"
        allow-clear
        @change="handleSearch"
      >
        <a-select-option value="合格品">合格品</a-select-option>
        <a-select-option value="不合格品">不合格品</a-select-option>
      </a-select>
      <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
    </div>

    <!-- 库存表格 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 1300 }"
      size="small"
      bordered
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'quality_status'">
          <a-tag :color="record.quality_status === '合格品' ? 'green' : 'red'">
            {{ record.quality_status || '合格品' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <span :style="{ color: Number(record.quantity) <= 0 ? '#ff4d4f' : Number(record.quantity) < 10 ? '#fa8c16' : '#52c41a', fontWeight: 600 }">
            {{ record.quantity }}
          </span>
        </template>
        <template v-else-if="column.key === 'last_updated'">
          {{ formatDate(record.last_updated) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleViewBatch(record)">
              <template #icon><ProfileOutlined /></template>详情
            </a-button>
            <a-dropdown :trigger="['click']">
              <a @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a>
              <template #overlay>
                <a-menu>
                  <a-menu-item @click="handleViewDetail(record)">
                    <BarChartOutlined /> 库存流水
                  </a-menu-item>
                  <a-menu-item @click="handleAdjust(record)">
                    <EditOutlined /> 库存调整
                  </a-menu-item>
                  <a-menu-item @click="handleEditSafetyStock(record)">
                    <SafetyCertificateOutlined /> 安全库存
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 流水详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      :title="detailTitle"
      width="1100px"
      :bodyStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
      :footer="null"
    >
      <a-spin :spinning="detailLoading">
        <div v-if="detailInventory.length > 0" style="margin-bottom: 16px">
          <a-descriptions bordered size="small" :column="4">
            <a-descriptions-item label="当前库存">
              <span style="color: #1890ff; font-weight: 600; font-size: 16px">{{ detailInventory[0]?.quantity || 0 }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="仓库">{{ detailInventory[0]?.warehouse_name }}</a-descriptions-item>
            <a-descriptions-item label="单位">{{ detailInventory[0]?.basic_unit }}</a-descriptions-item>
            <a-descriptions-item label="最后更新">{{ formatDate(detailInventory[0]?.last_updated) }}</a-descriptions-item>
          </a-descriptions>
        </div>

        <h4 style="margin-bottom: 8px">库存流水记录</h4>
        <a-table
          :columns="detailColumns"
          :data-source="detailTransactions"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 1150, y: 400 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'transaction_type'">
              <a-tag :color="record.transaction_type === '入库' ? 'green' : 'red'">
                {{ record.transaction_type }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'operation_date'">
              {{ formatDate(record.operation_date) }}
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <!-- 批次明细弹窗 -->
    <a-modal
      v-model:open="batchVisible"
      :title="batchTitle"
      width="1000px"
      :bodyStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
      :footer="null"
    >
      <a-spin :spinning="batchLoading">
        <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center">
          <span>共 <b>{{ batchData.length }}</b> 个批次</span>
          <span>批次库存合计: <b style="color: #1890ff; font-size: 16px">{{ batchSummaryQty }}</b></span>
        </div>
        <a-table
          :columns="batchColumns"
          :data-source="batchData"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ y: 400 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'quantity'">
              <span style="font-weight: 600; color: #52c41a">{{ record.quantity }}</span>
            </template>
            <template v-else-if="column.key === 'inbound_date'">
              {{ formatDate(record.inbound_date) }}
            </template>
            <template v-else-if="column.key === 'production_order_number'">
              {{ record.production_order_number || '-' }}
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <!-- 手动调整弹窗 -->
    <a-modal
      v-model:open="adjustVisible"
      title="手动调整库存"
      @ok="handleAdjustSubmit"
      :confirmLoading="adjustLoading"
      okText="确认调整"
    >
      <a-descriptions bordered size="small" :column="2" style="margin-bottom: 16px">
        <a-descriptions-item label="物料编号">{{ adjustForm.item_number }}</a-descriptions-item>
        <a-descriptions-item label="物料名称">{{ adjustForm.item_name }}</a-descriptions-item>
        <a-descriptions-item label="仓库">{{ adjustForm.warehouse_name }}</a-descriptions-item>
        <a-descriptions-item label="当前库存">
          <span style="font-weight: 600; color: #1890ff">{{ adjustForm.current_quantity }}</span>
        </a-descriptions-item>
      </a-descriptions>

      <a-form layout="vertical">
        <a-form-item label="调整数量（正数为增加，负数为减少）" required>
          <a-input-number
            v-model:value="adjustForm.adjust_quantity"
            style="width: 100%"
            placeholder="请输入调整数量"
          />
        </a-form-item>
        <a-form-item label="调整后库存">
          <span :style="{ fontWeight: 600, fontSize: '16px', color: (adjustForm.current_quantity + adjustForm.adjust_quantity) < 0 ? '#ff4d4f' : '#52c41a' }">
            {{ adjustForm.current_quantity + adjustForm.adjust_quantity }}
          </span>
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="adjustForm.remark" placeholder="调整原因说明" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 安全库存编辑弹窗 -->
    <a-modal v-model:open="safetyStockVisible" title="设置安全库存" @ok="handleSafetyStockSubmit" :confirmLoading="safetyStockLoading" okText="保存">
      <a-descriptions bordered size="small" :column="2" style="margin-bottom: 16px">
        <a-descriptions-item label="物料编号">{{ safetyStockForm.item_number }}</a-descriptions-item>
        <a-descriptions-item label="物料名称">{{ safetyStockForm.item_name }}</a-descriptions-item>
        <a-descriptions-item label="仓库">{{ safetyStockForm.warehouse_name }}</a-descriptions-item>
      </a-descriptions>
      <a-form layout="vertical">
        <a-form-item label="安全库存数量">
          <a-input-number v-model:value="safetyStockForm.safety_stock_quantity" :min="0" style="width: 100%" placeholder="请输入安全库存数量" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>
