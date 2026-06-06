<script setup lang="ts">
import { ref, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, DownloadOutlined, DownOutlined, ExclamationCircleOutlined, DeleteOutlined, SettingOutlined, CalculatorOutlined, SwapOutlined } from '@ant-design/icons-vue'
import { getPieceRateWages, getPieceRateWageDetail, getPieceRateWageSummary, createPieceRateWage, updatePieceRateWage, deletePieceRateWage, calculatePieceRateWage, exportPieceRateWages, exportPieceRateWagesSelected } from '@/api/production/pieceRateWage'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import dayjs from 'dayjs'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'

// ==================== 数据 ====================
const dataList = ref<any[]>([])
const filterApproval = ref('')
const filterPeriodType = ref('')
const modalVisible = ref(false)
const modalTitle = ref('新建计件工资表')
const isView = ref(false)
const formData = ref<any>({})
const detailRows = ref<any[]>([])
const summaryRows = ref<any[]>([])
const activeTab = ref('detail')
const calculating = ref(false)
const selectedRowKeys = ref<string[]>([])
const exportLoading = ref(false)
const { modalStyle, onDragStart, resetDrag } = useModalDrag()

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))

// ==================== 列定义 ====================
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getPieceRateWages)

const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '工资表编号', dataIndex: 'wage_number', key: 'wage_number', width: 180, resizable: true },
  { title: '名称', dataIndex: 'wage_name', key: 'wage_name', width: 160, resizable: true },
  { title: '周期类型', dataIndex: 'period_type', key: 'period_type', width: 90, resizable: true },
  { title: '周期开始', dataIndex: 'period_start', key: 'period_start', width: 110, resizable: true },
  { title: '周期结束', dataIndex: 'period_end', key: 'period_end', width: 110, resizable: true },
  { title: '合格品工资', dataIndex: 'total_qualified_wage', key: 'total_qualified_wage', width: 120, resizable: true, align: 'right' as const },
  { title: '次品工资', dataIndex: 'total_defective_wage', key: 'total_defective_wage', width: 110, resizable: true, align: 'right' as const },
  { title: '工资总额', dataIndex: 'total_wage', key: 'total_wage', width: 120, resizable: true, align: 'right' as const },
  { title: '明细行数', dataIndex: 'detail_count', key: 'detail_count', width: 90, resizable: true },
  { title: '计算状态', dataIndex: 'calculation_status', key: 'calculation_status', width: 90, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 90, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('piece_rate_wage_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '员工编号', dataIndex: 'employee_number', key: 'employee_number', width: 100 },
  { title: '员工名称', dataIndex: 'employee_name', key: 'employee_name', width: 90 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '工序编号', dataIndex: 'standard_process_number', key: 'standard_process_number', width: 100 },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 110 },
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 100 },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 100 },
  { title: '报工日期', dataIndex: 'report_date', key: 'report_date', width: 100 },
  { title: '合格数量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 90, align: 'right' as const },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 100, align: 'right' as const },
  { title: '合格品单价', dataIndex: 'qualified_piece_rate', key: 'qualified_piece_rate', width: 100, align: 'right' as const },
  { title: '次品单价', dataIndex: 'defective_piece_rate', key: 'defective_piece_rate', width: 90, align: 'right' as const },
  { title: '合格品工资', dataIndex: 'qualified_wage', key: 'qualified_wage', width: 100, align: 'right' as const },
  { title: '次品工资', dataIndex: 'defective_wage', key: 'defective_wage', width: 90, align: 'right' as const },
  { title: '行工资', dataIndex: 'line_wage', key: 'line_wage', width: 100, align: 'right' as const },
  { title: '报工单号', dataIndex: 'work_report_number', key: 'work_report_number', width: 150 },
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 150 },
  { title: '单价表编号', dataIndex: 'price_list_number', key: 'price_list_number', width: 150 }
]

const summaryColumns = [
  { title: '员工编号', dataIndex: 'employee_number', key: 'employee_number', width: 120 },
  { title: '员工名称', dataIndex: 'employee_name', key: 'employee_name', width: 120 },
  { title: '明细行数', dataIndex: 'line_count', key: 'line_count', width: 100, align: 'right' as const },
  { title: '合格品总数量', dataIndex: 'total_qualified_qty', key: 'total_qualified_qty', width: 130, align: 'right' as const },
  { title: '不合格总数量', dataIndex: 'total_unqualified_qty', key: 'total_unqualified_qty', width: 130, align: 'right' as const },
  { title: '合格品工资合计', dataIndex: 'total_qualified_wage', key: 'total_qualified_wage', width: 140, align: 'right' as const },
  { title: '次品工资合计', dataIndex: 'total_defective_wage', key: 'total_defective_wage', width: 120, align: 'right' as const },
  { title: '员工工资总额', dataIndex: 'total_employee_wage', key: 'total_employee_wage', width: 130, align: 'right' as const }
]

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getPieceRateWages({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterApproval.value,
      period_type: filterPeriodType.value
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

onMounted(() => { loadColumnPreference(); fetchList() })

// ==================== 刷新 ====================
const handleRefresh = () => { fetchList() }

// ==================== CRUD ====================
const openCreate = () => {
  modalTitle.value = '新建计件工资表'
  isView.value = false
  formData.value = { period_type: '月' }
  detailRows.value = []
  summaryRows.value = []
  activeTab.value = 'detail'
  modalVisible.value = true
  resetDrag()
}

const openView = async (record: any) => {
  modalTitle.value = '查看计件工资表'
  isView.value = true
  const res: any = await getPieceRateWageDetail(record.wage_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  // 同时加载员工汇总
  try {
    const sumRes: any = await getPieceRateWageSummary(record.wage_number)
    summaryRows.value = sumRes.data || []
  } catch { summaryRows.value = [] }
  activeTab.value = 'detail'
  modalVisible.value = true
  resetDrag()
}

const openEdit = async (record: any) => {
  modalTitle.value = '编辑计件工资表'
  isView.value = false
  const res: any = await getPieceRateWageDetail(record.wage_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  summaryRows.value = []
  activeTab.value = 'detail'
  modalVisible.value = true
  resetDrag()
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除计件工资表「${(record.wage_number || '').trim()}」吗？`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deletePieceRateWage(record.wage_number)
        if (res.success) { message.success('删除成功'); fetchList() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// ==================== 计算 ====================
const handleCalculate = async (record: any) => {
  if ((record.calculation_status || '').trim() !== '未计算' && (record.approval_status || '').trim() !== '草稿') {
    message.warning('只有草稿状态的工资表才能计算')
    return
  }
  Modal.confirm({
    title: '确认计算',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要计算工资表「${(record.wage_number || '').trim()}」吗？将根据周期内已审批报工数据匹配计件单价生成工资明细。`,
    okText: '确定计算', cancelText: '取消',
    async onOk() {
      try {
        calculating.value = true
        const res: any = await calculatePieceRateWage(record.wage_number)
        if (res.success) {
          message.success(res.message || '计算完成')
          fetchList()
        } else {
          message.error(res.message || '计算失败')
        }
      } catch { message.error('计算失败') }
      finally { calculating.value = false }
    }
  })
}

// 重新计算（弹窗内）
const handleRecalculate = async () => {
  if (!formData.value.wage_number) return
  Modal.confirm({
    title: '确认重新计算',
    icon: createVNode(ExclamationCircleOutlined),
    content: '重新计算将覆盖当前工资明细，确定继续？',
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        calculating.value = true
        const res: any = await calculatePieceRateWage(formData.value.wage_number)
        if (res.success) {
          message.success(res.message || '计算完成')
          // 刷新详情
          const detailRes: any = await getPieceRateWageDetail(formData.value.wage_number)
          formData.value = detailRes.data?.header || {}
          detailRows.value = detailRes.data?.details || []
          try {
            const sumRes: any = await getPieceRateWageSummary(formData.value.wage_number)
            summaryRows.value = sumRes.data || []
          } catch { summaryRows.value = [] }
        } else {
          message.error(res.message || '计算失败')
        }
      } catch { message.error('计算失败') }
      finally { calculating.value = false }
    }
  })
}

// ==================== 保存 ====================
const handleSave = async () => {
  if (!formData.value.wage_name) { message.warning('请填写名称'); return }
  if (!formData.value.period_type) { message.warning('请选择周期类型'); return }
  if (!formData.value.period_start) { message.warning('请选择周期开始日期'); return }
  if (!formData.value.period_end) { message.warning('请选择周期结束日期'); return }

  const payload = { ...formData.value }
  if (formData.value.wage_number) {
    await updatePieceRateWage(formData.value.wage_number, payload)
    message.success('更新成功')
  } else {
    await createPieceRateWage(payload)
    message.success('创建成功')
  }
  modalVisible.value = false
  fetchList()
}

// ==================== 审批 ====================
const handleSubmitApproval = async (record: any) => {
  try {
    await submitForApproval('piece_rate_wage_header', record.wage_number)
    message.success('提交审批成功'); fetchList()
  } catch { message.error('提交审批失败') }
}
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveRecord('piece_rate_wage_header', record.wage_number)
    if (res.success) { message.success('审核成功'); fetchList() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}
const handleWithdrawAction = async (record: any) => {
  Modal.confirm({
    title: '确认撤回', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤回计件工资表「${(record.wage_number || '').trim()}」的审批吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawApproval('piece_rate_wage_header', record.wage_number)
        if (res.success) { message.success('已撤回审批'); fetchList() }
        else { message.error(res.message || '撤回失败') }
      } catch { message.error('撤回失败') }
    }
  })
}
const handleReverse = async (record: any) => {
  Modal.confirm({
    title: '确认反审批', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要反审批计件工资表「${(record.wage_number || '').trim()}」吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try {
        const res: any = await reverseApproval('piece_rate_wage_header', record.wage_number)
        if (res.success) { message.success('反审批成功'); fetchList() }
        else { message.error(res.message || '反审批失败') }
      } catch { message.error('反审批失败') }
    }
  })
}

// ==================== 导出 ====================
const handleExport = async () => {
  const res: any = await exportPieceRateWages(searchText.value, filterApproval.value)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'piece_rate_wages.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const handleExportSelected = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要导出的行')
    return
  }
  exportLoading.value = true
  try {
    const res = await exportPieceRateWagesSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'piece_rate_wages_selected.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch {
    message.error('导出选中行失败')
  } finally {
    exportLoading.value = false
  }
}

// ==================== 数字格式化 ====================
const formatMoney = (val: any) => {
  const num = parseFloat(val) || 0
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>

<template>
  <div style="padding: 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">计件工资计算</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <a-input-search v-model:value="searchText" placeholder="搜索编号/名称" style="width:240px" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterApproval" placeholder="审批状态" style="width:120px" allow-clear @change="handleSearch">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-select v-model:value="filterPeriodType" placeholder="周期类型" style="width:100px" allow-clear @change="handleSearch">
          <a-select-option value="月">月</a-select-option>
          <a-select-option value="周">周</a-select-option>
        </a-select>
        <a-button @click="handleRefresh"><template #icon><ReloadOutlined /></template></a-button>
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
        <a-button :disabled="selectedRowKeys.length === 0" :loading="exportLoading" @click="handleExportSelected"><DownloadOutlined /> 导出选中{{ selectedRowKeys.length ? ` (${selectedRowKeys.length})` : '' }}</a-button>
        <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template></a-button>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handleTableChange" @resizeColumn="handleResizeColumn" row-key="wage_number" :row-selection="rowSelection" :scroll="{ x: 'max-content' }" size="small">
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'calculation_status'">
          <a-tag :color="(record.calculation_status || '').trim() === '已计算' ? 'green' : 'orange'">
            {{ record.calculation_status || '未计算' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'total_wage'">
          <span style="font-weight:600;color:#1890ff">{{ formatMoney(record.total_wage) }}</span>
        </template>
        <template v-else-if="column.key === 'total_qualified_wage'">
          {{ formatMoney(record.total_qualified_wage) }}
        </template>
        <template v-else-if="column.key === 'total_defective_wage'">
          {{ formatMoney(record.total_defective_wage) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="openView(record)">查看</a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>
                更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="(record.calculation_status || '').trim() === '未计算' && (record.approval_status || '').trim() === '草稿'" @click="handleCalculate(record)">
                    <CalculatorOutlined /> 计算
                  </a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleSubmitApproval(record)">提交</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleApprove(record)">审核</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleWithdrawAction(record)">撤回</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '已审批'" @click="handleReverse(record)">反审批</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="openEdit(record)">编辑</a-menu-item>
                  <a-menu-divider v-if="(record.approval_status || '').trim() === '草稿'" />
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f">删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>
    <div v-if="selectedRowKeys.length" style="margin-top:8px;color:#999;font-size:13px">
      已选择 <span style="color:#1890ff;font-weight:600">{{ selectedRowKeys.length }}</span> 条记录
      <a-button type="link" size="small" @click="selectedRowKeys = []">清空</a-button>
    </div>

    <!-- 编辑/查看弹窗 -->
    <a-modal v-model:open="modalVisible" width="1400px" :style="modalStyle" :footer="isView ? null : undefined" @ok="handleSave" :cancel-text="isView ? '关闭' : '取消'">
      <template #title>
        <div class="drag-handle" @mousedown="onDragStart">{{ modalTitle }}</div>
      </template>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="名称" required>
            <a-input v-model:value="formData.wage_name" :disabled="isView" placeholder="输入名称" />
          </a-form-item></a-col>
          <a-col :span="4"><a-form-item label="周期类型" required>
            <a-select v-model:value="formData.period_type" :disabled="isView" style="width:100%">
              <a-select-option value="月">月</a-select-option>
              <a-select-option value="周">周</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="5"><a-form-item label="周期开始日期" required>
            <a-date-picker v-model:value="formData.period_start" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" />
          </a-form-item></a-col>
          <a-col :span="5"><a-form-item label="周期结束日期" required>
            <a-date-picker v-model:value="formData.period_end" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" />
          </a-form-item></a-col>
          <a-col :span="4"><a-form-item label="备注">
            <a-input v-model:value="formData.remark" :disabled="isView" />
          </a-form-item></a-col>
        </a-row>
      </a-form>

      <!-- 汇总信息 -->
      <div v-if="formData.wage_number" style="display:flex;gap:24px;margin-bottom:12px;padding:8px 12px;background:#fafafa;border-radius:4px">
        <span>合格品工资合计: <b style="color:#52c41a">{{ formatMoney(formData.total_qualified_wage) }}</b></span>
        <span>次品工资合计: <b style="color:#faad14">{{ formatMoney(formData.total_defective_wage) }}</b></span>
        <span>工资总额: <b style="color:#1890ff;font-size:15px">{{ formatMoney(formData.total_wage) }}</b></span>
        <span>明细行数: {{ formData.detail_count || 0 }}</span>
        <span>计算状态: <a-tag :color="(formData.calculation_status || '').trim() === '已计算' ? 'green' : 'orange'">{{ formData.calculation_status || '未计算' }}</a-tag></span>
      </div>

      <!-- 操作按钮 -->
      <div v-if="formData.wage_number && (formData.approval_status || '').trim() === '草稿'" style="margin-bottom:8px">
        <a-button type="primary" :loading="calculating" @click="handleRecalculate">
          <template #icon><CalculatorOutlined /></template>
          {{ (formData.calculation_status || '').trim() === '已计算' ? '重新计算' : '计算工资' }}
        </a-button>
      </div>

      <!-- 标签页 -->
      <a-tabs v-if="formData.wage_number" v-model:activeKey="activeTab">
        <a-tab-pane key="detail" tab="工资明细">
          <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" :row-key="(_r: any, i: number) => i" size="small" :scroll="{ x: 2600 }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'qualified_wage'">
                {{ formatMoney(record.qualified_wage) }}
              </template>
              <template v-else-if="column.key === 'defective_wage'">
                {{ formatMoney(record.defective_wage) }}
              </template>
              <template v-else-if="column.key === 'line_wage'">
                <b>{{ formatMoney(record.line_wage) }}</b>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="summary" tab="员工汇总">
          <a-table :columns="summaryColumns" :data-source="summaryRows" :pagination="false" :row-key="(_r: any, i: number) => i" size="small" :scroll="{ x: 1000 }">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'total_qualified_wage'">
                {{ formatMoney(record.total_qualified_wage) }}
              </template>
              <template v-else-if="column.key === 'total_defective_wage'">
                {{ formatMoney(record.total_defective_wage) }}
              </template>
              <template v-else-if="column.key === 'total_employee_wage'">
                <b style="color:#1890ff">{{ formatMoney(record.total_employee_wage) }}</b>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>

      <!-- 新建时的提示 -->
      <div v-if="!formData.wage_number" style="text-align:center;padding:40px;color:#999">
        <CalculatorOutlined style="font-size:40px;margin-bottom:12px;display:block" />
        创建工资表后，点击「计算工资」按钮，系统将自动匹配周期内已审批报工数据与计件单价生成工资明细
      </div>
    </a-modal>

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

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
