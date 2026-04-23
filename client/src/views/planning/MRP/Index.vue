<script setup lang="ts">
import { ref, reactive, computed, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, SearchOutlined, ExclamationCircleOutlined,
  ApartmentOutlined, CheckCircleOutlined
} from '@ant-design/icons-vue'
import { getPlansForMrp, runMRP, getMRPRunDetail, executeMRP } from '@/api/planning/mrp'

// ==================== State ====================
const loading = ref(false)
const planList = ref<any[]>([])
const selectedPlanKeys = ref<string[]>([])
const mrpRunning = ref(false)
const mrpExecuting = ref(false)

const filterForm = reactive({ search: '', start_date: '', end_date: '' })

// MRP 结果
const mrpResult = ref<any>(null)
const mrpDetails = ref<any[]>([])
const activeTab = ref('all')
const selectedDetailKeys = ref<number[]>([])

// 双源决策弹窗
const dualSourceVisible = ref(false)
const dualSourceItems = ref<any[]>([])
const selectedDualKeys = ref<number[]>([])

// ==================== 计划列表 ====================
const planColumns = [
  { title: '计划编号', dataIndex: 'production_number', key: 'production_number', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, ellipsis: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100, align: 'right' as const },
  { title: '计划完成时间', dataIndex: 'planned_completion_time', key: 'planned_completion_time', width: 130 },
  { title: '来源', dataIndex: 'source_order_number', key: 'source_order_number', width: 120 },
]

// ==================== 结果列表 ====================
const detailColumns = [
  { title: 'BOM层', dataIndex: 'bom_level', key: 'bom_level', width: 65, align: 'center' as const },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100, ellipsis: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 55 },
  { title: '类型', dataIndex: 'item_type', key: 'item_type', width: 70 },
  { title: '业务范围', dataIndex: 'business_scope', key: 'business_scope', width: 100 },
  { title: '毛需求', dataIndex: 'gross_requirement', key: 'gross_requirement', width: 90, align: 'right' as const },
  { title: '库存', dataIndex: 'on_hand_inventory', key: 'on_hand_inventory', width: 75, align: 'right' as const },
  { title: '在制品', dataIndex: 'wip_quantity', key: 'wip_quantity', width: 75, align: 'right' as const },
  { title: '在途采购', dataIndex: 'in_transit_po', key: 'in_transit_po', width: 85, align: 'right' as const },
  { title: '待执行PR', dataIndex: 'pending_pr', key: 'pending_pr', width: 85, align: 'right' as const },
  { title: '安全库存', dataIndex: 'safety_stock', key: 'safety_stock', width: 80, align: 'right' as const },
  { title: '净需求', dataIndex: 'net_requirement', key: 'net_requirement', width: 90, align: 'right' as const },
  { title: '计划开工', dataIndex: 'planned_start_date', key: 'planned_start_date', width: 100 },
  { title: '计划完工', dataIndex: 'planned_due_date', key: 'planned_due_date', width: 100 },
  { title: '提前期', dataIndex: 'lead_time_days', key: 'lead_time_days', width: 65, align: 'center' as const },
  { title: '操作类型', dataIndex: 'action_type', key: 'action_type', width: 100 },
]

// ==================== 计算属性 ====================
const filteredDetails = computed(() => {
  if (!mrpDetails.value.length) return []
  if (activeTab.value === 'all') return mrpDetails.value
  if (activeTab.value === 'produce') return mrpDetails.value.filter(d => d.action_type === '生产' || d.action_type === '生产+采购')
  if (activeTab.value === 'purchase') return mrpDetails.value.filter(d => d.action_type === '采购' || d.action_type === '生产+采购')
  if (activeTab.value === 'dual') return mrpDetails.value.filter(d => d.action_type === '生产+采购')
  return mrpDetails.value
})

const summary = computed(() => {
  const all = mrpDetails.value
  return {
    total: all.length,
    produce: all.filter(d => d.action_type === '生产').length,
    purchase: all.filter(d => d.action_type === '采购').length,
    dual: all.filter(d => d.action_type === '生产+采购').length,
    withDemand: all.filter(d => parseFloat(d.net_requirement) > 0).length
  }
})

// ==================== 方法 ====================
const loadPlans = async () => {
  loading.value = true
  try {
    const res: any = await getPlansForMrp(filterForm)
    planList.value = res.data || []
  } catch { message.error('加载计划列表失败') }
  finally { loading.value = false }
}

const handleRunMRP = async () => {
  if (selectedPlanKeys.value.length === 0) {
    message.warning('请选择至少一条生产计划')
    return
  }
  mrpRunning.value = true
  try {
    const res: any = await runMRP({ production_numbers: selectedPlanKeys.value })
    const data = res.data
    if (data?.mrp_run_number) {
      message.success(`MRP计算完成: ${data.mrp_run_number}`)
      // 加载详情
      await loadMRPDetail(data.mrp_run_number)
      // 刷新计划列表
      await loadPlans()
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || 'MRP计算失败')
  } finally { mrpRunning.value = false }
}

const loadMRPDetail = async (mrpRunNumber: string) => {
  try {
    const res: any = await getMRPRunDetail(mrpRunNumber)
    const data = res.data
    mrpResult.value = data?.run || null
    mrpDetails.value = (data?.details || []).map((d: any) => ({ ...d, key: d.id }))
    // 默认全选有净需求的行
    selectedDetailKeys.value = mrpDetails.value
      .filter(d => parseFloat(d.net_requirement) > 0)
      .map(d => d.id)
  } catch { message.error('加载MRP结果失败') }
}

const handleExecute = () => {
  const selected = mrpDetails.value.filter(d => selectedDetailKeys.value.includes(d.id) && parseFloat(d.net_requirement) > 0)
  if (selected.length === 0) {
    message.warning('请选择至少一条有净需求的结果')
    return
  }

  // 检查是否有双源物料
  const dualItems = selected.filter(d => d.action_type === '生产+采购')
  if (dualItems.length > 0) {
    // 弹出双源决策窗口
    dualSourceItems.value = dualItems.map(d => ({
      ...d,
      produce_qty: parseFloat(d.net_requirement) || 0,
      purchase_qty: 0
    }))
    selectedDualKeys.value = dualItems.map(d => d.id)
    dualSourceVisible.value = true
    return
  }

  // 无双源，直接确认执行
  confirmExecute(selected)
}

const confirmExecute = (selected?: any[]) => {
  const items = selected || mrpDetails.value.filter(d => selectedDetailKeys.value.includes(d.id) && parseFloat(d.net_requirement) > 0)

  // 合并双源决策结果
  const dualMap: Record<number, { produce_qty: number; purchase_qty: number }> = {}
  for (const ds of dualSourceItems.value) {
    dualMap[ds.id] = { produce_qty: ds.produce_qty, purchase_qty: ds.purchase_qty }
  }

  const executeItems = items.map(item => {
    const dual = dualMap[item.id]
    return {
      id: item.id,
      produce_quantity: dual ? dual.produce_qty : (item.action_type === '采购' ? 0 : parseFloat(item.net_requirement) || 0),
      purchase_quantity: dual ? dual.purchase_qty : (item.action_type === '采购' ? parseFloat(item.net_requirement) || 0 : 0)
    }
  })

  Modal.confirm({
    title: '确认执行MRP',
    icon: createVNode(ExclamationCircleOutlined),
    content: `将为 ${executeItems.length} 个物料生成生产单和/或采购申请，确认执行？`,
    onOk: () => doExecute(executeItems)
  })
}

const doExecute = async (items: any[]) => {
  if (!mrpResult.value) return
  mrpExecuting.value = true
  try {
    const res: any = await executeMRP({
      mrp_run_number: mrpResult.value.mrp_run_number,
      items
    })
    message.success(res.message || 'MRP执行完成')
    dualSourceVisible.value = false
    // 刷新详情
    await loadMRPDetail(mrpResult.value.mrp_run_number)
  } catch (e: any) {
    message.error(e.response?.data?.message || 'MRP执行失败')
  } finally { mrpExecuting.value = false }
}

// 双源弹窗: 全部生产 (仅对勾选项)
const dualAllProduce = () => {
  dualSourceItems.value.forEach(item => {
    if (selectedDualKeys.value.includes(item.id)) {
      item.produce_qty = parseFloat(item.net_requirement) || 0
      item.purchase_qty = 0
    }
  })
}

// 双源弹窗: 全部采购 (仅对勾选项)
const dualAllPurchase = () => {
  dualSourceItems.value.forEach(item => {
    if (selectedDualKeys.value.includes(item.id)) {
      item.produce_qty = 0
      item.purchase_qty = parseFloat(item.net_requirement) || 0
    }
  })
}

// 双源弹窗: 单行联动 - 改生产数量时自动调整采购数量
const onProduceQtyChange = (item: any) => {
  const net = parseFloat(item.net_requirement) || 0
  item.produce_qty = Math.max(0, Math.min(item.produce_qty || 0, net))
  item.purchase_qty = Math.round((net - item.produce_qty) * 10000) / 10000
}

const onPurchaseQtyChange = (item: any) => {
  const net = parseFloat(item.net_requirement) || 0
  item.purchase_qty = Math.max(0, Math.min(item.purchase_qty || 0, net))
  item.produce_qty = Math.round((net - item.purchase_qty) * 10000) / 10000
}

// 双源弹窗: 确认
const handleDualSourceConfirm = () => {
  // 校验
  for (const item of dualSourceItems.value) {
    const net = parseFloat(item.net_requirement) || 0
    const sum = (item.produce_qty || 0) + (item.purchase_qty || 0)
    if (Math.abs(sum - net) > 0.01) {
      message.error(`物料 ${item.item_number} 的生产+采购数量(${sum})不等于净需求(${net})`)
      return
    }
  }

  // 合并所有选中项执行
  const allSelected = mrpDetails.value.filter(d => selectedDetailKeys.value.includes(d.id) && parseFloat(d.net_requirement) > 0)
  confirmExecute(allSelected)
}

// 格式化日期
const formatDate = (val: any) => {
  if (!val) return '-'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 初始加载
loadPlans()
</script>

<template>
  <div class="mrp-page">
    <div class="page-header">
      <h3 class="page-title">MRP运算</h3>
    </div>
    <!-- 区域1: 生产计划选择 -->
    <a-card title="选择生产计划" size="small" style="margin-bottom: 12px">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="handleRunMRP" :loading="mrpRunning" :disabled="selectedPlanKeys.length === 0">
            <ApartmentOutlined /> 运行 MRP 计算
          </a-button>
        </a-space>
      </template>
      <a-row :gutter="12" style="margin-bottom: 10px">
        <a-col :span="6">
          <a-input v-model:value="filterForm.search" placeholder="搜索计划编号/物料编号/名称" allow-clear @press-enter="loadPlans">
            <template #prefix><SearchOutlined /></template>
          </a-input>
        </a-col>
        <a-col :span="4">
          <a-date-picker v-model:value="filterForm.start_date" placeholder="计划完成起始" style="width: 100%" valueFormat="YYYY-MM-DD" />
        </a-col>
        <a-col :span="4">
          <a-date-picker v-model:value="filterForm.end_date" placeholder="计划完成截止" style="width: 100%" valueFormat="YYYY-MM-DD" />
        </a-col>
        <a-col :span="4">
          <a-space>
            <a-button type="primary" @click="loadPlans" :loading="loading"><SearchOutlined /> 查询</a-button>
            <a-button @click="() => { filterForm.search = ''; filterForm.start_date = ''; filterForm.end_date = ''; loadPlans() }"><ReloadOutlined /> 重置</a-button>
          </a-space>
        </a-col>
        <a-col :span="6" style="text-align: right">
          <span style="color: #999; font-size: 12px">已选 {{ selectedPlanKeys.length }} / {{ planList.length }} 条计划</span>
        </a-col>
      </a-row>
      <a-table
        :columns="planColumns"
        :data-source="planList"
        :row-selection="{ selectedRowKeys: selectedPlanKeys, onChange: (keys: any) => selectedPlanKeys = keys }"
        row-key="production_number"
        :loading="loading"
        size="small"
        :scroll="{ x: 900, y: 240 }"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'planned_completion_time'">
            {{ formatDate(record.planned_completion_time) }}
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 区域2: MRP计算结果 -->
    <a-card v-if="mrpResult" size="small">
      <template #title>
        <a-space>
          <span>MRP 计算结果</span>
          <a-tag color="blue">{{ mrpResult.mrp_run_number }}</a-tag>
          <a-tag :color="mrpResult.run_status === '已确认' ? 'green' : mrpResult.run_status === '已取消' ? 'red' : 'orange'">
            {{ mrpResult.run_status }}
          </a-tag>
        </a-space>
      </template>
      <template #extra>
        <a-button
          v-if="mrpResult.run_status === '已计算'"
          type="primary"
          @click="handleExecute"
          :loading="mrpExecuting"
          :disabled="selectedDetailKeys.length === 0"
        >
          <CheckCircleOutlined /> 确认执行
        </a-button>
      </template>

      <!-- 汇总统计 -->
      <a-row :gutter="16" style="margin-bottom: 12px">
        <a-col :span="4"><a-statistic title="组件总数" :value="summary.total" /></a-col>
        <a-col :span="4"><a-statistic title="需生产" :value="summary.produce" value-style="color: #1890ff" /></a-col>
        <a-col :span="4"><a-statistic title="需采购" :value="summary.purchase" value-style="color: #52c41a" /></a-col>
        <a-col :span="4"><a-statistic title="双源待决策" :value="summary.dual" value-style="color: #fa8c16" /></a-col>
        <a-col :span="4"><a-statistic title="有净需求" :value="summary.withDemand" value-style="color: #f5222d" /></a-col>
      </a-row>

      <!-- 分页签 -->
      <a-tabs v-model:activeKey="activeTab" size="small">
        <a-tab-pane key="all" tab="全部" />
        <a-tab-pane key="produce" :tab="`生产单 (${summary.produce + summary.dual})`" />
        <a-tab-pane key="purchase" :tab="`采购申请 (${summary.purchase + summary.dual})`" />
        <a-tab-pane key="dual" v-if="summary.dual > 0" :tab="`双源待决策 (${summary.dual})`" />
      </a-tabs>

      <!-- 结果表格 -->
      <a-table
        :columns="detailColumns"
        :data-source="filteredDetails"
        :row-selection="mrpResult.run_status === '已计算' ? { selectedRowKeys: selectedDetailKeys, onChange: (keys: any) => selectedDetailKeys = keys } : undefined"
        row-key="id"
        size="small"
        :scroll="{ x: 1800, y: 400 }"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action_type'">
            <a-tag v-if="record.action_type === '生产'" color="blue">生产</a-tag>
            <a-tag v-else-if="record.action_type === '采购'" color="green">采购</a-tag>
            <a-tag v-else-if="record.action_type === '生产+采购'" color="orange">双源</a-tag>
          </template>
          <template v-if="column.key === 'business_scope'">
            <template v-if="record.business_scope">
              <a-tag v-for="s in record.business_scope.split(',')" :key="s" :color="s.trim() === '生产' ? 'blue' : 'green'" style="margin: 1px; font-size: 11px; padding: 0 4px; line-height: 18px">{{ s.trim() }}</a-tag>
            </template>
          </template>
          <template v-if="column.key === 'net_requirement'">
            <span :style="{ color: parseFloat(record.net_requirement) > 0 ? '#f5222d' : '#52c41a', fontWeight: 'bold' }">
              {{ record.net_requirement }}
            </span>
          </template>
          <template v-if="column.key === 'planned_start_date'">{{ record.planned_start_date || '-' }}</template>
          <template v-if="column.key === 'planned_due_date'">{{ record.planned_due_date || '-' }}</template>
        </template>
      </a-table>
    </a-card>

    <!-- 双源决策弹窗 -->
    <a-modal
      v-model:open="dualSourceVisible"
      title="双源物料分配决策"
      width="980px"
      :ok-text="'确认并执行'"
      :cancel-text="'取消'"
      @ok="handleDualSourceConfirm"
      :confirm-loading="mrpExecuting"
    >
      <a-alert message="以下物料同时支持生产和采购，请勾选后分配数量。生产+采购数量须等于净需求量。无BOM的物料若选择生产，需后续补建制造BOM。" type="info" show-icon style="margin-bottom: 12px" />
      <a-space style="margin-bottom: 8px">
        <a-button size="small" @click="dualAllProduce" :disabled="selectedDualKeys.length === 0">全部生产 ({{ selectedDualKeys.length }})</a-button>
        <a-button size="small" @click="dualAllPurchase" :disabled="selectedDualKeys.length === 0">全部采购 ({{ selectedDualKeys.length }})</a-button>
        <span style="color: #999; font-size: 12px; margin-left: 8px">已选 {{ selectedDualKeys.length }} / {{ dualSourceItems.length }} 项，操作仅对勾选项生效</span>
      </a-space>
      <a-table
        :data-source="dualSourceItems"
        row-key="id"
        size="small"
        :pagination="false"
        :scroll="{ y: 300 }"
        :row-selection="{ selectedRowKeys: selectedDualKeys, onChange: (keys: any) => selectedDualKeys = keys }"
      >
        <a-table-column title="物料编号" dataIndex="item_number" :width="120" />
        <a-table-column title="物料名称" dataIndex="item_name" :width="130" />
        <a-table-column title="BOM" :width="70" align="center">
          <template #default="{ record }">
            <a-tag v-if="record.mfg_bom_number" color="blue" style="font-size: 11px">有</a-tag>
            <a-tooltip v-else title="无制造BOM，选择生产需后续补建BOM"><a-tag color="red" style="font-size: 11px; cursor: help">无</a-tag></a-tooltip>
          </template>
        </a-table-column>
        <a-table-column title="净需求" dataIndex="net_requirement" :width="90" align="right">
          <template #default="{ record }">
            <span style="font-weight: bold; color: #f5222d">{{ record.net_requirement }}</span>
          </template>
        </a-table-column>
        <a-table-column title="库存" dataIndex="on_hand_inventory" :width="70" align="right" />
        <a-table-column title="在制品" dataIndex="wip_quantity" :width="70" align="right" />
        <a-table-column title="在途采购" dataIndex="in_transit_po" :width="80" align="right" />
        <a-table-column title="生产数量" :width="120">
          <template #default="{ record }">
            <a-input-number
              v-model:value="record.produce_qty"
              :min="0"
              :max="parseFloat(record.net_requirement) || 0"
              size="small"
              style="width: 100%"
              @change="onProduceQtyChange(record)"
            />
          </template>
        </a-table-column>
        <a-table-column title="采购数量" :width="120">
          <template #default="{ record }">
            <a-input-number
              v-model:value="record.purchase_qty"
              :min="0"
              :max="parseFloat(record.net_requirement) || 0"
              size="small"
              style="width: 100%"
              @change="onPurchaseQtyChange(record)"
            />
          </template>
        </a-table-column>
        <a-table-column title="" :width="60">
          <template #default="{ record }">
            <a-tag v-if="Math.abs((record.produce_qty || 0) + (record.purchase_qty || 0) - (parseFloat(record.net_requirement) || 0)) < 0.01" color="green">OK</a-tag>
            <a-tag v-else color="red">!</a-tag>
          </template>
        </a-table-column>
      </a-table>
    </a-modal>
  </div>
</template>

<style scoped>
.mrp-page {
  padding: 0;
}
.page-header {
  margin-bottom: 8px;
}
.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
}
</style>
