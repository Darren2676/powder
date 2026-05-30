<template>
  <div class="material-issue-bp-page">
    <a-page-header title="按工序备料" style="padding: 0; margin: 0;" />

    <!-- 顶部：搜索 + 生产单信息 -->
    <a-card :bordered="false" size="small" class="top-card">
      <a-row :gutter="12" align="middle">
        <a-col :span="8">
          <a-input-search
            ref="scanInputRef"
            v-model:value="orderInput"
            placeholder="扫码或输入生产单编号"
            enter-button="查询"
            :loading="loading"
            @search="handleSearch"
            size="small"
          />
        </a-col>
        <a-col :span="14">
          <template v-if="orderInfo">
            <span class="info-item"><b>{{ orderInfo.production_order_number }}</b></span>
            <a-divider type="vertical" />
            <span class="info-item">{{ orderInfo.item_number }}</span>
            <a-divider type="vertical" />
            <span class="info-item">{{ orderInfo.item_name }}</span>
            <a-divider type="vertical" />
            <span class="info-item">{{ orderInfo.specifications }}</span>
            <a-divider type="vertical" />
            <span class="info-item">计划: <b style="color:#1890ff;">{{ orderInfo.planned_quantity }}</b> {{ orderInfo.basic_unit }}</span>
            <a-tag v-if="orderInfo.plan_status" :color="statusColor(orderInfo.plan_status)" size="small" style="margin-left:4px;">{{ orderInfo.plan_status }}</a-tag>
          </template>
        </a-col>
        <a-col :span="2" style="text-align:right;">
          <a-button size="small" @click="handleReset"><ReloadOutlined /></a-button>
        </a-col>
      </a-row>
    </a-card>

    <!-- 备料单信息摘要 -->
    <a-card v-if="preparationHeader" :bordered="false" size="small" class="prep-card">
      <a-row :gutter="16" align="middle">
        <a-col :flex="'auto'">
          <a-space :size="12">
            <span class="info-item">备料单: <b>{{ preparationHeader.preparation_number }}</b></span>
            <span class="info-item">BOM: {{ preparationHeader.bom_number }} ({{ preparationHeader.bom_version }})</span>
            <span class="info-item">物料种类: <b>{{ preparationHeader.total_material_types }}</b></span>
            <a-tag :color="prepStatusColor">{{ preparationHeader.preparation_status }}</a-tag>
          </a-space>
        </a-col>
        <a-col>
          <span v-if="previousIssues.length > 0" class="info-item" style="color:#888;">已领料 {{ previousIssues.length }} 次</span>
        </a-col>
      </a-row>
    </a-card>

    <!-- 历史领料记录 -->
    <a-card v-if="previousIssues.length > 0" :bordered="false" size="small" class="history-card">
      <template #title>
        <span style="font-size:13px;">历史领料记录（{{ previousIssues.length }} 次）</span>
      </template>
      <a-table
        :columns="historyCols"
        :data-source="previousIssues"
        :pagination="false"
        size="small"
        row-key="issue_number"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            <a-popconfirm
              title="确认要撤回此领料单吗？物料库存、备料单状态、生产单状态将同步回退。"
              ok-text="确认撤回"
              cancel-text="取消"
              ok-type="danger"
              @confirm="handleDeleteIssue(record)"
            >
              <a-button type="link" size="small" danger :loading="deletingIssue === record.issue_number">
                <template #icon><DeleteOutlined /></template>撤回
              </a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 无数据提示 -->
    <a-card v-if="orderInfo && !preparationHeader && !loading" :bordered="false" size="small" style="margin-top:8px;text-align:center;">
      <a-alert message="该生产单尚未生成按工序备料清单，请先生成按工序备料清单" type="warning" show-icon />
    </a-card>

    <!-- 按工序分组备料 -->
    <template v-if="stepGroups.length > 0">
      <a-collapse v-model:activeKey="activeSteps" style="margin-top:8px;">
        <a-collapse-panel v-for="group in stepGroups" :key="String(group.stepNumber)" :collapsible="'header'">
          <template #header>
            <a-space :size="16">
              <span style="font-weight:600;">工序 {{ group.stepNumber }}</span>
              <span>{{ group.processName }}</span>
              <span v-if="group.workCenterName" style="color:#888;">{{ group.workCenterName }}</span>
              <span style="color:#888;">物料: {{ group.items.length }} 种</span>
              <a-tag :color="group.stepStatusColor">{{ group.stepStatusText }}</a-tag>
            </a-space>
          </template>
          <template #extra>
            <a-button
              v-if="group.stepStatusText !== '已领料'"
              type="primary"
              size="small"
              @click.stop="openStepIssue(group)"
            >备料</a-button>
          </template>

          <!-- 工序物料列表 -->
          <a-table
            :columns="stepDetailCols"
            :data-source="group.items"
            :pagination="false"
            :scroll="{ y: 300 }"
            size="small"
            row-key="_uid"
            bordered
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'remaining'">
                <span :style="{ color: record.remaining_quantity <= 0 ? '#52c41a' : '#fa8c16', fontWeight: 600 }">
                  {{ record.remaining_quantity }}
                </span>
              </template>
              <template v-if="column.key === 'is_key_material'">
                <a-tag v-if="record.is_key_material === 1" color="red">是</a-tag>
                <span v-else>-</span>
              </template>
              <template v-if="column.key === 'issue_progress'">
                <a-progress
                  :percent="record.required_quantity > 0 ? Math.round((record.issued_quantity / record.required_quantity) * 100) : 0"
                  :stroke-color="record.issued_quantity >= record.required_quantity ? '#52c41a' : '#1890ff'"
                  size="small"
                  :show-info="false"
                  style="width:80px;display:inline-block;"
                />
                <span style="margin-left:4px;font-size:12px;">{{ record.issued_quantity }}/{{ record.required_quantity }}</span>
              </template>
            </template>
          </a-table>
        </a-collapse-panel>
      </a-collapse>
    </template>

    <!-- 候选生产单选择弹窗 -->
    <a-modal
      v-model:open="candidateVisible"
      :width="900"
      :footer="null"
      destroy-on-close
    >
      <template #title>请选择生产单</template>
      <a-table
        :columns="candidateCols"
        :data-source="candidateList"
        :pagination="false"
        :scroll="{ y: 400 }"
        size="small"
        row-key="production_order_number"
        :row-class-name="() => 'candidate-row'"
        :custom-row="(record: any) => ({ onClick: () => selectCandidate(record) })"
      />
    </a-modal>

    <!-- 工序备料弹窗 -->
    <a-modal
      v-model:open="issueModalVisible"
      :width="1200"
      :footer="null"
      :mask-closable="false"
      destroy-on-close
    >
      <template #title>
        <span>按工序备料 - 工序 {{ currentStepGroup?.stepNumber }} {{ currentStepGroup?.processName }}</span>
      </template>

      <!-- 头信息 -->
      <a-descriptions :column="4" bordered size="small" style="margin-bottom:12px;">
        <a-descriptions-item label="生产单编号">{{ orderInfo?.production_order_number }}</a-descriptions-item>
        <a-descriptions-item label="产品编号">{{ orderInfo?.item_number }}</a-descriptions-item>
        <a-descriptions-item label="产品名称">{{ orderInfo?.item_name }}</a-descriptions-item>
        <a-descriptions-item label="规格">{{ orderInfo?.specifications }}</a-descriptions-item>
        <a-descriptions-item label="计划数量">{{ orderInfo?.planned_quantity }} {{ orderInfo?.basic_unit }}</a-descriptions-item>
        <a-descriptions-item label="工序号">{{ currentStepGroup?.stepNumber }}</a-descriptions-item>
        <a-descriptions-item label="工序名称">{{ currentStepGroup?.processName }}</a-descriptions-item>
        <a-descriptions-item label="工作中心">{{ currentStepGroup?.workCenterName || '-' }}</a-descriptions-item>
      </a-descriptions>

      <!-- 备料明细表格 -->
      <a-table
        :columns="issueInputCols"
        :data-source="issueInputList"
        :pagination="false"
        :scroll="{ y: 400 }"
        size="small"
        row-key="_uid"
        bordered
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'remaining'">
            <span v-if="!record.is_added" :style="{ color: record.remaining_quantity <= 0 ? '#52c41a' : '#fa8c16', fontWeight: 600 }">
              {{ record.remaining_quantity }}
            </span>
            <span v-else style="color:#ccc;">-</span>
          </template>
          <template v-if="column.key === 'is_key_material'">
            <a-tag v-if="record.is_key_material === 1" color="red">是</a-tag>
            <span v-else>-</span>
          </template>
          <template v-if="column.key === 'input_actual_quantity'">
            <a-input-number
              v-model:value="record.input_actual_quantity"
              :min="0"
              size="small"
              placeholder="数量"
              style="width:100px;"
            />
          </template>
          <template v-if="column.key === 'input_batch_number'">
            <a-input
              v-model:value="record.input_batch_number"
              size="small"
              placeholder="批次号"
              style="width:130px;"
            />
          </template>
          <template v-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="addBatchRow(index)" style="padding:0;"><PlusOutlined /></a-button>
              <a-button v-if="record.is_added" type="link" size="small" danger @click="removeBatchRow(index)" style="padding:0;"><DeleteOutlined /></a-button>
            </a-space>
          </template>
        </template>
      </a-table>

      <!-- 底部操作 -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
        <a-space>
          <span style="font-size:12px;color:#888;">备注:</span>
          <a-input v-model:value="issueRemark" size="small" placeholder="本次领料备注" style="width:300px;" />
        </a-space>
        <a-space>
          <a-button size="small" @click="fillRemaining">填充未领量</a-button>
          <a-button size="small" @click="issueModalVisible = false">取消</a-button>
          <a-button type="primary" size="small" :loading="saving" :disabled="totalInputActual <= 0" @click="handleSave">
            保存领料 ({{ filledCount }} 项)
          </a-button>
        </a-space>
      </div>
    </a-modal>

    <!-- FIFO批次选择弹窗 -->
    <a-modal
      v-model:open="fifoVisible"
      :width="1100"
      :footer="null"
      :mask-closable="false"
      destroy-on-close
      :style="fifoModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onFifoDragStart">填充未领量 - FIFO批次选择</div>
      </template>
      <a-spin :spinning="fifoLoading">
        <div style="display:flex; gap:12px;">
          <!-- 左侧：物料列表 -->
          <div style="width:280px; flex-shrink:0; border-right:1px solid #f0f0f0; padding-right:12px;">
            <div style="font-weight:600; margin-bottom:8px; font-size:13px;">未领料物料 ({{ fifoMaterials.length }})</div>
            <div v-for="mat in fifoMaterials" :key="mat.material_number"
              :class="['fifo-mat-row', { 'fifo-mat-active': fifoActiveItem === mat.material_number }]"
              @click="fifoSelectMaterial(mat)"
            >
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:500; font-size:12px;">{{ mat.material_number }}</span>
                <span style="font-size:11px; color:#fa8c16;">{{ mat.remaining_quantity }} {{ mat.unit }}</span>
              </div>
              <div style="font-size:11px; color:#888; margin-top:2px;">{{ mat.material_name }}</div>
              <div style="font-size:11px; color:#52c41a; margin-top:1px;">默认仓库: {{ mat.default_warehouse || '无' }}</div>
            </div>
            <a-empty v-if="fifoMaterials.length === 0" description="无未领料物料" :image="null" style="padding:16px 0;" />
          </div>

          <!-- 右侧：批次详情 -->
          <div style="flex:1; min-width:0;">
            <template v-if="fifoCurrentInfo">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <a-space :size="12">
                  <span style="font-weight:600;">{{ fifoCurrentInfo.item_number }}</span>
                  <span style="color:#888;">{{ fifoCurrentInfo.item_name }}</span>
                </a-space>
                <a-space :size="8">
                  <span style="font-size:12px; color:#888;">仓库:</span>
                  <a-select
                    :value="fifoCurrentInfo.warehouse_number"
                    size="small"
                    style="width:180px;"
                    @change="(v: string) => fifoChangeWarehouse(fifoActiveItem, v)"
                  >
                    <a-select-option v-for="wh in fifoCurrentInfo.warehouses" :key="wh.warehouse_number" :value="wh.warehouse_number">
                      {{ wh.warehouse_number }} - {{ wh.warehouse_name }} ({{ wh.quantity }})
                    </a-select-option>
                  </a-select>
                  <span style="font-size:12px; color:#888;">可用量:</span>
                  <span style="font-weight:600; color:#1890ff;">{{ fifoCurrentInfo.available_qty }}</span>
                </a-space>
              </div>

              <a-table
                :columns="[
                  { title: '选择', key: 'selected', width: 50 },
                  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 140 },
                  { title: '入库日期', dataIndex: 'inbound_date', key: 'inbound_date', width: 100 },
                  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 100 },
                  { title: '可用数量', dataIndex: 'available', key: 'available', width: 90, align: 'right' },
                  { title: '分配数量', key: 'allocated_qty', width: 120 },
                  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 140 }
                ]"
                :data-source="fifoCurrentAllocations"
                :pagination="false"
                size="small"
                row-key="batch_number"
                bordered
                :scroll="{ y: 300 }"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'selected'">
                    <a-checkbox :checked="record.selected" @change="() => fifoToggleBatch(record)" />
                  </template>
                  <template v-if="column.key === 'inbound_date'">
                    {{ record.inbound_date ? record.inbound_date.substring(0, 10) : '-' }}
                  </template>
                  <template v-if="column.key === 'allocated_qty'">
                    <a-input-number
                      :value="record.allocated_qty"
                      :min="0"
                      :max="record.available"
                      size="small"
                      style="width:100px;"
                      :disabled="!record.selected"
                      @change="(v: number | null) => fifoChangeAllocatedQty(record, v)"
                    />
                  </template>
                </template>
              </a-table>

              <div style="margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; color:#888;">
                  已选批次: {{ fifoCurrentAllocations.filter((a: any) => a.selected).length }} / {{ fifoCurrentAllocations.length }}
                </span>
                <span style="font-size:13px;">
                  分配合计: <b style="color:#1890ff;">{{ fifoTotalAllocated }}</b>
                  <span style="color:#888; margin-left:8px;">需求: {{ fifoMaterials.find((m: any) => m.material_number === fifoActiveItem)?.remaining_quantity || 0 }}</span>
                </span>
              </div>
            </template>
            <a-empty v-else description="请从左侧选择物料" style="padding:60px 0;" />
          </div>
        </div>
      </a-spin>

      <!-- 底部操作 -->
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px; border-top:1px solid #f0f0f0; padding-top:12px;">
        <a-button @click="fifoVisible = false">取消</a-button>
        <a-button type="primary" @click="fifoConfirm">确认选择</a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, PlusOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { queryByOrder, createMaterialIssue, deleteMaterialIssue } from '@/api/production/materialIssue'
import { getMaterialBatchOptionsBulk, getMaterialBatchOptions } from '@/api/warehouse/materialWarehouse'
import { useModalDrag } from '@/composables/useModalDrag'

interface DetailItem {
  _uid: number
  is_added?: boolean
  id: number
  preparation_number: string
  line_number: number
  material_number: string
  material_name: string
  material_type: string
  unit: string
  required_quantity: number
  adjusted_quantity: number
  issued_quantity: number
  remaining_quantity: number
  step_number: number | null
  work_center_name: string
  work_center_number: string
  standard_process_name: string
  is_key_material: number
  default_warehouse: string
  bom_path: string
  remark: string
  input_actual_quantity: number | null
  input_batch_number: string
}

interface StepGroup {
  stepNumber: number
  processName: string
  workCenterName: string
  items: DetailItem[]
  stepStatusText: string
  stepStatusColor: string
}

const { modalStyle: fifoModalStyle, onDragStart: onFifoDragStart, resetDrag: resetFifoDrag } = useModalDrag()

let uidSeq = 0

const scanInputRef = ref<any>(null)
const orderInput = ref('')
const loading = ref(false)
const saving = ref(false)
const deletingIssue = ref<string | null>(null)
const issueModalVisible = ref(false)
const issueRemark = ref('')
const candidateVisible = ref(false)
const candidateList = ref<any[]>([])
const activeSteps = ref<string[]>([])

const orderInfo = ref<any>(null)
const preparationHeader = ref<any>(null)
const allDetails = ref<DetailItem[]>([])
const previousIssues = ref<any[]>([])
const currentStepGroup = ref<StepGroup | null>(null)
const issueInputList = ref<DetailItem[]>([])

const candidateCols = [
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90 },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status', width: 80 },
]

const stepDetailCols = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 130 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 150 },
  { title: '类型', dataIndex: 'material_type', key: 'material_type', width: 80 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
  { title: '需求数量', dataIndex: 'required_quantity', key: 'required_quantity', width: 90 },
  { title: '领料进度', key: 'issue_progress', width: 180 },
  { title: '未领量', key: 'remaining', width: 80 },
  { title: '关键', key: 'is_key_material', width: 60 },
]

const issueInputCols = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 130 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 150 },
  { title: '类型', dataIndex: 'material_type', key: 'material_type', width: 80 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
  { title: '需求数量', dataIndex: 'required_quantity', key: 'required_quantity', width: 90 },
  { title: '已领量', dataIndex: 'issued_quantity', key: 'issued_quantity', width: 80 },
  { title: '未领量', key: 'remaining', width: 80 },
  { title: '实际备料数量', key: 'input_actual_quantity', width: 120 },
  { title: '批次号', key: 'input_batch_number', width: 150 },
  { title: '关键', key: 'is_key_material', width: 60 },
  { title: '操作', key: 'action', width: 70, fixed: 'right' as const },
]

const prepStatusColor = computed(() => {
  const s = preparationHeader.value?.preparation_status
  if (s === '已领料') return 'green'
  if (s === '部分领料') return 'orange'
  return 'blue'
})

const historyCols = [
  { title: '领料单号', dataIndex: 'issue_number', key: 'issue_number', width: 150 },
  { title: '物料种类', dataIndex: 'total_issue_items', key: 'total_issue_items', width: 80 },
  { title: '状态', dataIndex: 'issue_status', key: 'issue_status', width: 80 },
  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90 },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '操作', key: 'action', width: 70, fixed: 'right' }
]

const totalInputActual = computed(() => issueInputList.value.reduce((s, d) => s + (d.input_actual_quantity || 0), 0))
const filledCount = computed(() => issueInputList.value.filter(d => (d.input_actual_quantity || 0) > 0).length)

// 按工序分组
const stepGroups = computed<StepGroup[]>(() => {
  if (allDetails.value.length === 0) return []

  const groupMap = new Map<number, DetailItem[]>()
  for (const item of allDetails.value) {
    const step = item.step_number ?? 0
    if (!groupMap.has(step)) groupMap.set(step, [])
    groupMap.get(step)!.push(item)
  }

  const groups: StepGroup[] = []
  const sortedSteps = Array.from(groupMap.keys()).sort((a, b) => a - b)

  for (const stepNum of sortedSteps) {
    const items = groupMap.get(stepNum)!
    const firstItem = items[0]
    const totalRequired = items.reduce((s, i) => s + i.required_quantity, 0)
    const totalIssued = items.reduce((s, i) => s + i.issued_quantity, 0)
    const allFullyIssued = items.every(i => i.issued_quantity >= i.required_quantity && i.required_quantity > 0)

    let statusText = '未领料'
    let statusColor = 'default'
    if (allFullyIssued) {
      statusText = '已领料'
      statusColor = 'green'
    } else if (totalIssued > 0) {
      statusText = '部分领料'
      statusColor = 'orange'
    }

    groups.push({
      stepNumber: stepNum,
      processName: firstItem.standard_process_name || '',
      workCenterName: firstItem.work_center_name || '',
      items,
      stepStatusText: statusText,
      stepStatusColor: statusColor
    })
  }

  return groups
})

const statusColor = (status: string) => {
  const map: Record<string, string> = {
    '未开始': 'default', '已派发': 'blue', '已备料': 'cyan', '生产中': 'orange', '已完成': 'green'
  }
  return map[status] || 'default'
}

const handleSearch = async (value: string) => {
  const keyword = (value || orderInput.value || '').trim()
  if (!keyword) { message.warning('请输入生产单编号'); return }
  loading.value = true
  try {
    const res: any = await queryByOrder(keyword)
    const data = res?.data
    if (!data) { message.error('查询失败'); return }

    if (data.matchType === 'multiple') {
      candidateList.value = data.candidates || []
      candidateVisible.value = true
      return
    }

    loadOrderData(data)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '查询失败')
  } finally { loading.value = false }
}

const loadOrderData = (data: any) => {
  orderInfo.value = data.order
  previousIssues.value = data.previousIssues || []

  if (!data.preparation) {
    preparationHeader.value = null
    allDetails.value = []
    return
  }

  preparationHeader.value = data.preparation

  // 仅保留有工序号的物料（按工序备料清单）
  const details = (data.details || []).filter((d: any) => d.step_number != null)
  allDetails.value = details.map((d: any) => {
    const required = parseFloat(d.required_quantity) || 0
    const issued = parseFloat(d.issued_quantity) || 0
    return {
      ...d,
      _uid: ++uidSeq,
      required_quantity: required,
      issued_quantity: issued,
      remaining_quantity: Math.max(Math.round((required - issued) * 10000) / 10000, 0),
      input_actual_quantity: null,
      input_batch_number: ''
    }
  })

  // 默认展开所有工序面板
  activeSteps.value = stepGroups.value.map(g => String(g.stepNumber))
}

const selectCandidate = async (record: any) => {
  candidateVisible.value = false
  orderInput.value = record.production_order_number
  loading.value = true
  try {
    const res: any = await queryByOrder(record.production_order_number)
    const data = res?.data
    if (!data) { message.error('查询失败'); return }
    if (data.matchType === 'multiple') {
      message.info('请使用完整的生产单编号查询')
      return
    }
    loadOrderData(data)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '查询失败')
  } finally { loading.value = false }
}

const handleReset = () => {
  orderInput.value = ''
  orderInfo.value = null
  preparationHeader.value = null
  allDetails.value = []
  previousIssues.value = []
  issueModalVisible.value = false
  candidateVisible.value = false
  candidateList.value = []
  currentStepGroup.value = null
  issueInputList.value = []
  activeSteps.value = []
  nextTick(() => { scanInputRef.value?.focus?.() })
}

const openStepIssue = (group: StepGroup) => {
  currentStepGroup.value = group
  // 克隆该工序的物料列表用于编辑
  issueInputList.value = group.items
    .filter(d => d.remaining_quantity > 0 || d.issued_quantity < d.required_quantity)
    .map(d => ({
      ...d,
      _uid: ++uidSeq,
      is_added: false,
      input_actual_quantity: null,
      input_batch_number: ''
    }))

  // 如果所有物料都已领完，提示
  if (issueInputList.value.length === 0) {
    issueInputList.value = group.items.map(d => ({
      ...d,
      _uid: ++uidSeq,
      is_added: false,
      input_actual_quantity: null,
      input_batch_number: ''
    }))
  }

  issueRemark.value = ''
  issueModalVisible.value = true
}

const addBatchRow = (index: number) => {
  const source = issueInputList.value[index]
  const maxLineNo = issueInputList.value
    .filter(d => d.id === source.id)
    .reduce((max, d) => Math.max(max, d.line_number), 0)
  const newRow: DetailItem = {
    ...source,
    _uid: ++uidSeq,
    is_added: true,
    line_number: maxLineNo + 1,
    remaining_quantity: 0,
    input_actual_quantity: null,
    input_batch_number: ''
  }
  issueInputList.value.splice(index + 1, 0, newRow)
}

const removeBatchRow = (index: number) => {
  issueInputList.value.splice(index, 1)
}

// ==================== FIFO批次选择 ====================
const fifoVisible = ref(false)
const fifoLoading = ref(false)
const fifoData = ref<Record<string, any>>({})
const fifoActiveItem = ref('')

const fifoMaterials = computed(() => {
  return issueInputList.value
    .filter(d => !d.is_added && d.remaining_quantity > 0)
    .reduce((acc: any[], d) => {
      if (!acc.find(a => a.material_number === d.material_number)) {
        acc.push({
          material_number: d.material_number,
          material_name: d.material_name,
          unit: d.unit,
          remaining_quantity: d.remaining_quantity,
          default_warehouse: d.default_warehouse
        })
      }
      return acc
    }, [])
})

const fifoCurrentAllocations = computed(() => {
  if (!fifoActiveItem.value || !fifoData.value[fifoActiveItem.value]) return []
  return fifoData.value[fifoActiveItem.value].allocations || []
})

const fifoCurrentInfo = computed(() => {
  if (!fifoActiveItem.value || !fifoData.value[fifoActiveItem.value]) return null
  return fifoData.value[fifoActiveItem.value]
})

const fifoTotalAllocated = computed(() => {
  if (!fifoActiveItem.value) return 0
  return fifoCurrentAllocations.value.filter((a: any) => a.selected).reduce((s: number, a: any) => s + (a.allocated_qty || 0), 0)
})

const fillRemaining = async () => {
  const materials = fifoMaterials.value
  if (materials.length === 0) {
    message.warning('没有未领料的物料')
    return
  }

  fifoLoading.value = true
  fifoVisible.value = true
  resetFifoDrag()
  try {
    const items = materials.map(m => ({
      item_number: m.material_number,
      warehouse_number: m.default_warehouse || '',
      required_quantity: m.remaining_quantity
    }))
    const res: any = await getMaterialBatchOptionsBulk({ items })
    fifoData.value = res?.data || {}
    // 默认选中第一个物料
    const firstKey = Object.keys(fifoData.value)[0]
    fifoActiveItem.value = firstKey || ''
  } catch (err: any) {
    message.error(err?.response?.data?.message || '获取批次库存失败')
  } finally {
    fifoLoading.value = false
  }
}

// 切换物料行
const fifoSelectMaterial = (mat: any) => {
  fifoActiveItem.value = mat.material_number
}

// 切换仓库
const fifoChangeWarehouse = async (itemNumber: string, warehouseNumber: string) => {
  try {
    const mat = fifoMaterials.value.find((m: any) => m.material_number === itemNumber)
    const res: any = await getMaterialBatchOptions({ item_number: itemNumber, warehouse_number: warehouseNumber })
    const batches = res?.data || []
    let remaining = mat?.remaining_quantity || 0
    const allocations = batches.map((b: any) => {
      const batchQty = parseFloat(b.quantity)
      let allocated = 0
      if (remaining > 0 && batchQty > 0) {
        allocated = Math.min(remaining, batchQty)
        remaining -= allocated
      }
      return {
        batch_number: b.batch_number,
        quantity: batchQty,
        available: batchQty,
        inbound_date: b.inbound_date,
        supplier_number: b.supplier_number || '',
        supplier_name: b.supplier_name || '',
        production_order_number: b.production_order_number || '',
        selected: allocated > 0,
        allocated_qty: allocated
      }
    })
    const info = fifoData.value[itemNumber]
    if (info) {
      const wh = info.warehouses?.find((w: any) => w.warehouse_number === warehouseNumber)
      info.warehouse_number = warehouseNumber
      info.warehouse_name = wh?.warehouse_name || ''
      info.available_qty = batches.reduce((s: number, b: any) => s + parseFloat(b.quantity), 0)
      info.allocations = allocations
    }
  } catch {
    message.error('查询批次库存失败')
  }
}

// 勾选/取消批次
const fifoToggleBatch = (alloc: any) => {
  alloc.selected = !alloc.selected
  if (alloc.selected && alloc.allocated_qty === 0) {
    const totalAllocated = fifoCurrentAllocations.value.filter((a: any) => a !== alloc && a.selected).reduce((s: number, a: any) => s + (a.allocated_qty || 0), 0)
    const mat = fifoMaterials.value.find((m: any) => m.material_number === fifoActiveItem.value)
    const maxNeed = (mat?.remaining_quantity || 0) - totalAllocated
    alloc.allocated_qty = Math.min(alloc.available, Math.max(0, maxNeed))
  }
  if (!alloc.selected) {
    alloc.allocated_qty = 0
  }
}

// 修改分配数量
const fifoChangeAllocatedQty = (alloc: any, value: number | null) => {
  const v = value || 0
  if (v > alloc.available) {
    message.warning(`分配数量不能超过可用量 ${alloc.available}`)
    alloc.allocated_qty = alloc.available
    return
  }
  alloc.allocated_qty = v
  if (v > 0 && !alloc.selected) alloc.selected = true
  if (v === 0) alloc.selected = false
}

// 确认FIFO选择
const fifoConfirm = () => {
  // 清除原有的 is_added 行和填充值
  issueInputList.value = issueInputList.value.filter(d => !d.is_added)
  for (const d of issueInputList.value) {
    d.input_actual_quantity = null
    d.input_batch_number = ''
  }

  let filledCount = 0
  for (const [itemNumber, info] of Object.entries(fifoData.value)) {
    const selectedAllocs = (info.allocations || []).filter((a: any) => a.selected && a.allocated_qty > 0)
    if (selectedAllocs.length === 0) continue

    // 找到该物料在 issueInputList 中的原始行
    const originalRows = issueInputList.value.filter(d => d.material_number === itemNumber && !d.is_added)
    if (originalRows.length === 0) continue

    const originalRow = originalRows[0]!
    // 第一个分配写入原始行
    originalRow.input_actual_quantity = selectedAllocs[0].allocated_qty
    originalRow.input_batch_number = selectedAllocs[0].batch_number
    filledCount++

    // 后续分配用 addBatchRow 添加
    for (let i = 1; i < selectedAllocs.length; i++) {
      const idx = issueInputList.value.findIndex(d => d._uid === originalRow?._uid)
      if (idx < 0) continue
      let insertIdx = idx
      for (let j = idx + 1; j < issueInputList.value.length; j++) {
        if (issueInputList.value[j]?.id === originalRow?.id) insertIdx = j
        else break
      }
      const maxLineNo = issueInputList.value.filter(d => d.id === originalRow?.id).reduce((max, d) => Math.max(max, d.line_number), 0)
      const newRow: DetailItem = {
        ...originalRow,
        _uid: ++uidSeq,
        is_added: true,
        line_number: maxLineNo + 1,
        remaining_quantity: 0,
        input_actual_quantity: selectedAllocs[i].allocated_qty,
        input_batch_number: selectedAllocs[i].batch_number
      } as DetailItem
      issueInputList.value.splice(insertIdx + 1, 0, newRow)
      filledCount++
    }
  }

  fifoVisible.value = false
  message.success(`已填充 ${filledCount} 项领料数量`)
}

const handleSave = async () => {
  const validItems = issueInputList.value.filter(d => (d.input_actual_quantity || 0) > 0)
  if (validItems.length === 0) {
    message.warning('至少需要一行实际备料数量大于0')
    return
  }

  saving.value = true
  try {
    const payload = {
      preparation_number: preparationHeader.value.preparation_number,
      production_order_number: orderInfo.value.production_order_number,
      remark: issueRemark.value,
      items: validItems.map(d => ({
        preparation_detail_id: d.id,
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        required_quantity: d.required_quantity,
        actual_quantity: d.input_actual_quantity,
        batch_number: d.input_batch_number,
        step_number: d.step_number,
        work_center_name: d.work_center_name,
        is_key_material: d.is_key_material,
        default_warehouse: d.default_warehouse
      }))
    }

    const res: any = await createMaterialIssue(payload)
    message.success(`领料保存成功，领料单号: ${res?.data?.issue_number || ''}`)
    issueModalVisible.value = false

    // 刷新数据
    await handleSearch(orderInput.value)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '保存失败')
  } finally { saving.value = false }
}

const handleDeleteIssue = async (issue: any) => {
  deletingIssue.value = issue.issue_number
  try {
    await deleteMaterialIssue(issue.issue_number)
    message.success(`领料单 ${issue.issue_number} 已撤回，库存与状态已回退`)
    await handleSearch(orderInput.value)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '撤回失败')
  } finally { deletingIssue.value = null }
}

onMounted(() => {
  nextTick(() => { scanInputRef.value?.focus?.() })
})
</script>

<style scoped>
.material-issue-bp-page {
  padding: 0 0 20px 0;
}
.top-card { margin-bottom: 6px; }
.top-card :deep(.ant-card-body) { padding: 8px 12px; }
.prep-card { margin-bottom: 6px; }
.prep-card :deep(.ant-card-body) { padding: 8px 12px; }
.history-card { margin-bottom: 6px; }
.history-card :deep(.ant-card-body) { padding: 8px 12px; }
.info-item { font-size: 13px; color: #333; }
:deep(.candidate-row) { cursor: pointer; }
:deep(.candidate-row:hover td) { background: #e6f7ff !important; }
:deep(.ant-collapse-header) { align-items: center !important; }

/* FIFO批次选择样式 */
.fifo-mat-row {
  padding: 8px 10px;
  margin-bottom: 4px;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
.fifo-mat-row:hover {
  border-color: #1890ff;
  background: #f0f8ff;
}
.fifo-mat-active {
  border-color: #1890ff;
  background: #e6f7ff;
  box-shadow: 0 0 0 1px #1890ff;
}
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
