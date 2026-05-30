<template>
  <div class="material-issue-page">
    <a-page-header title="按生产单备料清单备料" style="padding: 0; margin: 0;" />

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
            <a-tag v-if="orderInfo.plan_status" :color="orderInfo.plan_status === '已派发' ? 'green' : 'blue'" size="small" style="margin-left:4px;">{{ orderInfo.plan_status }}</a-tag>
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
          <a-space>
            <span v-if="previousIssues.length > 0" class="info-item" style="color:#888;">已领料 {{ previousIssues.length }} 次</span>
            <a-dropdown>
              <template #overlay>
                <a-menu @click="({ key }: any) => { currentSourceType = key; openIssueModal() }">
                  <a-menu-item key="领料">开始备料</a-menu-item>
                  <a-menu-item key="补料">补料</a-menu-item>
                </a-menu>
              </template>
              <a-button type="primary" size="small">
                开始备料 <DownOutlined />
              </a-button>
            </a-dropdown>
          </a-space>
        </a-col>
      </a-row>
    </a-card>

    <!-- 历史领料记录（展开明细行 + 批量退料） -->
    <a-card v-if="previousIssues.length > 0" :bordered="false" size="small" class="history-card">
      <template #title>
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span style="font-size:13px;">历史领料记录（{{ previousIssues.length }} 次）</span>
          <a-space :size="8">
            <a-checkbox :checked="allReturnSelected" :indeterminate="someReturnSelected && !allReturnSelected" @change="toggleAllReturn">全选</a-checkbox>
            <a-button
              type="primary"
              size="small"
              danger
              :loading="batchReturnSaving"
              :disabled="selectedReturnRows.size === 0"
              @click="handleBatchReturn"
            >
              <template #icon><RollbackOutlined /></template>
              批量退料 ({{ selectedReturnRows.size }} 项)
            </a-button>
          </a-space>
        </div>
      </template>

      <div v-for="issue in previousIssues" :key="issue.issue_number" style="margin-bottom:12px;">
        <!-- 领料单头 -->
        <div class="issue-header">
          <a-space :size="12">
            <a-tag :color="issue.source_type === '补料' ? 'orange' : 'blue'">{{ issue.source_type || '领料' }}</a-tag>
            <span class="info-item"><b>{{ issue.issue_number }}</b></span>
            <span class="info-item" style="color:#888;">{{ issue.total_issue_items }} 种物料</span>
            <a-tag v-if="issue.issue_status" :color="issue.issue_status === '已领料' ? 'green' : 'blue'" size="small">{{ issue.issue_status }}</a-tag>
            <span class="info-item" style="color:#888;">{{ issue.creation_man }} {{ issue.creation_date }}</span>
            <span v-if="issue.remark" class="info-item" style="color:#888;">{{ issue.remark }}</span>
          </a-space>
          <a-popconfirm
            title="确认要撤回此领料单吗？物料库存、备料单状态、生产单状态将同步回退。"
            ok-text="确认撤回"
            cancel-text="取消"
            ok-type="danger"
            @confirm="handleDeleteIssue(issue)"
          >
            <a-button type="link" size="small" danger :loading="deletingIssue === issue.issue_number">
              <template #icon><DeleteOutlined /></template>撤回
            </a-button>
          </a-popconfirm>
        </div>

        <!-- 明细行表格 -->
        <a-table
          :columns="historyDetailCols"
          :data-source="issue.details || []"
          :pagination="false"
          size="small"
          :row-key="(r: any) => `${issue.issue_number}-${r.id}`"
          :row-class-name="() => 'history-detail-row'"
          bordered
      >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'select'">
              <a-checkbox
                :checked="selectedReturnRows.has(`${issue.issue_number}-${record.id}`)"
                @change="toggleReturnRow(issue.issue_number, record)"
              />
            </template>
            <template v-if="column.key === 'max_return'">
              <span :style="{ color: record.max_return > 0 ? '#fa8c16' : '#ccc', fontWeight: 600 }">{{ record.max_return }}</span>
            </template>
            <template v-if="column.key === 'return_qty'">
              <a-input-number
                v-if="record.max_return > 0"
                :value="getReturnQty(issue.issue_number, record)"
                :min="0"
                :max="record.max_return"
                size="small"
                style="width:90px;"
                @change="(v: number | null) => setReturnQty(issue.issue_number, record, v)"
              />
              <span v-else style="color:#ccc;">-</span>
            </template>
          </template>
        </a-table>
      </div>
    </a-card>

    <!-- 无数据提示 -->
    <a-card v-if="orderInfo && !preparationHeader && !loading" :bordered="false" size="small" style="margin-top:8px;text-align:center;">
      <a-alert message="该生产单尚未生成备料单，请先派发生产单" type="warning" show-icon />
    </a-card>

    <!-- 候选生产单选择弹窗 -->
    <a-modal
      v-model:open="candidateVisible"
      :width="900"
      :footer="null"
      destroy-on-close
      :style="candidateModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onCandidateDragStart">
          <span>请选择生产单</span>
          <a-button type="text" size="small" @click="openCandidateSetting" style="margin-left:8px;">
            <SettingOutlined />
          </a-button>
        </div>
      </template>
      <a-table
        :columns="candidateCols"
        :data-source="candidateList"
        :pagination="false"
        :scroll="{ y: 400 }"
        size="small"
        row-key="production_order_number"
        :row-class-name="() => 'candidate-row'"
        :custom-row="(record: any) => ({ onClick: () => selectCandidate(record) })"
        @resizeColumn="handleCandidateResize"
      />
    </a-modal>

    <!-- 备料弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :width="1300"
      :footer="null"
      :mask-closable="false"
      destroy-on-close
      :style="issueModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onIssueDragStart">
          <span>{{ currentSourceType === '补料' ? '补料' : '按生产单备料清单备料' }} - {{ preparationHeader?.preparation_number || '' }}</span>
          <a-button type="text" size="small" @click="openDetailSetting" style="margin-left:8px;">
            <SettingOutlined />
          </a-button>
        </div>
      </template>
      <!-- 头信息 -->
      <a-descriptions :column="4" bordered size="small" style="margin-bottom:12px;">
        <a-descriptions-item label="生产单编号">{{ orderInfo?.production_order_number }}</a-descriptions-item>
        <a-descriptions-item label="产品编号">{{ orderInfo?.item_number }}</a-descriptions-item>
        <a-descriptions-item label="产品名称">{{ orderInfo?.item_name }}</a-descriptions-item>
        <a-descriptions-item label="规格">{{ orderInfo?.specifications }}</a-descriptions-item>
        <a-descriptions-item label="计划数量">{{ orderInfo?.planned_quantity }} {{ orderInfo?.basic_unit }}</a-descriptions-item>
        <a-descriptions-item label="模具编号">{{ orderInfo?.mould_number || '-' }}</a-descriptions-item>
        <a-descriptions-item label="实际模腔">{{ orderInfo?.actual_cavity_count || '-' }}</a-descriptions-item>
        <a-descriptions-item label="实际模次">{{ orderInfo?.actual_hole_count || '-' }}</a-descriptions-item>
        <a-descriptions-item label="实际班产">{{ orderInfo?.actual_daily_output || '-' }}</a-descriptions-item>
        <a-descriptions-item label="成型件规格">{{ orderInfo?.formed_part_specifications || '-' }}</a-descriptions-item>
        <a-descriptions-item label="成型件单耗">{{ orderInfo?.formed_part_unit_consumption || '-' }}</a-descriptions-item>
        <a-descriptions-item label="BOM编号">{{ preparationHeader?.bom_number }}</a-descriptions-item>
        <a-descriptions-item label="BOM版本">{{ preparationHeader?.bom_version }}</a-descriptions-item>
        <a-descriptions-item label="备料状态">
          <a-tag :color="prepStatusColor">{{ preparationHeader?.preparation_status }}</a-tag>
        </a-descriptions-item>
      </a-descriptions>

      <!-- 备料明细表格 -->
      <a-table
        :columns="detailCols"
        :data-source="detailList"
        :pagination="false"
        :scroll="{ y: 400 }"
        size="small"
        row-key="_uid"
        bordered
        @resizeColumn="handleDetailResize"
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
          <a-button size="small" @click="modalVisible = false">取消</a-button>
          <a-button type="primary" size="small" :loading="saving" :disabled="totalInputActual <= 0" @click="handleSave">
            保存领料 ({{ filledCount }} 项)
          </a-button>
        </a-space>
      </div>
    </a-modal>

    <!-- 候选表格列设置抽屉 -->
    <ColumnSettingDrawer
      :open="candidateSettingVisible"
      :setting-list="candidateSettingList"
      :saving="candidateSettingSaving"
      @update:open="candidateSettingVisible = $event"
      @moveUp="moveCandidateUp"
      @moveDown="moveCandidateDown"
      @save="saveCandidateSetting"
      @reset="resetCandidateSetting"
    />

    <!-- 明细表格列设置抽屉 -->
    <ColumnSettingDrawer
      :open="detailSettingVisible"
      :setting-list="detailSettingList"
      :saving="detailSettingSaving"
      @update:open="detailSettingVisible = $event"
      @moveUp="moveDetailUp"
      @moveDown="moveDetailDown"
      @save="saveDetailSetting"
      @reset="resetDetailSetting"
    />

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
                  <template v-if="column.key === 'available'">
                    <span style="font-weight:600;">{{ record.available }}</span>
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
                  已选批次: {{ fifoCurrentAllocations.filter((a: any) => a.selected).length }} /
                  {{ fifoCurrentAllocations.length }}
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
import { ReloadOutlined, PlusOutlined, DeleteOutlined, SettingOutlined, ExclamationCircleOutlined, DownOutlined, RollbackOutlined } from '@ant-design/icons-vue'
import { queryByOrder, createMaterialIssue, deleteMaterialIssue } from '@/api/production/materialIssue'
import { createMaterialReturn } from '@/api/production/materialReturn'
import { getMaterialBatchOptionsBulk, getMaterialBatchOptions } from '@/api/warehouse/materialWarehouse'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useModalDrag } from '@/composables/useModalDrag'

interface DetailWithInput {
  _uid: number
  is_added?: boolean
  _fifo_added?: boolean
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
  is_key_material: number
  default_warehouse: string
  bom_path: string
  remark: string
  input_actual_quantity: number | null
  input_batch_number: string
}

// 弹窗拖拽
const { modalStyle: issueModalStyle, onDragStart: onIssueDragStart, resetDrag: resetIssueDrag } = useModalDrag()
const { modalStyle: fifoModalStyle, onDragStart: onFifoDragStart, resetDrag: resetFifoDrag } = useModalDrag()
const { modalStyle: candidateModalStyle, onDragStart: onCandidateDragStart, resetDrag: resetCandidateDrag } = useModalDrag()

let uidSeq = 0

const scanInputRef = ref<any>(null)
const orderInput = ref('')
const loading = ref(false)
const saving = ref(false)
const deletingIssue = ref<string | null>(null)
const currentSourceType = ref<string>('领料')
const returnModalVisible = ref(false)  // 保留兼容（旧弹窗已移除）
const returnIssueRecord = ref<any>(null)  // 保留兼容
const returnDetailList = ref<any[]>([])  // 保留兼容
const savingReturn = ref(false)  // 保留兼容
// 批量退料状态
const selectedReturnRows = ref<Set<string>>(new Set())
const returnQtyMap = ref<Record<string, number>>({})
const batchReturnSaving = ref(false)
const modalVisible = ref(false)
const issueRemark = ref('')
const candidateVisible = ref(false)
const candidateList = ref<any[]>([])

const defaultCandidateColumns: any[] = [
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90, resizable: true },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status', width: 80, resizable: true },
]

const {
  columns: candidateCols, columnSettingVisible: candidateSettingVisible,
  columnSettingList: candidateSettingList, columnSettingSaving: candidateSettingSaving,
  openColumnSetting: openCandidateSetting, moveColumnUp: moveCandidateUp,
  moveColumnDown: moveCandidateDown, saveColumnSetting: saveCandidateSetting,
  resetColumnSetting: resetCandidateSetting,
  loadColumnPreference: loadCandidatePref, handleResizeColumn: handleCandidateResize
} = useColumnPreference('material_issue_candidates', defaultCandidateColumns, {
  fixedLeft: [], fixedRight: []
})

const orderInfo = ref<any>(null)
const preparationHeader = ref<any>(null)
const detailList = ref<DetailWithInput[]>([])
const previousIssues = ref<any[]>([])

const prepStatusColor = computed(() => {
  const s = preparationHeader.value?.preparation_status
  if (s === '已领料') return 'green'
  if (s === '部分领料') return 'orange'
  return 'blue'
})

const historyDetailCols = [
  { title: '', key: 'select', width: 40 },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 140 },
  { title: '类型', dataIndex: 'material_type', key: 'material_type', width: 70 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 50 },
  { title: '实领数量', dataIndex: 'actual_quantity', key: 'actual_quantity', width: 90 },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 130 },
  { title: '可退数量', key: 'max_return', width: 90 },
  { title: '退料数量', key: 'return_qty', width: 110 },
  { title: '工序', dataIndex: 'step_number', key: 'step_number', width: 60 },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 110 },
]

const defaultDetailColumns: any[] = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60, resizable: true },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 140, resizable: true },
  { title: '类型', dataIndex: 'material_type', key: 'material_type', width: 80, resizable: true },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60, resizable: true },
  { title: '需求数量', dataIndex: 'required_quantity', key: 'required_quantity', width: 90, resizable: true },
  { title: '已领量', dataIndex: 'issued_quantity', key: 'issued_quantity', width: 80, resizable: true },
  { title: '未领量', key: 'remaining', width: 80, resizable: true },
  { title: '实际备料数量', key: 'input_actual_quantity', width: 120, resizable: true },
  { title: '批次号', key: 'input_batch_number', width: 150, resizable: true },
  { title: '工序', dataIndex: 'step_number', key: 'step_number', width: 60, resizable: true },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 110, resizable: true },
  { title: '关键', key: 'is_key_material', width: 60, resizable: true }
]

const {
  columns: detailCols, columnSettingVisible: detailSettingVisible,
  columnSettingList: detailSettingList, columnSettingSaving: detailSettingSaving,
  openColumnSetting: openDetailSetting, moveColumnUp: moveDetailUp,
  moveColumnDown: moveDetailDown, saveColumnSetting: saveDetailSetting,
  resetColumnSetting: resetDetailSetting,
  loadColumnPreference: loadDetailPref, handleResizeColumn: handleDetailResize
} = useColumnPreference('material_issue_details', defaultDetailColumns, {
  fixedLeft: [],
  fixedRight: [{ title: '操作', key: 'action', width: 70, fixed: 'right' as const }]
})

const totalInputActual = computed(() => detailList.value.reduce((s, d) => s + (d.input_actual_quantity || 0), 0))
const filledCount = computed(() => detailList.value.filter(d => (d.input_actual_quantity || 0) > 0).length)

// ==================== 批量退料逻辑 ====================
// 所有可退明细行的 key 列表
const allReturnableKeys = computed(() => {
  const keys: string[] = []
  for (const issue of previousIssues.value) {
    for (const d of (issue.details || [])) {
      if ((d.max_return || 0) > 0) keys.push(`${issue.issue_number}-${d.id}`)
    }
  }
  return keys
})
const allReturnSelected = computed(() => allReturnableKeys.value.length > 0 && selectedReturnRows.value.size >= allReturnableKeys.value.length)
const someReturnSelected = computed(() => selectedReturnRows.value.size > 0)

const toggleAllReturn = () => {
  if (allReturnSelected.value) {
    selectedReturnRows.value = new Set()
  } else {
    selectedReturnRows.value = new Set(allReturnableKeys.value)
    // 初始化退料数量 = 可退数量
    for (const issue of previousIssues.value) {
      for (const d of (issue.details || [])) {
        if ((d.max_return || 0) > 0) {
          returnQtyMap.value[`${issue.issue_number}-${d.id}`] = d.max_return
        }
      }
    }
  }
}

const toggleReturnRow = (issueNumber: string, record: any) => {
  const key = `${issueNumber}-${record.id}`
  const newSet = new Set(selectedReturnRows.value)
  if (newSet.has(key)) {
    newSet.delete(key)
  } else {
    newSet.add(key)
    // 默认退料数量 = 可退数量
    if (!returnQtyMap.value[key] && record.max_return > 0) {
      returnQtyMap.value[key] = record.max_return
    }
  }
  selectedReturnRows.value = newSet
}

const getReturnQty = (issueNumber: string, record: any): number => {
  const key = `${issueNumber}-${record.id}`
  return returnQtyMap.value[key] ?? record.max_return ?? 0
}

const setReturnQty = (issueNumber: string, record: any, value: number | null) => {
  const key = `${issueNumber}-${record.id}`
  returnQtyMap.value[key] = value || 0
  // 有数量时自动选中
  if ((value || 0) > 0) {
    const newSet = new Set(selectedReturnRows.value)
    newSet.add(key)
    selectedReturnRows.value = newSet
  }
}

const handleBatchReturn = async () => {
  if (selectedReturnRows.value.size === 0) return

  // 按 issue_number 分组
  const groups: Record<string, any[]> = {}
  for (const key of selectedReturnRows.value) {
    // key 格式: issue_number-detail_id
    const lastDashIdx = key.lastIndexOf('-')
    const detailIdStr = key.substring(lastDashIdx + 1)
    const actualIssueNumber = key.substring(0, lastDashIdx)

    // 找到对应的明细行
    let detail: any = null
    const issue = previousIssues.value.find((i: any) => i.issue_number === actualIssueNumber)
    if (issue) {
      detail = (issue.details || []).find((d: any) => String(d.id) === detailIdStr)
    }
    if (!detail) continue

    const returnQty = returnQtyMap.value[key] ?? detail.max_return ?? 0
    if (returnQty <= 0) continue

    if (!groups[actualIssueNumber]) groups[actualIssueNumber] = []
    groups[actualIssueNumber].push({
      ...detail,
      return_quantity: returnQty,
    })
  }

  const issueNumbers = Object.keys(groups)
  if (issueNumbers.length === 0) {
    message.warning('无有效退料项')
    return
  }

  batchReturnSaving.value = true
  let successCount = 0
  let failCount = 0
  const returnNumbers: string[] = []
  try {
    for (const issueNumber of issueNumbers) {
      const items = groups[issueNumber] || []
      if (items.length === 0) continue
      try {
        const payload = {
          issue_number: issueNumber,
          items: items.map((d: any) => ({
            material_number: d.material_number,
            material_name: d.material_name || '',
            material_type: d.material_type || '',
            unit: d.unit || '',
            return_quantity: d.return_quantity,
            batch_number: d.batch_number || '',
            step_number: d.step_number,
            work_center_name: d.work_center_name || '',
            default_warehouse: d.default_warehouse || '',
          })),
        }
        const res: any = await createMaterialReturn(payload)
        returnNumbers.push(res?.data?.return_number || issueNumber)
        successCount++
      } catch (err: any) {
        failCount++
        console.error(`退料单 ${issueNumber} 失败:`, err?.response?.data?.message || err?.message)
      }
    }

    if (successCount > 0) {
      message.success(`批量退料成功 ${successCount} 单${returnNumbers.length > 0 ? ': ' + returnNumbers.join(', ') : ''}${failCount > 0 ? `，失败 ${failCount} 单` : ''}`)
    } else {
      message.error('批量退料全部失败')
    }

    // 清除选中
    selectedReturnRows.value = new Set()
    returnQtyMap.value = {}

    // 刷新数据
    await handleSearch(orderInput.value)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '批量退料异常')
  } finally {
    batchReturnSaving.value = false
  }
}

const handleSearch = async (value: string) => {
  const keyword = (value || orderInput.value || '').trim()
  if (!keyword) { message.warning('请输入生产单编号'); return }
  loading.value = true
  try {
    const res: any = await queryByOrder(keyword)
    const data = res?.data
    if (!data) { message.error('查询失败'); return }

    // 多条匹配 → 弹出候选列表
    if (data.matchType === 'multiple') {
      candidateList.value = data.candidates || []
      candidateVisible.value = true
      resetCandidateDrag()
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
    detailList.value = []
    message.warning('该生产单尚未生成备料单，请先派发生产单')
    return
  }

  preparationHeader.value = data.preparation
  detailList.value = (data.details || []).map((d: any) => {
    const required = parseFloat(d.required_quantity) || 0
    const issued = parseFloat(d.issued_quantity) || 0
    return {
      ...d,
      _uid: ++uidSeq,
      remaining_quantity: Math.max(Math.round((required - issued) * 10000) / 10000, 0),
      input_actual_quantity: null,
      input_batch_number: ''
    }
  })

  // 判断是否所有物料已领完（已领量 >= 需求量）
  const allIssued = detailList.value.every(d => d.remaining_quantity <= 0)
  if (allIssued) {
    // 已全部领完，不弹备料窗口，直接显示历史领料记录
    modalVisible.value = false
  } else {
    // 有未领物料，自动弹出备料窗口
    modalVisible.value = true
    resetIssueDrag()
    issueRemark.value = ''
  }
}

const selectCandidate = async (record: any) => {
  candidateVisible.value = false
  orderInput.value = record.production_order_number
  loading.value = true
  try {
    const res: any = await queryByOrder(record.production_order_number)
    const data = res?.data
    if (!data) { message.error('查询失败'); return }
    // 精确匹配单条时直接加载
    if (data.matchType === 'multiple') {
      // 从候选中找到精确匹配的那条，直接用它查备料
      const exact = (data.candidates || []).find((c: any) => c.production_order_number === record.production_order_number)
      if (exact) {
        // 用精确编号再查一次（不应再多匹配）
        message.info('请使用完整的生产单编号查询')
        return
      }
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
  detailList.value = []
  previousIssues.value = []
  modalVisible.value = false
  candidateVisible.value = false
  candidateList.value = []
  nextTick(() => { scanInputRef.value?.focus?.() })
}

const addBatchRow = (index: number) => {
  const source = detailList.value[index]
  if (!source) return
  // 找同一物料（同 id）所有行中的最大行号，+1 作为新行号
  const maxLineNo = detailList.value
    .filter(d => d.id === source.id)
    .reduce((max, d) => Math.max(max, d.line_number), 0)
  const newRow: DetailWithInput = {
    ...source,
    _uid: ++uidSeq,
    is_added: true,
    line_number: maxLineNo + 1,
    remaining_quantity: currentSourceType.value === '补料' ? (source?.required_quantity || 0) : 0,
    input_actual_quantity: null,
    input_batch_number: ''
  }
  detailList.value.splice(index + 1, 0, newRow)
}

const removeBatchRow = (index: number) => {
  detailList.value.splice(index, 1)
}

// ==================== FIFO批次选择 ====================
const fifoVisible = ref(false)
const fifoLoading = ref(false)
const fifoData = ref<Record<string, any>>({})
const fifoActiveItem = ref('')
const fifoMaterials = computed(() => {
  const isBuLiao = currentSourceType.value === '补料'
  return detailList.value
    .filter(d => {
      // 领料/退料模式：仅包含未领量>0的原始行
      if (!isBuLiao) return !d.is_added && d.remaining_quantity > 0
      // 补料模式：包含所有行（原始行 + is_added行），用 required_quantity 作为需求量
      return true
    })
    .reduce((acc: any[], d) => {
      if (!acc.find(a => a.material_number === d.material_number)) {
        const needQty = isBuLiao ? d.remaining_quantity : (d.remaining_quantity > 0 ? d.remaining_quantity : d.required_quantity)
        acc.push({ material_number: d.material_number, material_name: d.material_name, unit: d.unit, remaining_quantity: needQty, default_warehouse: d.default_warehouse, required_quantity: d.required_quantity, is_buliao: isBuLiao })
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
    // 勾选时默认分配全部可用量（但不超总需求）
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
  const isBuLiao = currentSourceType.value === '补料'

  // 领料/退料模式：清除原有的 is_added 行和填充值
  if (!isBuLiao) {
    detailList.value = detailList.value.filter(d => !d.is_added)
    for (const d of detailList.value) {
      d.input_actual_quantity = null
      d.input_batch_number = ''
    }
  } else {
    // 补料模式：仅清除原始行（非is_added）的填充值，保留用户手动添加的行
    for (const d of detailList.value) {
      if (!d.is_added) {
        d.input_actual_quantity = null
        d.input_batch_number = ''
      }
    }
    // 同时清除之前FIFO自动写入的 is_added 行（标记了 _fifo_added 的）
    detailList.value = detailList.value.filter(d => !d._fifo_added)
  }

  let filledCount = 0
  for (const [itemNumber, info] of Object.entries(fifoData.value)) {
    const selectedAllocs = (info.allocations || []).filter((a: any) => a.selected && a.allocated_qty > 0)
    if (selectedAllocs.length === 0) continue

    // 找到该物料在 detailList 中的原始行
    const originalRows = detailList.value.filter(d => d.material_number === itemNumber && !d.is_added)
    if (originalRows.length === 0) continue

    const originalRow = originalRows[0]!
    // 第一个分配写入原始行
    originalRow.input_actual_quantity = selectedAllocs[0].allocated_qty
    originalRow.input_batch_number = selectedAllocs[0].batch_number
    filledCount++

    // 后续分配用 addBatchRow 添加
    for (let i = 1; i < selectedAllocs.length; i++) {
      const idx = detailList.value.findIndex(d => d._uid === originalRow?._uid)
      if (idx < 0) continue
      // 在原始行之后找到最后一个同物料行
      let insertIdx = idx
      for (let j = idx + 1; j < detailList.value.length; j++) {
        if (detailList.value[j]?.id === originalRow?.id) insertIdx = j
        else break
      }
      const maxLineNo = detailList.value.filter(d => d.id === originalRow?.id).reduce((max, d) => Math.max(max, d.line_number), 0)
      const newRow: DetailWithInput = {
        ...originalRow,
        _uid: ++uidSeq,
        is_added: true,
        _fifo_added: true,
        line_number: maxLineNo + 1,
        remaining_quantity: 0,
        input_actual_quantity: selectedAllocs[i].allocated_qty,
        input_batch_number: selectedAllocs[i].batch_number
      }
      detailList.value.splice(insertIdx + 1, 0, newRow)
      filledCount++
    }
  }

  fifoVisible.value = false
  message.success(`已填充 ${filledCount} 项领料数量`)
}

const openIssueModal = () => {
  // 移除所有新增的批次行，恢复原始行
  detailList.value = detailList.value.filter(d => !d.is_added)
  for (const d of detailList.value) {
    d.input_actual_quantity = null
    d.input_batch_number = ''
  }
  issueRemark.value = ''
  modalVisible.value = true
  resetIssueDrag()
}

const handleSave = async () => {
  const validItems = detailList.value.filter(d => (d.input_actual_quantity || 0) > 0)
  if (validItems.length === 0) {
    message.warning('至少需要一行实际备料数量大于0')
    return
  }

  saving.value = true
  try {
    const payload = {
      preparation_number: preparationHeader.value.preparation_number,
      production_order_number: orderInfo.value.production_order_number,
      source_type: currentSourceType.value,
      remark: issueRemark.value || (currentSourceType.value === '补料' ? '补料' : ''),
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
    message.success(`${currentSourceType.value}保存成功，领料单号: ${res?.data?.issue_number || ''}`)

    // 刷新数据（loadOrderData 会自动打开弹窗）
    await handleSearch(orderInput.value)

    // 判断是否所有物料已领完：刷新后 detailList 已更新
    const allIssued = detailList.value
      .filter(d => !d.is_added)
      .every(d => d.remaining_quantity <= 0)
    if (allIssued) {
      modalVisible.value = false
    }
    // 否则 loadOrderData 已经自动打开弹窗，用户可继续操作
  } catch (err: any) {
    message.error(err?.response?.data?.message || '保存失败')
  } finally { saving.value = false }
}

const handleDeleteIssue = async (issue: any) => {
  deletingIssue.value = issue.issue_number
  try {
    await deleteMaterialIssue(issue.issue_number)
    message.success(`领料单 ${issue.issue_number} 已撤回，库存与状态已回退`)
    // 刷新数据
    await handleSearch(orderInput.value)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '撤回失败')
  } finally { deletingIssue.value = null }
}

onMounted(async () => {
  await Promise.all([loadCandidatePref(), loadDetailPref()])
  nextTick(() => { scanInputRef.value?.focus?.() })
})
</script>

<style scoped>
.material-issue-page {
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
.fifo-mat-row {
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 4px;
  transition: background 0.2s;
}
.fifo-mat-row:hover { background: #f0f5ff; }
.fifo-mat-active { background: #e6f7ff; border-left: 3px solid #1890ff; }
.drag-handle { cursor: move; user-select: none; display: flex; align-items: center; }
.issue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-bottom: none;
  margin-bottom: 0;
}
:deep(.history-detail-row) td { padding: 4px 8px !important; font-size: 12px; }
</style>
