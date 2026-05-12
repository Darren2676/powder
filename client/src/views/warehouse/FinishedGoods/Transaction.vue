<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getTransactionList } from '@/api/warehouse/finishedGoods'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const typeFilter = ref('')
const sourceFilter = ref('')
const statusFilter = ref('')

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultDataColumns: any[] = [
  { title: '流水编号', dataIndex: 'transaction_number', key: 'transaction_number', width: 170, resizable: true },
  { title: '类型', dataIndex: 'transaction_type', key: 'transaction_type', width: 80, resizable: true },
  { title: '来源类型', dataIndex: 'source_type', key: 'source_type', width: 100, resizable: true },
  { title: '来源单号', dataIndex: 'source_number', key: 'source_number', width: 170, resizable: true },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70, resizable: true },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130, resizable: true },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 150, resizable: true },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100, resizable: true },
  { title: '变动前', dataIndex: 'before_quantity', key: 'before_quantity', width: 90, resizable: true },
  { title: '变动后', dataIndex: 'after_quantity', key: 'after_quantity', width: 90, resizable: true },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100, resizable: true },
  { title: '操作时间', dataIndex: 'operation_date', key: 'operation_date', width: 160, resizable: true },
  { title: '会计期间', dataIndex: 'accounting_period', key: 'accounting_period', width: 100, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 80, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('fg_transaction_list', defaultDataColumns, {
  fixedLeft: [],
  fixedRight: []
})

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getTransactionList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      transaction_type: typeFilter.value,
      source_type: sourceFilter.value,
      status: statusFilter.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取流水记录失败')
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

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
      <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">库存流水记录</span>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索流水号/来源单号/物料编号/名称"
          style="width: 320px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select
          v-model:value="typeFilter"
          placeholder="出入库类型"
          style="width: 140px"
          allow-clear
          @change="handleSearch"
        >
          <a-select-option value="入库">入库</a-select-option>
          <a-select-option value="出库">出库</a-select-option>
        </a-select>
        <a-select
          v-model:value="sourceFilter"
          placeholder="来源类型"
          style="width: 140px"
          allow-clear
          @change="handleSearch"
        >
          <a-select-option value="生产入库">生产入库</a-select-option>
          <a-select-option value="发货出库">发货出库</a-select-option>
          <a-select-option value="退货入库">退货入库</a-select-option>
          <a-select-option value="手动调整">手动调整</a-select-option>
          <a-select-option value="盘盈调整">盘盈调整</a-select-option>
          <a-select-option value="调拨出库">调拨出库</a-select-option>
          <a-select-option value="调拨入库">调拨入库</a-select-option>
          <a-select-option value="报废出库">报废出库</a-select-option>
        </a-select>
        <a-select
          v-model:value="statusFilter"
          placeholder="状态"
          style="width: 120px"
          allow-clear
          @change="handleSearch"
        >
          <a-select-option value="正常">正常</a-select-option>
          <a-select-option value="作废">作废</a-select-option>
        </a-select>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-tooltip title="列设置">
          <a-button @click="openColumnSetting"><SettingOutlined /></a-button>
        </a-tooltip>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 'max-content' }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'transaction_type'">
          <a-tag :color="record.transaction_type === '入库' ? 'green' : 'red'">
            {{ record.transaction_type }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'source_type'">
          <a-tag :color="record.source_type === '生产入库' ? 'blue' : record.source_type === '发货出库' ? 'orange' : 'default'">
            {{ record.source_type }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'quantity'">
          <span :style="{ color: record.transaction_type === '入库' ? '#52c41a' : '#ff4d4f', fontWeight: 600 }">
            {{ record.transaction_type === '入库' ? '+' : '-' }}{{ record.quantity }}
          </span>
        </template>
        <template v-else-if="column.key === 'batch_number'">
          <template v-if="record.batches && record.batches.length > 1">
            <a-popover title="批次明细" trigger="click" placement="right">
              <template #content>
                <div style="max-height: 200px; overflow-y: auto">
                  <table style="border-collapse: collapse; font-size: 12px; width: 100%">
                    <thead>
                      <tr style="background: #fafafa">
                        <th style="padding: 4px 8px; text-align: left; border-bottom: 1px solid #f0f0f0">批次号</th>
                        <th style="padding: 4px 8px; text-align: right; border-bottom: 1px solid #f0f0f0">数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(b, idx) in record.batches" :key="idx">
                        <td style="padding: 3px 8px; border-bottom: 1px solid #f5f5f5">{{ b.batch_number }}</td>
                        <td style="padding: 3px 8px; text-align: right; border-bottom: 1px solid #f5f5f5">{{ b.quantity }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
              <a-button type="link" size="small" style="padding: 0">{{ record.batches.length }} 个批次</a-button>
            </a-popover>
          </template>
          <template v-else>
            {{ record.batch_number || '-' }}
          </template>
        </template>
        <template v-else-if="column.key === 'operation_date'">
          {{ formatDate(record.operation_date) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="record.status === '作废' ? 'red' : 'green'">
            {{ record.status || '正常' }}
          </a-tag>
        </template>
      </template>
    </a-table>

    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>
