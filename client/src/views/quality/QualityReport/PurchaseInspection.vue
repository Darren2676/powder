<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ToolOutlined,
  DeleteOutlined,
  MinusCircleOutlined,
  UndoOutlined
} from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import { useModalDrag } from '@/composables/useModalDrag'
import { useAuthStore } from '@/store/auth'
import {
  getPurchaseInspections,
  createPurchaseInspection,
  getPurchaseInspectionDetail,
  updatePurchaseInspection,
  completePurchaseInspection,
  defectHandlingPurchaseInspection,
  cancelDefectHandlingPurchaseInspection
} from '@/api/quality/qualityReport'

// ==================== 弹窗拖拽 ====================
const { modalStyle: createModalStyle, onDragStart: onCreateDragStart, resetDrag: resetCreateDrag } = useModalDrag()
const { modalStyle: inspectModalStyle, onDragStart: onInspectDragStart, resetDrag: resetInspectDrag } = useModalDrag()
const { modalStyle: defectModalStyle, onDragStart: onDefectDragStart, resetDrag: resetDefectDrag } = useModalDrag()

// ==================== 列表数据 ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
})

const searchText = ref('')
const filterStatus = ref<string | undefined>(undefined)
const dateRange = ref<any>(null)

const stats = ref<any>({})

// ==================== 创建弹窗 ====================
const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({
  stock_in_number: '',
  purchase_order_number: '',
  supplier_number: '',
  supplier_name: '',
  item_number: '',
  item_name: '',
  specifications: '',
  basic_unit: '',
  received_quantity: 0,
  batch_number: ''
})

// ==================== 检验弹窗 ====================
const inspectVisible = ref(false)
const inspectLoading = ref(false)
const inspectSaving = ref(false)
const inspectMode = ref<'view' | 'edit'>('view')
const inspectData = ref<any>({ header: {}, details: [], defects: [], options: {} })

// ==================== 不合格品处理弹窗 ====================
const defectVisible = ref(false)
const defectLoading = ref(false)
const defectRecord = ref<any>({})
const defectForm = reactive({
  defect_handling: '' as string,
  handling_quantity: 0,
  handling_remark: '',
  return_order_number: '',
  special_warehouse: '',
  qualified_quantity: 0,
  unqualified_quantity: 0
})

// 缺陷明细行（用于不合格品处理弹窗）
const defectItems = ref<any[]>([])

// ==================== 加载数据 ======================================
const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.current,
      limit: pagination.pageSize
    }
    if (searchText.value) params.search = searchText.value
    if (filterStatus.value) params.inspect_status = filterStatus.value
    if (dateRange.value && dateRange.value.length === 2) {
      params.start_date = dateRange.value[0].format('YYYY-MM-DD')
      params.end_date = dateRange.value[1].format('YYYY-MM-DD')
    }

    const res: any = await getPurchaseInspections(params)
    if (res.data) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
      stats.value = res.data.stats || {}
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || '加载数据失败')
  } finally {
    loading.value = false
  }
}

const onSearch = () => {
  pagination.current = 1
  fetchData()
}

const onTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

// ==================== 创建检验单 ====================
const handleCreate = () => {
  Object.assign(createForm, {
    stock_in_number: '',
    purchase_order_number: '',
    supplier_number: '',
    supplier_name: '',
    item_number: '',
    item_name: '',
    specifications: '',
    basic_unit: '',
    received_quantity: 0,
    batch_number: ''
  })
  createVisible.value = true
  resetCreateDrag()
}

const submitCreate = async () => {
  if (!createForm.item_number) {
    message.warning('请填写物料编号')
    return
  }
  createLoading.value = true
  try {
    const res: any = await createPurchaseInspection(createForm)
    if (res.data) {
      message.success(`检验单 ${res.data.inspection_number} 创建成功`)
      createVisible.value = false
      fetchData()
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || '创建失败')
  } finally {
    createLoading.value = false
  }
}

// ==================== 查看/检验 ====================
const openInspect = async (record: any, mode: 'view' | 'edit') => {
  inspectMode.value = mode
  inspectLoading.value = true
  inspectVisible.value = true
  resetInspectDrag()
  try {
    const res: any = await getPurchaseInspectionDetail(record.inspection_number)
    if (res.data) {
      inspectData.value = res.data
      // 编辑模式下若检验员为空，默认当前用户
      if (mode === 'edit' && !inspectData.value.header.inspector_name) {
        const authStore = useAuthStore()
        const currentUser = authStore.user
        if (currentUser) {
          inspectData.value.header.inspector_name = currentUser.real_name || currentUser.username || ''
        }
      }
      // 编辑模式下若无缺陷明细行，初始化一个空行供填写
      if (mode === 'edit' && (!inspectData.value.defects || inspectData.value.defects.length === 0)) {
        inspectData.value.defects = [{
          defect_class_name: '',
          defect_name: '',
          defect_reason_name: '',
          unqualified_quantity: 0,
          inspect_result: '',
          remark: ''
        }]
      }
    }
  } catch (e: any) {
    message.error('加载检验单详情失败')
  } finally {
    inspectLoading.value = false
  }
}

// ==================== 保存检验结果 ====================
const saveInspection = async () => {
  inspectSaving.value = true
  try {
    const header = inspectData.value.header
    const details = inspectData.value.details.map((d: any) => ({
      id: d.id,
      actual_value: d.actual_value || '',
      is_qualified: d.is_qualified || '',
      remark: d.remark || ''
    }))

    await updatePurchaseInspection(header.inspection_number, {
      qualified_quantity: header.qualified_quantity,
      unqualified_quantity: header.unqualified_quantity,
      inspect_result: header.inspect_result,
      defect_class_name: header.defect_class_name,
      defect_name: header.defect_name,
      defect_reason_name: header.defect_reason_name,
      inspector_name: header.inspector_name,
      remark: header.remark,
      details,
      defects: (inspectData.value.defects || []).filter((d: any) => d.defect_name || d.defect_class_name)
    })
    message.success('检验数据保存成功')
    fetchData()
  } catch (e: any) {
    message.error('保存失败')
  } finally {
    inspectSaving.value = false
  }
}

// ==================== 完成检验 ====================
const handleComplete = async (record: any) => {
  const header = inspectData.value.header || record
  if (!header.inspect_result) {
    message.warning('请先填写检验结论再完成检验')
    return
  }
  // 启用质量特性时检查必填
  if (header.enable_quality_chars === 'Y' && inspectData.value.details && inspectData.value.details.length > 0) {
    const unfilled = inspectData.value.details.filter((d: any) => !d.actual_value || d.actual_value.trim() === '')
    if (unfilled.length > 0) {
      const names = unfilled.map((d: any) => d.char_name).join(', ')
      message.warning(`以下质量特性未填写实测值: ${names}`)
      return
    }
  }
  try {
    await completePurchaseInspection(header.inspection_number, {
      inspect_result: header.inspect_result,
      qualified_quantity: header.qualified_quantity || 0,
      unqualified_quantity: header.unqualified_quantity || 0,
      inspector_name: header.inspector_name,
      defects: (inspectData.value.defects || []).filter((d: any) => d.defect_name || d.defect_class_name)
    })
    message.success('检验已完成')
    inspectVisible.value = false
    fetchData()
  } catch (e: any) {
    message.error('完成检验失败')
  }
}

// ==================== 不合格品处理 ====================
const openDefectHandling = async (record: any) => {
  defectRecord.value = record
  Object.assign(defectForm, {
    defect_handling: '',
    handling_quantity: parseFloat(record.unqualified_quantity) || 0,
    handling_remark: '',
    return_order_number: '',
    special_warehouse: '',
    qualified_quantity: parseFloat(record.qualified_quantity) || 0,
    unqualified_quantity: parseFloat(record.unqualified_quantity) || 0
  })
  // 加载缺陷明细行
  try {
    const res: any = await getPurchaseInspectionDetail(record.inspection_number)
    defectItems.value = (res.data?.defects || []).map((d: any) => ({
      ...d,
      defect_handling: d.defect_handling || ''
    }))
  } catch {
    defectItems.value = []
  }
  defectVisible.value = true
  resetDefectDrag()
}

const submitDefectHandling = async () => {
  // 检查是否有不合格的缺陷行
  const unqualifiedItems = defectItems.value.filter((d: any) => d.inspect_result === '不合格')
  if (unqualifiedItems.length === 0) {
    message.warning('没有不合格的缺陷行需要处理')
    return
  }
  defectLoading.value = true
  try {
    await defectHandlingPurchaseInspection(defectRecord.value.inspection_number, {})
    message.success(`已为 ${unqualifiedItems.length} 个不合格缺陷行创建NC单，请在“待处理不合格品”页面分别处理`)
    defectVisible.value = false
    fetchData()
  } catch (e: any) {
    message.error(e.response?.data?.message || '处理失败')
  } finally {
    defectLoading.value = false
  }
}

// ==================== 撤销不合格品处理 ====================
const handleCancelDefectHandling = async (record: any) => {
  try {
    await new Promise((resolve, reject) => {
      Modal.confirm({
        title: '确认撤销',
        content: `确定要撤销检验单 ${record.inspection_number} 的不合格品处理吗？`,
        okText: '确认撤销',
        cancelText: '取消',
        okType: 'danger',
        onOk: () => resolve(true),
        onCancel: () => reject(new Error('cancel'))
      })
    })
    await cancelDefectHandlingPurchaseInspection(record.inspection_number)
    message.success('不合格品处理已撤销')
    fetchData()
  } catch (e: any) {
    if (e.message !== 'cancel') {
      message.error(e.response?.data?.message || '撤销失败')
    }
  }
}

// ==================== 自动判定 ====================
const autoJudge = (detail: any) => {
  if (!detail.actual_value || detail.actual_value === '') {
    detail.is_qualified = ''
    return
  }
  if (detail.data_type === '计量型') {
    const val = parseFloat(detail.actual_value)
    if (isNaN(val)) {
      detail.is_qualified = ''
      return
    }
    const hasLower = detail.lower_limit !== null && detail.lower_limit !== undefined && detail.lower_limit !== ''
    const hasUpper = detail.upper_limit !== null && detail.upper_limit !== undefined && detail.upper_limit !== ''
    if (!hasLower && !hasUpper) {
      detail.is_qualified = ''
      return
    }
    let qualified = true
    if (hasLower && val < parseFloat(detail.lower_limit)) qualified = false
    if (hasUpper && val > parseFloat(detail.upper_limit)) qualified = false
    detail.is_qualified = qualified ? '是' : '否'
  } else if (detail.data_type === '计件型' || detail.data_type === '计点型') {
    // 计件/计点型: 实测值与标准值比较
    const val = parseFloat(detail.actual_value)
    const std = parseFloat(detail.standard_value)
    if (isNaN(val)) {
      detail.is_qualified = ''
      return
    }
    if (!isNaN(std) && val > std) {
      detail.is_qualified = '否'
    } else {
      detail.is_qualified = '是'
    }
  }
}

// 自动计算合格/不合格数量
const autoCalcQuantities = () => {
  const header = inspectData.value.header
  const details = inspectData.value.details
  if (!details || details.length === 0) return

  // 启用质量特性时，根据特性行判定检验结论
  if (header.enable_quality_chars === 'Y') {
    const totalItems = details.length
    const qualifiedItems = details.filter((d: any) => d.is_qualified === '是').length
    const unqualifiedItems = details.filter((d: any) => d.is_qualified === '否').length
    const inspectedItems = qualifiedItems + unqualifiedItems

    if (inspectedItems > 0) {
      if (unqualifiedItems > 0) {
        header.inspect_result = '不合格'
      } else if (qualifiedItems === totalItems) {
        header.inspect_result = '合格'
      }
      // 合格数量 = 到货数量（特性行全部合格时），不合格时由缺陷明细汇总
      const received = parseFloat(header.received_quantity) || 0
      if (unqualifiedItems > 0) {
        // 有不合格特性，不合格数量保持缺陷行汇总或0
      } else if (qualifiedItems === totalItems) {
        header.qualified_quantity = received
        header.unqualified_quantity = 0
      }
    }
  } else {
    // 未启用质量特性时，原有逻辑
    const totalItems = details.length
    const qualifiedItems = details.filter((d: any) => d.is_qualified === '是').length
    const unqualifiedItems = details.filter((d: any) => d.is_qualified === '否').length
    const inspectedItems = qualifiedItems + unqualifiedItems

    if (inspectedItems > 0 && header.received_quantity) {
      const received = parseFloat(header.received_quantity)
      if (unqualifiedItems > 0) {
        header.inspect_result = '不合格'
      } else if (qualifiedItems === totalItems) {
        header.inspect_result = '合格'
      }
    }
  }
}

// 当检验明细的实测值改变时触发
const onActualValueChange = (detail: any) => {
  autoJudge(detail)
  autoCalcQuantities()
}

// 合格/不合格数量变化时自动判定检验结论
const onQtyChange = () => {
  const header = inspectData.value.header
  const unqualified = parseFloat(header.unqualified_quantity) || 0
  const qualified = parseFloat(header.qualified_quantity) || 0
  if (unqualified > 0) {
    header.inspect_result = '不合格'
  } else if (qualified > 0) {
    header.inspect_result = '合格'
  }
}

// 过滤缺陷名称
const filteredDefects = computed(() => {
  const className = inspectData.value.header?.defect_class_name
  if (!className) return inspectData.value.options?.defects || []
  return (inspectData.value.options?.defects || []).filter(
    (d: any) => d.defect_class_name === className
  )
})

// 缺陷明细行操作
const addDefectRow = () => {
  const defects = inspectData.value.defects || []
  defects.push({
    defect_class_name: '',
    defect_name: '',
    defect_reason_name: '',
    unqualified_quantity: 0,
    inspect_result: '',
    remark: ''
  })
  inspectData.value.defects = defects
}

const removeDefectRow = (index: number) => {
  const defects = inspectData.value.defects || []
  defects.splice(index, 1)
  inspectData.value.defects = [...defects]
  syncDefectToHeader()
}

const filteredDefectsForRow = (row: any) => {
  const className = row.defect_class_name
  if (!className) return inspectData.value.options?.defects || []
  return (inspectData.value.options?.defects || []).filter(
    (d: any) => d.defect_class_name === className
  )
}

// 缺陷行变化时同步汇总到主表
const syncDefectToHeader = () => {
  const defects = inspectData.value.defects || []
  if (defects.length === 0) return
  const header = inspectData.value.header
  // 汇总不合格数量
  const totalUnqualified = defects.reduce((sum: number, d: any) => sum + (parseFloat(d.unqualified_quantity) || 0), 0)
  header.unqualified_quantity = totalUnqualified
  // 合格数量 = 到货数量 - 不合格数量(汇总)
  const received = parseFloat(header.received_quantity) || 0
  header.qualified_quantity = Math.max(0, received - totalUnqualified)
  // 汇总检验结论
  if (defects.some((d: any) => d.inspect_result === '不合格')) {
    header.inspect_result = '不合格'
  } else if (defects.every((d: any) => d.inspect_result === '合格' || !d.inspect_result)) {
    if (defects.some((d: any) => d.inspect_result === '合格')) {
      header.inspect_result = '合格'
    }
  }
}

// ==================== 表格列定义 ====================
const columns = [
  { title: '检验单号', dataIndex: 'inspection_number', key: 'inspection_number', width: 180, fixed: 'left' as const },
  { title: '入库单号', dataIndex: 'stock_in_number', key: 'stock_in_number', width: 150 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150, ellipsis: true },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150, ellipsis: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, ellipsis: true },
  { title: '到货数量', dataIndex: 'received_quantity', key: 'received_quantity', width: 100, align: 'right' as const },
  { title: '抽检数', dataIndex: 'sample_quantity', key: 'sample_quantity', width: 80, align: 'right' as const },
  { title: '合格数量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 100, align: 'right' as const },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 110, align: 'right' as const },
  { title: '检验方案', dataIndex: 'inspect_plan_name', key: 'inspect_plan_name', width: 100 },
  { title: '检验方法', dataIndex: 'inspect_method', key: 'inspect_method', width: 90 },
  { title: '检验结论', dataIndex: 'inspect_result', key: 'inspect_result', width: 100 },
  { title: '缺陷分类', dataIndex: 'defect_class_name', key: 'defect_class_name', width: 100 },
  { title: '处理方式', dataIndex: 'defect_handling', key: 'defect_handling', width: 100 },
  { title: '状态', dataIndex: 'inspect_status', key: 'inspect_status', width: 90 },
  { title: '检验日期', dataIndex: 'inspect_date', key: 'inspect_date', width: 110 },
  { title: '检验员', dataIndex: 'inspector_name', key: 'inspector_name', width: 120 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const }
]

const detailColumns = [
  { title: '序号', dataIndex: 'sort_order', key: 'sort_order', width: 60, align: 'center' as const },
  { title: '质量特性', dataIndex: 'char_name', key: 'char_name', width: 130 },
  { title: '分类', dataIndex: 'char_category', key: 'char_category', width: 100 },
  { title: '数据类型', dataIndex: 'data_type', key: 'data_type', width: 80 },
  { title: '下限', dataIndex: 'lower_limit', key: 'lower_limit', width: 80, align: 'right' as const },
  { title: '标准值', dataIndex: 'standard_value', key: 'standard_value', width: 80, align: 'right' as const },
  { title: '上限', dataIndex: 'upper_limit', key: 'upper_limit', width: 80, align: 'right' as const },
  { title: '实测值', dataIndex: 'actual_value', key: 'actual_value', width: 120 },
  { title: '判定', dataIndex: 'is_qualified', key: 'is_qualified', width: 80, align: 'center' as const },
  { title: '检验要求', dataIndex: 'inspect_requirement', key: 'inspect_requirement', width: 150, ellipsis: true }
]

// ==================== 辅助 ====================
const formatDate = (val: any) => {
  if (!val) return '-'
  return dayjs(val).format('YYYY-MM-DD')
}

const formatNumber = (val: any) => {
  if (val === null || val === undefined) return '0'
  const n = parseFloat(val)
  if (isNaN(n)) return '0'
  return n % 1 === 0 ? n.toString() : n.toFixed(2)
}

const getStatusColor = (status: string) => {
  switch (status) {
    case '待检验': return 'orange'
    case '检验中': return 'blue'
    case '已完成': return 'green'
    default: return 'default'
  }
}

const getResultColor = (result: string) => {
  switch (result) {
    case '合格': return 'green'
    case '不合格': return 'red'
    case '让步接收': return 'orange'
    default: return 'default'
  }
}

const getHandlingColor = (handling: string) => {
  switch (handling) {
    case '挑选': return 'blue'
    case '拒收': return 'red'
    case '报废': return 'volcano'
    case '特采': return 'orange'
    case '退货': return 'purple'
    default: return 'default'
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="purchase-inspection-page">
    <a-card :bordered="false">
      <template #title>
        <span style="font-size: 16px; font-weight: 600;">采购质量检验</span>
      </template>

      <!-- 统计卡片 -->
      <a-row :gutter="16" style="margin-bottom: 20px;">
        <a-col :span="6">
          <a-card size="small" class="stat-card stat-card-primary">
            <a-statistic
              title="来料合格率"
              :value="stats.pass_rate || 100"
              suffix="%"
              :precision="2"
              :value-style="{ color: parseFloat(stats.pass_rate || 100) >= 95 ? '#52c41a' : '#ff4d4f', fontSize: '28px', fontWeight: 700 }"
            />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small" class="stat-card">
            <a-statistic
              title="检验单总数 / 已完成"
              :value-style="{ fontSize: '28px', fontWeight: 700, color: '#1890ff' }"
            >
              <template #formatter>
                <span>{{ stats.total_count || 0 }}</span>
                <span style="font-size: 16px; color: #999; margin: 0 4px;">/</span>
                <span style="font-size: 20px; color: #52c41a;">{{ stats.completed_count || 0 }}</span>
              </template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small" class="stat-card">
            <a-statistic
              title="合格总量 / 来料总量"
              :value-style="{ fontSize: '28px', fontWeight: 700, color: '#52c41a' }"
            >
              <template #formatter>
                <span>{{ formatNumber(stats.total_qualified) }}</span>
                <span style="font-size: 16px; color: #999; margin: 0 4px;">/</span>
                <span style="font-size: 20px; color: '#666';">{{ formatNumber(stats.total_received) }}</span>
              </template>
            </a-statistic>
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card size="small" class="stat-card stat-card-danger">
            <a-statistic
              title="不合格总量"
              :value="formatNumber(stats.total_unqualified)"
              :value-style="{ color: parseFloat(stats.total_unqualified || 0) > 0 ? '#ff4d4f' : '#52c41a', fontSize: '28px', fontWeight: 700 }"
            />
          </a-card>
        </a-col>
      </a-row>

      <!-- 搜索栏 -->
      <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center;">
        <a-input-search
          v-model:value="searchText"
          placeholder="检验单号/物料编号/物料名称/入库单号"
          style="width: 320px;"
          allow-clear
          @search="onSearch"
          @pressEnter="onSearch"
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>

        <a-select
          v-model:value="filterStatus"
          placeholder="检验状态"
          style="width: 130px;"
          allow-clear
          @change="onSearch"
        >
          <a-select-option value="待检验">待检验</a-select-option>
          <a-select-option value="检验中">检验中</a-select-option>
          <a-select-option value="已完成">已完成</a-select-option>
        </a-select>

        <a-range-picker
          v-model:value="dateRange"
          format="YYYY-MM-DD"
          style="width: 260px;"
          @change="onSearch"
        />

        <a-button @click="onSearch">
          <template #icon><ReloadOutlined /></template>
          刷新
        </a-button>

        <div style="flex: 1;" />

        <a-button type="primary" @click="handleCreate">
          <template #icon><PlusOutlined /></template>
          新建检验单
        </a-button>
      </div>

      <!-- 数据列表 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 2100 }"
        row-key="inspection_number"
        size="small"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'inspect_date'">
            {{ formatDate(record.inspect_date) }}
          </template>
          <template v-else-if="column.key === 'received_quantity' || column.key === 'qualified_quantity' || column.key === 'unqualified_quantity'">
            {{ formatNumber(record[column.dataIndex]) }}
          </template>
          <template v-else-if="column.key === 'inspect_status'">
            <a-tag :color="getStatusColor(record.inspect_status)">{{ record.inspect_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'inspect_result'">
            <a-tag v-if="record.inspect_result" :color="getResultColor(record.inspect_result)">{{ record.inspect_result }}</a-tag>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'defect_handling'">
            <a-tag v-if="record.defect_handling" :color="getHandlingColor(record.defect_handling)">{{ record.defect_handling }}</a-tag>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="openInspect(record, 'view')">
                <template #icon><EyeOutlined /></template>
                查看
              </a-button>
              <a-button
                v-if="record.inspect_status !== '已完成'"
                type="link"
                size="small"
                @click="openInspect(record, 'edit')"
              >
                <template #icon><EditOutlined /></template>
                检验
              </a-button>
              <a-button
                v-if="record.inspect_status === '已完成' && record.inspect_result === '不合格' && !record.defect_handling"
                type="link"
                size="small"
                style="color: #fa541c;"
                @click="openDefectHandling(record)"
              >
                <template #icon><ToolOutlined /></template>
                不合格品处理
              </a-button>
              <a-button
                v-if="record.inspect_status === '已完成' && record.inspect_result === '不合格' && record.defect_handling"
                type="link"
                size="small"
                style="color: #faad14;"
                @click="handleCancelDefectHandling(record)"
              >
                <template #icon><UndoOutlined /></template>
                撤销处理
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建检验单弹窗 -->
    <a-modal
      v-model:open="createVisible"
      :confirm-loading="createLoading"
      width="650px"
      :style="createModalStyle"
      @ok="submitCreate"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onCreateDragStart">新建采购质量检验单</div>
      </template>
      <a-form layout="vertical" style="margin-top: 16px;">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="物料编号" required>
              <a-input v-model:value="createForm.item_number" placeholder="输入物料编号（自动匹配检验方案）" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="物料名称">
              <a-input v-model:value="createForm.item_name" placeholder="物料名称" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="规格">
              <a-input v-model:value="createForm.specifications" placeholder="规格" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="单位">
              <a-input v-model:value="createForm.basic_unit" placeholder="单位" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="供应商编号">
              <a-input v-model:value="createForm.supplier_number" placeholder="供应商编号" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="供应商名称">
              <a-input v-model:value="createForm.supplier_name" placeholder="供应商名称" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="到货数量">
              <a-input-number v-model:value="createForm.received_quantity" :min="0" style="width: 100%;" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="来料入库单号">
              <a-input v-model:value="createForm.stock_in_number" placeholder="入库单号" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="采购订单号">
              <a-input v-model:value="createForm.purchase_order_number" placeholder="采购单号" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="批次号">
              <a-input v-model:value="createForm.batch_number" placeholder="批次号" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 检验弹窗 -->
    <a-modal
      v-model:open="inspectVisible"
      :width="1100"
      :footer="null"
      :destroy-on-close="true"
      :style="inspectModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onInspectDragStart">{{ inspectMode === 'view' ? '检验单详情' : '执行检验' }}</div>
      </template>
      <a-spin :spinning="inspectLoading">
        <div v-if="inspectData.header">
          <!-- 基本信息 -->
          <a-descriptions bordered size="small" :column="4" style="margin-bottom: 16px;">
            <a-descriptions-item label="检验单号">
              <b>{{ inspectData.header.inspection_number }}</b>
            </a-descriptions-item>
            <a-descriptions-item label="入库单号">{{ inspectData.header.stock_in_number || '-' }}</a-descriptions-item>
            <a-descriptions-item label="采购订单号">{{ inspectData.header.purchase_order_number || '-' }}</a-descriptions-item>
            <a-descriptions-item label="供应商">{{ inspectData.header.supplier_name || '-' }}</a-descriptions-item>
            <a-descriptions-item label="物料编号">{{ inspectData.header.item_number }}</a-descriptions-item>
            <a-descriptions-item label="物料名称">{{ inspectData.header.item_name }}</a-descriptions-item>
            <a-descriptions-item label="规格">{{ inspectData.header.specifications || '-' }}</a-descriptions-item>
            <a-descriptions-item label="到货数量">{{ formatNumber(inspectData.header.received_quantity) }}</a-descriptions-item>
            <a-descriptions-item label="抽样数量">{{ formatNumber(inspectData.header.sample_quantity) }}</a-descriptions-item>
            <a-descriptions-item label="检验方案">{{ inspectData.header.inspect_plan_name || '未匹配' }}</a-descriptions-item>
            <a-descriptions-item label="检验方法">{{ inspectData.header.inspect_method || '-' }}</a-descriptions-item>
            <a-descriptions-item label="抽检方式">{{ inspectData.header.sampling_method || '-' }}</a-descriptions-item>
            <a-descriptions-item label="检验员">
              <a-auto-complete
                v-if="inspectMode === 'edit' && inspectData.header.inspect_status !== '已完成'"
                v-model:value="inspectData.header.inspector_name"
                :options="(inspectData.options?.plan_inspectors || []).map((n: string) => ({ value: n, label: n }))"
                placeholder="输入或选择检验员"
                allow-clear
                style="width: 100%;"
              />
              <span v-else>{{ inspectData.header.inspector_name || '-' }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="检验规范">{{ inspectData.header.inspect_spec_name || '-' }}</a-descriptions-item>
            <a-descriptions-item label="缺陷分类范围">{{ inspectData.header.defect_categories || '-' }}</a-descriptions-item>
            <a-descriptions-item label="状态">
              <a-tag :color="getStatusColor(inspectData.header.inspect_status)">{{ inspectData.header.inspect_status }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="检验日期">{{ formatDate(inspectData.header.inspect_date) }}</a-descriptions-item>
            <a-descriptions-item label="批次号">{{ inspectData.header.batch_number || '-' }}</a-descriptions-item>
          </a-descriptions>

          <!-- 质量特性检测表(查看/编辑) - 仅当启用质量特性时显示 -->
          <div v-if="inspectData.header.enable_quality_chars === 'Y'" style="margin-bottom: 16px;">
            <h4 style="margin-bottom: 8px;">
              <SafetyCertificateOutlined style="margin-right: 6px; color: #1890ff;" />
              质量特性检测
              <a-tag v-if="inspectData.details.length > 0" color="blue" style="margin-left: 8px;">{{ inspectData.details.length }}项</a-tag>
              <span v-else style="margin-left: 8px; color: #999; font-size: 12px;">（未关联检验规范或规范中无特性明细）</span>
            </h4>
            <a-table
              v-if="inspectData.details.length > 0"
              :columns="detailColumns"
              :data-source="inspectData.details"
              :pagination="false"
              row-key="id"
              size="small"
              bordered
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'actual_value'">
                  <a-input
                    v-if="inspectMode === 'edit' && inspectData.header.inspect_status !== '已完成'"
                    v-model:value="record.actual_value"
                    size="small"
                    placeholder="输入实测值"
                    @change="onActualValueChange(record)"
                  />
                  <span v-else>{{ record.actual_value || '-' }}</span>
                </template>
                <template v-else-if="column.key === 'is_qualified'">
                  <a-tag v-if="record.is_qualified === '是'" color="green">合格</a-tag>
                  <a-tag v-else-if="record.is_qualified === '否'" color="red">不合格</a-tag>
                  <span v-else style="color: #ccc;">-</span>
                </template>
                <template v-else-if="column.key === 'lower_limit' || column.key === 'upper_limit' || column.key === 'standard_value'">
                  {{ record[column.dataIndex] !== null && record[column.dataIndex] !== undefined ? record[column.dataIndex] : '-' }}
                </template>
              </template>
            </a-table>
          </div>

          <!-- 缺陷记录 + 检验结论（编辑模式） -->
          <div v-if="inspectMode === 'edit' && inspectData.header.inspect_status !== '已完成'" style="margin-bottom: 16px;">
            <a-alert
              v-if="inspectData.header.enable_quality_chars !== 'Y'"
              message="本物料/方案未启用质量特性，请通过缺陷分类和不合格数量直接判定检验结论。"
              type="info"
              show-icon
              style="margin-bottom: 12px;"
            />
            <h4 style="margin-bottom: 8px;">
              <ExclamationCircleOutlined style="margin-right: 6px; color: #faad14;" />
              缺陷记录与检验结论
            </h4>
            <!-- 汇总数量行 -->
            <a-form layout="vertical" style="margin-bottom: 12px;">
              <a-row :gutter="16">
                <a-col :span="6">
                  <a-form-item label="到货数量">
                    <a-input-number :value="parseFloat(inspectData.header.received_quantity) || 0" disabled style="width: 100%;" />
                  </a-form-item>
                </a-col>
                <a-col :span="6">
                  <a-form-item label="抽检数量">
                    <a-input-number :value="parseFloat(inspectData.header.sample_quantity) || 0" disabled style="width: 100%;" />
                  </a-form-item>
                </a-col>
                <a-col :span="6">
                  <a-form-item label="合格数量(自动计算)">
                    <a-input-number :value="parseFloat(inspectData.header.qualified_quantity) || 0" disabled style="width: 100%;" />
                  </a-form-item>
                </a-col>
                <a-col :span="6">
                  <a-form-item label="不合格数量(汇总)">
                    <a-input-number :value="parseFloat(inspectData.header.unqualified_quantity) || 0" disabled style="width: 100%;" />
                  </a-form-item>
                </a-col>
              </a-row>
            </a-form>
            <!-- 缺陷明细表格 -->
            <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 13px; color: #666;">按缺陷名称分行录入，不合格数量和检验结论按行填写</span>
              <a-button size="small" type="dashed" @click="addDefectRow"><PlusOutlined /> 添加缺陷行</a-button>
            </div>
            <a-table
              :columns="[
                { title: '序号', key: 'lineNo', width: 55, align: 'center' },
                { title: '不合格数量', key: 'unqualified_quantity', width: 120 },
                { title: '缺陷分类', key: 'defect_class_name', width: 130 },
                { title: '缺陷名称', key: 'defect_name', width: 130 },
                { title: '缺陷原因', key: 'defect_reason_name', width: 130 },
                { title: '检验结论', key: 'inspect_result', width: 120 },
                { title: '操作', key: 'action', width: 60, align: 'center' }
              ]"
              :data-source="inspectData.defects"
              :pagination="false"
              row-key="(_, index) => index"
              size="small"
              bordered
            >
              <template #bodyCell="{ column, record, index }">
                <template v-if="column.key === 'lineNo'">
                  {{ index + 1 }}
                </template>
                <template v-else-if="column.key === 'unqualified_quantity'">
                  <a-input-number v-model:value="record.unqualified_quantity" :min="0" style="width: 100%;" size="small" @change="syncDefectToHeader" />
                </template>
                <template v-else-if="column.key === 'defect_class_name'">
                  <a-select v-model:value="record.defect_class_name" placeholder="选择分类" allow-clear size="small" style="width: 100%;" @change="record.defect_name = ''; syncDefectToHeader()">
                    <a-select-option v-for="cls in (inspectData.options?.defect_classes || [])" :key="cls" :value="cls">{{ cls }}</a-select-option>
                  </a-select>
                </template>
                <template v-else-if="column.key === 'defect_name'">
                  <a-select v-model:value="record.defect_name" placeholder="选择缺陷" allow-clear size="small" style="width: 100%;" @change="syncDefectToHeader">
                    <a-select-option v-for="d in filteredDefectsForRow(record)" :key="d.defect_name" :value="d.defect_name">{{ d.defect_name }}</a-select-option>
                  </a-select>
                </template>
                <template v-else-if="column.key === 'defect_reason_name'">
                  <a-select v-model:value="record.defect_reason_name" placeholder="选择原因" allow-clear size="small" style="width: 100%;">
                    <a-select-option v-for="r in (inspectData.options?.defect_reasons || [])" :key="r" :value="r">{{ r }}</a-select-option>
                  </a-select>
                </template>
                <template v-else-if="column.key === 'inspect_result'">
                  <a-select v-model:value="record.inspect_result" placeholder="选择结论" allow-clear size="small" style="width: 100%;" @change="syncDefectToHeader">
                    <a-select-option value="合格">合格</a-select-option>
                    <a-select-option value="不合格">不合格</a-select-option>
                    <a-select-option value="让步接收">让步接收</a-select-option>
                  </a-select>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-button v-if="inspectData.defects.length > 1" type="link" danger size="small" @click="removeDefectRow(index)"><DeleteOutlined /></a-button>
                </template>
              </template>
            </a-table>
            <a-form layout="vertical" style="margin-top: 12px;">
              <a-row :gutter="16">
                <a-col :span="24">
                  <a-form-item label="备注">
                    <a-textarea v-model:value="inspectData.header.remark" :rows="2" placeholder="检验备注" />
                  </a-form-item>
                </a-col>
              </a-row>
            </a-form>
          </div>

          <!-- 查看模式下显示结果 -->
          <div v-if="inspectMode === 'view' && inspectData.header.inspect_result" style="margin-bottom: 16px;">
            <h4 style="margin-bottom: 8px;">
              <CheckCircleOutlined style="margin-right: 6px; color: #52c41a;" />
              检验结果
            </h4>
            <a-descriptions bordered size="small" :column="4">
              <a-descriptions-item label="检验方案">{{ inspectData.header.inspect_plan_name || '-' }}</a-descriptions-item>
              <a-descriptions-item label="检验方法">{{ inspectData.header.inspect_method || '-' }}</a-descriptions-item>
              <a-descriptions-item label="抽检方式">{{ inspectData.header.sampling_method || '-' }}</a-descriptions-item>
              <a-descriptions-item label="抽检数/到货数">{{ formatNumber(inspectData.header.sample_quantity) }} / {{ formatNumber(inspectData.header.received_quantity) }}</a-descriptions-item>
              <a-descriptions-item label="合格数量">
                <span style="color: #52c41a; font-weight: 600;">{{ formatNumber(inspectData.header.qualified_quantity) }}</span>
              </a-descriptions-item>
              <a-descriptions-item label="不合格数量">
                <span :style="{ color: parseFloat(inspectData.header.unqualified_quantity) > 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }">{{ formatNumber(inspectData.header.unqualified_quantity) }}</span>
              </a-descriptions-item>
              <a-descriptions-item label="检验结论">
                <a-tag :color="getResultColor(inspectData.header.inspect_result)">{{ inspectData.header.inspect_result }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="处理方式">
                <a-tag v-if="inspectData.header.defect_handling" :color="getHandlingColor(inspectData.header.defect_handling)">{{ inspectData.header.defect_handling }}</a-tag>
                <span v-else style="color: #ccc;">-</span>
              </a-descriptions-item>
              <a-descriptions-item label="检验规范">{{ inspectData.header.inspect_spec_name || '-' }}</a-descriptions-item>
              <a-descriptions-item label="缺陷分类范围">{{ inspectData.header.defect_categories || '-' }}</a-descriptions-item>
              <a-descriptions-item label="检验员">{{ inspectData.header.inspector_name || '-' }}</a-descriptions-item>
              <a-descriptions-item label="检验日期">{{ formatDate(inspectData.header.inspect_date) }}</a-descriptions-item>
              <a-descriptions-item label="批次号">{{ inspectData.header.batch_number || '-' }}</a-descriptions-item>
              <a-descriptions-item label="备注" :span="4">{{ inspectData.header.remark || '-' }}</a-descriptions-item>
            </a-descriptions>
            <!-- 缺陷明细表格 -->
            <div v-if="inspectData.defects && inspectData.defects.length > 0" style="margin-top: 12px;">
              <h5 style="margin-bottom: 8px;">缺陷记录明细</h5>
              <a-table
                :columns="[
                  { title: '序号', key: 'lineNo', width: 55, align: 'center' },
                  { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 120, align: 'right' },
                  { title: '缺陷分类', dataIndex: 'defect_class_name', key: 'defect_class_name', width: 130 },
                  { title: '缺陷名称', dataIndex: 'defect_name', key: 'defect_name', width: 130 },
                  { title: '缺陷原因', dataIndex: 'defect_reason_name', key: 'defect_reason_name', width: 130 },
                  { title: '检验结论', dataIndex: 'inspect_result', key: 'inspect_result', width: 120 }
                ]"
                :data-source="inspectData.defects"
                :pagination="false"
                row-key="(record, index) => record.id ?? index"
                size="small"
                bordered
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'lineNo'">
                    {{ record.line_number || '-' }}
                  </template>
                  <template v-else-if="column.key === 'unqualified_quantity'">
                    {{ formatNumber(record.unqualified_quantity) }}
                  </template>
                  <template v-else-if="column.key === 'inspect_result'">
                    <a-tag :color="getResultColor(record.inspect_result)">{{ record.inspect_result || '-' }}</a-tag>
                  </template>
                </template>
              </a-table>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div v-if="inspectMode === 'edit' && inspectData.header.inspect_status !== '已完成'" style="text-align: right; margin-top: 16px;">
            <a-space>
              <a-button @click="inspectVisible = false">取消</a-button>
              <a-button type="primary" :loading="inspectSaving" @click="saveInspection">
                <template #icon><EditOutlined /></template>
                保存
              </a-button>
              <a-popconfirm
                title="确认完成检验？完成后将不可修改，合格数量将回写入库单。"
                @confirm="handleComplete(inspectData.header)"
              >
                <a-button type="primary" style="background: #52c41a; border-color: #52c41a;">
                  <template #icon><CheckCircleOutlined /></template>
                  完成检验
                </a-button>
              </a-popconfirm>
            </a-space>
          </div>
        </div>
      </a-spin>
    </a-modal>

    <!-- 不合格品处理弹窗 -->
    <a-modal
      v-model:open="defectVisible"
      :confirm-loading="defectLoading"
      width="800px"
      :style="defectModalStyle"
      ok-text="确认创建NC单"
      @ok="submitDefectHandling"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onDefectDragStart">不合格品处理</div>
      </template>
      <div style="margin-top: 16px;">
        <a-descriptions bordered size="small" :column="2" style="margin-bottom: 16px;">
          <a-descriptions-item label="检验单号"><b>{{ defectRecord.inspection_number }}</b></a-descriptions-item>
          <a-descriptions-item label="物料">{{ defectRecord.item_number }} {{ defectRecord.item_name }}</a-descriptions-item>
          <a-descriptions-item label="不合格数量"><span style="color: #ff4d4f; font-weight: 600;">{{ formatNumber(defectRecord.unqualified_quantity) }}</span></a-descriptions-item>
          <a-descriptions-item label="合格数量"><span style="color: #52c41a; font-weight: 600;">{{ formatNumber(defectRecord.qualified_quantity) }}</span></a-descriptions-item>
        </a-descriptions>

        <!-- 缺陷明细表格：显示各行状态 -->
        <div v-if="defectItems.length > 0" style="margin-bottom: 16px;">
          <h5 style="margin-bottom: 8px;">不合格项明细</h5>
          <a-table
            :columns="[
              { title: '序号', key: 'lineNo', width: 55, align: 'center' },
              { title: '缺陷分类', dataIndex: 'defect_class_name', key: 'defect_class_name', width: 100 },
              { title: '缺陷名称', dataIndex: 'defect_name', key: 'defect_name', width: 120 },
              { title: '缺陷原因', dataIndex: 'defect_reason_name', key: 'defect_reason_name', width: 120 },
              { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 100, align: 'right' },
              { title: '检验结论', dataIndex: 'inspect_result', key: 'inspect_result', width: 90 },
              { title: 'NC单/处理状态', key: 'defect_handling', width: 160 }
            ]"
            :data-source="defectItems"
            :pagination="false"
            row-key="(record, index) => record.id ?? index"
            size="small"
            bordered
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'lineNo'">
                {{ index + 1 }}
              </template>
              <template v-else-if="column.key === 'unqualified_quantity'">
                {{ formatNumber(record.unqualified_quantity) }}
              </template>
              <template v-else-if="column.key === 'inspect_result'">
                <a-tag :color="getResultColor(record.inspect_result)">{{ record.inspect_result || '-' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'defect_handling'">
                <template v-if="record.inspect_result === '让步接收'">
                  <a-tag color="orange">让步接收（无需NC单）</a-tag>
                </template>
                <template v-else-if="record.defect_handling && record.defect_handling.startsWith('NC-')">
                  <a-tag color="blue">{{ record.defect_handling }}（待处理）</a-tag>
                </template>
                <template v-else-if="record.defect_handling && !record.defect_handling.startsWith('NC-')">
                  <a-tag color="green">{{ record.defect_handling }}（已处理）</a-tag>
                </template>
                <template v-else>
                  <a-tag v-if="record.inspect_result === '不合格'" color="red">待创建NC单</a-tag>
                  <span v-else style="color: #ccc;">-</span>
                </template>
              </template>
            </template>
          </a-table>
        </div>

        <a-alert message="点击“确定”将为每个不合格缺陷行创建独立的NC单，请在“待处理不合格品”页面分别选择处理方式。" type="info" show-icon style="margin-bottom: 12px;" />
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}

.purchase-inspection-page {
  padding: 0;
}

.stat-card {
  border-radius: 8px;
  transition: box-shadow 0.2s;
}

.stat-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.09);
}

:deep(.ant-statistic-title) {
  font-size: 13px;
  color: #666;
}

:deep(.ant-descriptions-item-label) {
  background: #fafafa;
  font-weight: 500;
}
</style>

<style scoped>
.purchase-inspection-page {
  padding: 0;
}

.stat-card {
  border-radius: 8px;
  transition: box-shadow 0.2s;
}

.stat-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.09);
}

:deep(.ant-statistic-title) {
  font-size: 13px;
  color: #666;
}

:deep(.ant-descriptions-item-label) {
  background: #fafafa;
  font-weight: 500;
}
</style>
