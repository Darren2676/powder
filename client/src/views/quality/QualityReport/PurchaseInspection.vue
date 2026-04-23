<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
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
  FileTextOutlined
} from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import {
  getPurchaseInspections,
  createPurchaseInspection,
  getPurchaseInspectionDetail,
  updatePurchaseInspection,
  completePurchaseInspection
} from '@/api/quality/qualityReport'

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
const inspectData = ref<any>({ header: {}, details: [], options: {} })

// ==================== 加载数据 ====================
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
    if (res.data?.data) {
      dataSource.value = res.data.data.items || []
      pagination.total = res.data.data.total || 0
      stats.value = res.data.data.stats || {}
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
}

const submitCreate = async () => {
  if (!createForm.item_number) {
    message.warning('请填写物料编号')
    return
  }
  createLoading.value = true
  try {
    const res: any = await createPurchaseInspection(createForm)
    if (res.data?.data) {
      message.success(`检验单 ${res.data.data.inspection_number} 创建成功`)
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
  try {
    const res: any = await getPurchaseInspectionDetail(record.inspection_number)
    if (res.data?.data) {
      inspectData.value = res.data.data
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
      remark: header.remark,
      details
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
  try {
    await completePurchaseInspection(header.inspection_number, {
      inspect_result: header.inspect_result,
      qualified_quantity: header.qualified_quantity || 0,
      unqualified_quantity: header.unqualified_quantity || 0
    })
    message.success('检验已完成')
    inspectVisible.value = false
    fetchData()
  } catch (e: any) {
    message.error('完成检验失败')
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
    const hasLower = detail.lower_limit !== null && detail.lower_limit !== undefined
    const hasUpper = detail.upper_limit !== null && detail.upper_limit !== undefined
    if (!hasLower && !hasUpper) {
      detail.is_qualified = ''
      return
    }
    let qualified = true
    if (hasLower && val < parseFloat(detail.lower_limit)) qualified = false
    if (hasUpper && val > parseFloat(detail.upper_limit)) qualified = false
    detail.is_qualified = qualified ? '是' : '否'
  }
}

// 自动计算合格/不合格数量
const autoCalcQuantities = () => {
  const header = inspectData.value.header
  const details = inspectData.value.details
  if (!details || details.length === 0) return

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

// 当检验明细的实测值改变时触发
const onActualValueChange = (detail: any) => {
  autoJudge(detail)
  autoCalcQuantities()
}

// 过滤缺陷名称
const filteredDefects = computed(() => {
  const className = inspectData.value.header?.defect_class_name
  if (!className) return inspectData.value.options?.defects || []
  return (inspectData.value.options?.defects || []).filter(
    (d: any) => d.defect_class_name === className
  )
})

// ==================== 表格列定义 ====================
const columns = [
  { title: '检验单号', dataIndex: 'inspection_number', key: 'inspection_number', width: 180, fixed: 'left' as const },
  { title: '入库单号', dataIndex: 'stock_in_number', key: 'stock_in_number', width: 150 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150, ellipsis: true },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150, ellipsis: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, ellipsis: true },
  { title: '到货数量', dataIndex: 'received_quantity', key: 'received_quantity', width: 100, align: 'right' as const },
  { title: '合格数量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 100, align: 'right' as const },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 110, align: 'right' as const },
  { title: '检验方法', dataIndex: 'inspect_method', key: 'inspect_method', width: 90 },
  { title: '检验结论', dataIndex: 'inspect_result', key: 'inspect_result', width: 100 },
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
        :scroll="{ x: 1800 }"
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
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建检验单弹窗 -->
    <a-modal
      v-model:open="createVisible"
      title="新建采购质量检验单"
      :confirm-loading="createLoading"
      width="650px"
      @ok="submitCreate"
    >
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
      :title="inspectMode === 'view' ? '检验单详情' : '执行检验'"
      :width="1100"
      :footer="null"
      :destroy-on-close="true"
    >
      <a-spin :spinning="inspectLoading">
        <div v-if="inspectData.header">
          <!-- 基本信息 -->
          <a-descriptions bordered size="small" :column="3" style="margin-bottom: 16px;">
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
            <a-descriptions-item label="检验员">{{ inspectData.header.inspector_name || '-' }}</a-descriptions-item>
            <a-descriptions-item label="状态">
              <a-tag :color="getStatusColor(inspectData.header.inspect_status)">{{ inspectData.header.inspect_status }}</a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="检验日期">{{ formatDate(inspectData.header.inspect_date) }}</a-descriptions-item>
            <a-descriptions-item label="批次号">{{ inspectData.header.batch_number || '-' }}</a-descriptions-item>
          </a-descriptions>

          <!-- 质量特性检测表 -->
          <div style="margin-bottom: 16px;">
            <h4 style="margin-bottom: 8px;">
              <SafetyCertificateOutlined style="margin-right: 6px; color: #1890ff;" />
              质量特性检测
            </h4>
            <a-table
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

          <!-- 缺陷记录 + 检验结论 -->
          <div v-if="inspectMode === 'edit' && inspectData.header.inspect_status !== '已完成'" style="margin-bottom: 16px;">
            <h4 style="margin-bottom: 8px;">
              <ExclamationCircleOutlined style="margin-right: 6px; color: #faad14;" />
              缺陷记录与检验结论
            </h4>
            <a-form layout="vertical">
              <a-row :gutter="16">
                <a-col :span="6">
                  <a-form-item label="合格数量">
                    <a-input-number v-model:value="inspectData.header.qualified_quantity" :min="0" style="width: 100%;" />
                  </a-form-item>
                </a-col>
                <a-col :span="6">
                  <a-form-item label="不合格数量">
                    <a-input-number v-model:value="inspectData.header.unqualified_quantity" :min="0" style="width: 100%;" />
                  </a-form-item>
                </a-col>
                <a-col :span="6">
                  <a-form-item label="检验结论">
                    <a-select v-model:value="inspectData.header.inspect_result" placeholder="选择检验结论">
                      <a-select-option value="合格">合格</a-select-option>
                      <a-select-option value="不合格">不合格</a-select-option>
                      <a-select-option value="让步接收">让步接收</a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
              </a-row>
              <a-row :gutter="16">
                <a-col :span="8">
                  <a-form-item label="缺陷分类">
                    <a-select
                      v-model:value="inspectData.header.defect_class_name"
                      placeholder="选择缺陷分类"
                      allow-clear
                    >
                      <a-select-option
                        v-for="cls in (inspectData.options?.defect_classes || [])"
                        :key="cls"
                        :value="cls"
                      >{{ cls }}</a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item label="缺陷名称">
                    <a-select
                      v-model:value="inspectData.header.defect_name"
                      placeholder="选择缺陷名称"
                      allow-clear
                    >
                      <a-select-option
                        v-for="d in filteredDefects"
                        :key="d.defect_name"
                        :value="d.defect_name"
                      >{{ d.defect_name }}</a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
                <a-col :span="8">
                  <a-form-item label="缺陷原因">
                    <a-select
                      v-model:value="inspectData.header.defect_reason_name"
                      placeholder="选择缺陷原因"
                      allow-clear
                    >
                      <a-select-option
                        v-for="r in (inspectData.options?.defect_reasons || [])"
                        :key="r"
                        :value="r"
                      >{{ r }}</a-select-option>
                    </a-select>
                  </a-form-item>
                </a-col>
              </a-row>
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
            <a-descriptions bordered size="small" :column="3">
              <a-descriptions-item label="合格数量">{{ formatNumber(inspectData.header.qualified_quantity) }}</a-descriptions-item>
              <a-descriptions-item label="不合格数量">{{ formatNumber(inspectData.header.unqualified_quantity) }}</a-descriptions-item>
              <a-descriptions-item label="检验结论">
                <a-tag :color="getResultColor(inspectData.header.inspect_result)">{{ inspectData.header.inspect_result }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="缺陷分类">{{ inspectData.header.defect_class_name || '-' }}</a-descriptions-item>
              <a-descriptions-item label="缺陷名称">{{ inspectData.header.defect_name || '-' }}</a-descriptions-item>
              <a-descriptions-item label="缺陷原因">{{ inspectData.header.defect_reason_name || '-' }}</a-descriptions-item>
              <a-descriptions-item label="备注" :span="3">{{ inspectData.header.remark || '-' }}</a-descriptions-item>
            </a-descriptions>
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
  </div>
</template>

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
