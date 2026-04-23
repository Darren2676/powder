<script setup lang="ts">
import { ref, reactive } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, NodeIndexOutlined, SwapOutlined, FileSearchOutlined } from '@ant-design/icons-vue'
import { searchBatch, forwardTrace, reverseTrace, traceByProductionOrder } from '@/api/integration/batchTrace'
import dayjs from 'dayjs'

const loading = ref(false)
const searchKeyword = ref('')
const searchType = ref('')
const activeTab = ref('search')

// 搜索结果
const materialBatches = ref<any[]>([])
const finishedBatches = ref<any[]>([])

// 追溯结果
const traceResult = ref<any>(null)
const traceDirection = ref<'forward' | 'reverse'>('forward')

// 生产单追溯结果
const ponResult = ref<any>(null)

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const formatDateShort = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

// ========== 批次搜索 ==========
const handleSearch = async () => {
  if (!searchKeyword.value.trim()) {
    message.warning('请输入搜索关键字')
    return
  }
  loading.value = true
  try {
    const res: any = await searchBatch({ keyword: searchKeyword.value.trim(), type: searchType.value })
    materialBatches.value = res.data?.materialBatches || []
    finishedBatches.value = res.data?.finishedBatches || []
    if (materialBatches.value.length === 0 && finishedBatches.value.length === 0) {
      message.info('未找到匹配的批次')
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || '搜索失败')
  } finally {
    loading.value = false
  }
}

// ========== 正向/反向追溯 ==========
const traceBatchNumber = ref('')

const handleTrace = async () => {
  if (!traceBatchNumber.value.trim()) {
    message.warning('请输入批次号')
    return
  }
  loading.value = true
  traceResult.value = null
  try {
    const fn = traceDirection.value === 'forward' ? forwardTrace : reverseTrace
    const res: any = await fn({ batch_number: traceBatchNumber.value.trim() })
    traceResult.value = res.data
    if (traceDirection.value === 'forward') {
      if (!res.data?.finishedBatch) {
        message.info('未找到该成品批次')
      }
    } else {
      if (!res.data?.materialBatch) {
        message.info('未找到该原材料批次')
      }
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || '追溯失败')
  } finally {
    loading.value = false
  }
}

// ========== 生产单追溯 ==========
const ponNumber = ref('')

const handlePonTrace = async () => {
  if (!ponNumber.value.trim()) {
    message.warning('请输入生产单号')
    return
  }
  loading.value = true
  ponResult.value = null
  try {
    const res: any = await traceByProductionOrder({ production_order_number: ponNumber.value.trim() })
    ponResult.value = res.data
    if (!res.data?.productionOrder) {
      message.info('未找到该生产单')
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || '追溯失败')
  } finally {
    loading.value = false
  }
}

// 从搜索结果点击进行追溯
const traceFromSearch = (batchNumber: string, type: 'forward' | 'reverse') => {
  activeTab.value = 'trace'
  traceBatchNumber.value = batchNumber
  traceDirection.value = type
  handleTrace()
}

// 搜索结果列定义
const materialColumns = [
  { title: '批次号', dataIndex: 'batch_number', width: 160 },
  { title: '物料编号', dataIndex: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
  { title: '当前库存', dataIndex: 'quantity', width: 90 },
  { title: '入库日期', dataIndex: 'inbound_date', width: 110 },
  { title: '生产单号', dataIndex: 'production_order_number', width: 140 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' as const }
]

const finishedColumns = [
  { title: '批次号', dataIndex: 'batch_number', width: 160 },
  { title: '物料编号', dataIndex: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
  { title: '当前库存', dataIndex: 'quantity', width: 90 },
  { title: '入库日期', dataIndex: 'inbound_date', width: 110 },
  { title: '生产单号', dataIndex: 'production_order_number', width: 140 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' as const }
]

// 追溯关联列
const traceLinkColumns = [
  { title: '原材料批次号', dataIndex: 'material_batch_number', width: 160 },
  { title: '原材料编号', dataIndex: 'material_item_number', width: 130 },
  { title: '原材料名称', dataIndex: 'material_item_name', width: 160 },
  { title: '领料数量', dataIndex: 'material_quantity', width: 100 },
  { title: '领料单号', dataIndex: 'issue_number', width: 140 },
  { title: '关联类型', dataIndex: 'link_type', width: 80 },
  { title: '当前库存', dataIndex: 'current_stock', width: 100 },
  { title: '操作', key: 'action', width: 100 }
]

const reverseTraceLinkColumns = [
  { title: '成品批次号', dataIndex: 'finished_batch_number', width: 160 },
  { title: '成品编号', dataIndex: 'finished_item_number', width: 130 },
  { title: '成品名称', dataIndex: 'finished_item_name', width: 160 },
  { title: '领料数量', dataIndex: 'material_quantity', width: 100 },
  { title: '领料单号', dataIndex: 'issue_number', width: 140 },
  { title: '关联类型', dataIndex: 'link_type', width: 80 },
  { title: '当前库存', dataIndex: 'current_stock', width: 100 },
  { title: '操作', key: 'action', width: 100 }
]

// 生产单领料列
const issueColumns = [
  { title: '领料单号', dataIndex: 'issue_number', width: 140 },
  { title: '物料编号', dataIndex: 'material_number', width: 130 },
  { title: '物料名称', dataIndex: 'material_name', width: 160 },
  { title: '实领数量', dataIndex: 'actual_quantity', width: 100 },
  { title: '批次号', dataIndex: 'batch_number', width: 160 },
  { title: '单位', dataIndex: 'unit', width: 80 }
]
</script>

<template>
  <div class="page-container">
    <a-tabs v-model:activeKey="activeTab">
      <!-- 批次搜索 -->
      <a-tab-pane key="search">
        <template #tab>
          <SearchOutlined />
          批次搜索
        </template>
        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center;">
          <a-select v-model:value="searchType" style="width: 140px" placeholder="搜索类型" allowClear>
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="material">原材料批次</a-select-option>
            <a-select-option value="finished">成品批次</a-select-option>
          </a-select>
          <a-input-search
            v-model:value="searchKeyword"
            placeholder="输入批次号、物料编号、物料名称或生产单号"
            style="width: 460px"
            :loading="loading"
            @search="handleSearch"
          />
        </div>

        <template v-if="materialBatches.length > 0">
          <h4 style="margin: 16px 0 8px;">原材料/半成品批次</h4>
          <a-table
            :dataSource="materialBatches"
            :columns="materialColumns"
            :pagination="false"
            :scroll="{ x: 1200 }"
            size="small"
            rowKey="batch_number"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'inbound_date'">
                {{ formatDateShort(record.inbound_date) }}
              </template>
              <template v-if="column.dataIndex === 'status'">
                <a-tag :color="record.status === '正常' ? 'green' : 'orange'">{{ record.status }}</a-tag>
              </template>
              <template v-if="column.key === 'action'">
                <a-button type="link" size="small" @click="traceFromSearch(record.batch_number, 'reverse')">反向追溯</a-button>
              </template>
            </template>
          </a-table>
        </template>

        <template v-if="finishedBatches.length > 0">
          <h4 style="margin: 16px 0 8px;">成品批次</h4>
          <a-table
            :dataSource="finishedBatches"
            :columns="finishedColumns"
            :pagination="false"
            :scroll="{ x: 1200 }"
            size="small"
            rowKey="batch_number"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'inbound_date'">
                {{ formatDateShort(record.inbound_date) }}
              </template>
              <template v-if="column.dataIndex === 'status'">
                <a-tag :color="record.status === '正常' ? 'green' : 'orange'">{{ record.status }}</a-tag>
              </template>
              <template v-if="column.key === 'action'">
                <a-button type="link" size="small" @click="traceFromSearch(record.batch_number, 'forward')">正向追溯</a-button>
              </template>
            </template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- 批次追溯 -->
      <a-tab-pane key="trace">
        <template #tab>
          <NodeIndexOutlined />
          批次追溯
        </template>
        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center;">
          <a-radio-group v-model:value="traceDirection" button-style="solid">
            <a-radio-button value="forward">正向追溯（成品→原材料）</a-radio-button>
            <a-radio-button value="reverse">反向追溯（原材料→成品）</a-radio-button>
          </a-radio-group>
          <a-input
            v-model:value="traceBatchNumber"
            :placeholder="traceDirection === 'forward' ? '输入成品批次号 (FB-...)' : '输入原材料批次号 (MB-... / HB-...)'"
            style="width: 300px"
            @pressEnter="handleTrace"
          />
          <a-button type="primary" :loading="loading" @click="handleTrace">
            <template #icon><SearchOutlined /></template>
            追溯
          </a-button>
        </div>

        <template v-if="traceResult">
          <!-- 正向追溯结果 -->
          <template v-if="traceDirection === 'forward' && traceResult.finishedBatch">
            <a-descriptions title="成品批次信息" bordered size="small" :column="3" style="margin-bottom: 16px;">
              <a-descriptions-item label="批次号">{{ traceResult.finishedBatch.batch_number }}</a-descriptions-item>
              <a-descriptions-item label="物料编号">{{ traceResult.finishedBatch.item_number }}</a-descriptions-item>
              <a-descriptions-item label="物料名称">{{ traceResult.finishedBatch.item_name }}</a-descriptions-item>
              <a-descriptions-item label="规格">{{ traceResult.finishedBatch.specifications }}</a-descriptions-item>
              <a-descriptions-item label="仓库">{{ traceResult.finishedBatch.warehouse_name }}</a-descriptions-item>
              <a-descriptions-item label="当前库存">{{ traceResult.finishedBatch.quantity }}</a-descriptions-item>
              <a-descriptions-item label="初始数量">{{ traceResult.finishedBatch.initial_quantity }}</a-descriptions-item>
              <a-descriptions-item label="入库日期">{{ formatDate(traceResult.finishedBatch.inbound_date) }}</a-descriptions-item>
              <a-descriptions-item label="生产单号">{{ traceResult.finishedBatch.production_order_number || '-' }}</a-descriptions-item>
            </a-descriptions>

            <h4>关联原材料批次 ({{ traceResult.materialBatches?.length || 0 }}条)</h4>
            <a-table
              :dataSource="traceResult.materialBatches"
              :columns="traceLinkColumns"
              :pagination="false"
              :scroll="{ x: 1000 }"
              size="small"
              rowKey="id"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'action'">
                  <a-button type="link" size="small" @click="() => { traceBatchNumber = record.material_batch_number; traceDirection = 'reverse'; handleTrace() }">
                    反向追溯
                  </a-button>
                </template>
              </template>
            </a-table>
          </template>

          <!-- 反向追溯结果 -->
          <template v-if="traceDirection === 'reverse' && traceResult.materialBatch">
            <a-descriptions title="原材料批次信息" bordered size="small" :column="3" style="margin-bottom: 16px;">
              <a-descriptions-item label="批次号">{{ traceResult.materialBatch.batch_number }}</a-descriptions-item>
              <a-descriptions-item label="物料编号">{{ traceResult.materialBatch.item_number }}</a-descriptions-item>
              <a-descriptions-item label="物料名称">{{ traceResult.materialBatch.item_name }}</a-descriptions-item>
              <a-descriptions-item label="规格">{{ traceResult.materialBatch.specifications }}</a-descriptions-item>
              <a-descriptions-item label="仓库">{{ traceResult.materialBatch.warehouse_name }}</a-descriptions-item>
              <a-descriptions-item label="当前库存">{{ traceResult.materialBatch.quantity }}</a-descriptions-item>
              <a-descriptions-item label="初始数量">{{ traceResult.materialBatch.initial_quantity }}</a-descriptions-item>
              <a-descriptions-item label="入库日期">{{ formatDate(traceResult.materialBatch.inbound_date) }}</a-descriptions-item>
              <a-descriptions-item label="生产单号">{{ traceResult.materialBatch.production_order_number || '-' }}</a-descriptions-item>
            </a-descriptions>

            <h4>关联成品批次 ({{ traceResult.finishedBatches?.length || 0 }}条)</h4>
            <a-table
              :dataSource="traceResult.finishedBatches"
              :columns="reverseTraceLinkColumns"
              :pagination="false"
              :scroll="{ x: 1000 }"
              size="small"
              rowKey="id"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'action'">
                  <a-button type="link" size="small" @click="() => { traceBatchNumber = record.finished_batch_number; traceDirection = 'forward'; handleTrace() }">
                    正向追溯
                  </a-button>
                </template>
              </template>
            </a-table>
          </template>

          <!-- 相关生产单 -->
          <template v-if="traceResult.productionOrders?.length > 0">
            <h4 style="margin-top: 16px;">相关生产单</h4>
            <a-table
              :dataSource="traceResult.productionOrders"
              :pagination="false"
              size="small"
              rowKey="production_order_number"
            >
              <a-table-column title="生产单号" dataIndex="production_order_number" :width="140" />
              <a-table-column title="物料编号" dataIndex="item_number" :width="130" />
              <a-table-column title="物料名称" dataIndex="item_name" :width="160" />
              <a-table-column title="计划数量" dataIndex="planned_quantity" :width="100" />
              <a-table-column title="入库数量" dataIndex="inbound_quantity" :width="100" />
              <a-table-column title="状态" dataIndex="plan_status" :width="80" />
              <a-table-column title="生产日期" dataIndex="production_date" :width="110">
                <template #default="{ record }">{{ formatDateShort(record.production_date) }}</template>
              </a-table-column>
              <a-table-column title="操作" :width="100">
                <template #default="{ record }">
                  <a-button type="link" size="small" @click="() => { activeTab = 'production'; ponNumber = record.production_order_number; handlePonTrace() }">
                    详情追溯
                  </a-button>
                </template>
              </a-table-column>
            </a-table>
          </template>
        </template>
      </a-tab-pane>

      <!-- 生产单追溯 -->
      <a-tab-pane key="production">
        <template #tab>
          <FileSearchOutlined />
          生产单追溯
        </template>
        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center;">
          <a-input
            v-model:value="ponNumber"
            placeholder="输入生产单号"
            style="width: 300px"
            @pressEnter="handlePonTrace"
          />
          <a-button type="primary" :loading="loading" @click="handlePonTrace">
            <template #icon><SearchOutlined /></template>
            追溯
          </a-button>
        </div>

        <template v-if="ponResult">
          <!-- 生产单信息 -->
          <template v-if="ponResult.productionOrder">
            <a-descriptions title="生产单信息" bordered size="small" :column="3" style="margin-bottom: 16px;">
              <a-descriptions-item label="生产单号">{{ ponResult.productionOrder.production_order_number }}</a-descriptions-item>
              <a-descriptions-item label="物料编号">{{ ponResult.productionOrder.item_number }}</a-descriptions-item>
              <a-descriptions-item label="物料名称">{{ ponResult.productionOrder.item_name }}</a-descriptions-item>
              <a-descriptions-item label="计划数量">{{ ponResult.productionOrder.planned_quantity }}</a-descriptions-item>
              <a-descriptions-item label="入库数量">{{ ponResult.productionOrder.inbound_quantity || 0 }}</a-descriptions-item>
              <a-descriptions-item label="状态">{{ ponResult.productionOrder.plan_status }}</a-descriptions-item>
            </a-descriptions>
          </template>

          <!-- 成品批次 -->
          <template v-if="ponResult.finishedBatches?.length > 0">
            <h4>产出成品批次 ({{ ponResult.finishedBatches.length }}条)</h4>
            <a-table
              :dataSource="ponResult.finishedBatches"
              :columns="finishedColumns.filter(c => c.key !== 'action')"
              :pagination="false"
              size="small"
              rowKey="id"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'inbound_date'">{{ formatDateShort(record.inbound_date) }}</template>
                <template v-if="column.dataIndex === 'status'">
                  <a-tag :color="record.status === '正常' ? 'green' : 'orange'">{{ record.status }}</a-tag>
                </template>
              </template>
            </a-table>
          </template>

          <!-- 半成品批次 -->
          <template v-if="ponResult.materialBatches?.length > 0">
            <h4 style="margin-top: 16px;">产出半成品批次 ({{ ponResult.materialBatches.length }}条)</h4>
            <a-table
              :dataSource="ponResult.materialBatches"
              :pagination="false"
              size="small"
              rowKey="id"
            >
              <a-table-column title="批次号" dataIndex="batch_number" :width="160" />
              <a-table-column title="物料编号" dataIndex="item_number" :width="130" />
              <a-table-column title="物料名称" dataIndex="item_name" :width="160" />
              <a-table-column title="仓库" dataIndex="warehouse_name" :width="120" />
              <a-table-column title="当前库存" dataIndex="quantity" :width="100" />
              <a-table-column title="入库日期" dataIndex="inbound_date" :width="110">
                <template #default="{ record }">{{ formatDateShort(record.inbound_date) }}</template>
              </a-table-column>
              <a-table-column title="状态" dataIndex="status" :width="80">
                <template #default="{ record }">
                  <a-tag :color="record.status === '正常' ? 'green' : 'orange'">{{ record.status }}</a-tag>
                </template>
              </a-table-column>
            </a-table>
          </template>

          <!-- 领料记录 -->
          <template v-if="ponResult.issueRecords?.length > 0">
            <h4 style="margin-top: 16px;">领料记录 ({{ ponResult.issueRecords.length }}条)</h4>
            <a-table
              :dataSource="ponResult.issueRecords"
              :columns="issueColumns"
              :pagination="false"
              size="small"
              rowKey="batch_number"
            />
          </template>

          <!-- 追溯关联 -->
          <template v-if="ponResult.traceLinks?.length > 0">
            <h4 style="margin-top: 16px;">追溯关联 ({{ ponResult.traceLinks.length }}条)</h4>
            <a-table
              :dataSource="ponResult.traceLinks"
              :pagination="false"
              size="small"
              rowKey="id"
            >
              <a-table-column title="成品批次" dataIndex="finished_batch_number" :width="160" />
              <a-table-column title="成品" dataIndex="finished_item_name" :width="140" />
              <a-table-column title="原材料批次" dataIndex="material_batch_number" :width="160" />
              <a-table-column title="原材料" dataIndex="material_item_name" :width="140" />
              <a-table-column title="领料数量" dataIndex="material_quantity" :width="100" />
              <a-table-column title="关联类型" dataIndex="link_type" :width="80" />
            </a-table>
          </template>
        </template>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style scoped>
.page-container {
  padding: 16px;
}
h4 {
  margin: 8px 0;
  color: #333;
}
</style>
