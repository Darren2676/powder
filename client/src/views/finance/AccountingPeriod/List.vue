<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  PlusOutlined,
  DeleteOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons-vue'
import {
  getAccountingPeriods,
  getAvailableYears,
  generatePeriods,
  openPeriod,
  closePeriod,
  updatePeriod,
  updatePeriodDates,
  deletePeriods
} from '@/api/finance/accountingPeriod'
import { useTableList } from '@/composables/useTableList'

// ==================== 状态 ====================

const yearList = ref<number[]>([])
const filterYear = ref<string>('')
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getAccountingPeriods)

const filterStatus = ref<string>('')

// 带筛选参数的数据加载
const loadData = () => {
  fetchData({
    fiscal_year: filterYear.value || undefined,
    status: filterStatus.value || undefined,
  })
}

// 生成期间弹窗
const generateModalVisible = ref(false)
const generateForm = ref({
  fiscal_year: new Date().getFullYear(),
  period_type: 'monthly'
})
const generateLoading = ref(false)

// 编辑备注弹窗
const remarkModalVisible = ref(false)
const remarkForm = ref({ id: 0, remark: '' })
const remarkLoading = ref(false)

// 修改日期弹窗
const datesModalVisible = ref(false)
const datesForm = ref({ id: 0, period_name: '', start_date: '', end_date: '' })
const datesLoading = ref(false)

// ==================== 表格列定义 ====================
const columns = [
  { title: '期间编码', dataIndex: 'period_code', key: 'period_code', width: 120 },
  { title: '期间名称', dataIndex: 'period_name', key: 'period_name', width: 140 },
  { title: '会计年度', dataIndex: 'fiscal_year', key: 'fiscal_year', width: 100, align: 'center' as const },
  { title: '期间序号', dataIndex: 'period_number', key: 'period_number', width: 100, align: 'center' as const },
  { title: '开始日期', dataIndex: 'start_date', key: 'start_date', width: 120 },
  { title: '结束日期', dataIndex: 'end_date', key: 'end_date', width: 120 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100, align: 'center' as const },
  { title: '关闭人', dataIndex: 'closed_by', key: 'closed_by', width: 100 },
  { title: '关闭日期', dataIndex: 'closed_date', key: 'closed_date', width: 160 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100 },
  { title: '操作', key: 'action', width: 260, fixed: 'right' as const }
]

// ==================== 数据加载 ====================
const fetchYears = async () => {
  try {
    const res = await getAvailableYears()
    yearList.value = (res as any).data || []
  } catch {
    // ignore
  }
}

onMounted(() => {
  loadData()
  fetchYears()
})

// ==================== 格式化 ====================
const formatDate = (val: string) => {
  if (!val) return ''
  return val.substring(0, 10)
}

const formatDateTime = (val: string) => {
  if (!val) return ''
  return val.replace('T', ' ').substring(0, 19)
}

const statusColor = (status: string) => {
  if (status === '已开启') return 'green'
  if (status === '已关闭') return 'red'
  return 'default'
}

// ==================== 生成期间 ====================
const handleShowGenerate = () => {
  generateForm.value = {
    fiscal_year: new Date().getFullYear(),
    period_type: 'monthly'
  }
  generateModalVisible.value = true
}

const handleGenerate = async () => {
  generateLoading.value = true
  try {
    await generatePeriods({
      fiscal_year: generateForm.value.fiscal_year,
      period_type: generateForm.value.period_type
    })
    message.success('会计期间生成成功')
    generateModalVisible.value = false
    loadData()
    fetchYears()
  } catch (e: any) {
    message.error(e.message || '生成失败')
  } finally {
    generateLoading.value = false
  }
}

// ==================== 开启期间 ====================
const handleOpen = (record: any) => {
  Modal.confirm({
    title: '确认开启',
    icon: () => null,
    content: `确定要开启期间 "${record.period_name}" 吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        await openPeriod(record.id)
        message.success('开启成功')
        loadData()
      } catch (e: any) {
        message.error(e.message || '开启失败')
      }
    }
  })
}

// ==================== 关闭期间 ====================
const handleClose = (record: any) => {
  Modal.confirm({
    title: '确认关闭',
    icon: () => null,
    content: `确定要关闭期间 "${record.period_name}" 吗？关闭后不可重新开启。`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        await closePeriod(record.id)
        message.success('关闭成功')
        loadData()
      } catch (e: any) {
        message.error(e.message || '关闭失败')
      }
    }
  })
}

// ==================== 编辑备注 ====================
const handleEditRemark = (record: any) => {
  remarkForm.value = { id: record.id, remark: record.remark || '' }
  remarkModalVisible.value = true
}

const handleSaveRemark = async () => {
  remarkLoading.value = true
  try {
    await updatePeriod(remarkForm.value.id, { remark: remarkForm.value.remark })
    message.success('备注已更新')
    remarkModalVisible.value = false
    loadData()
  } catch (e: any) {
    message.error(e.message || '更新失败')
  } finally {
    remarkLoading.value = false
  }
}

// ==================== 修改期间日期 ====================
const handleEditDates = (record: any) => {
  datesForm.value = {
    id: record.id,
    period_name: record.period_name,
    start_date: record.start_date ? record.start_date.substring(0, 10) : '',
    end_date: record.end_date ? record.end_date.substring(0, 10) : ''
  }
  datesModalVisible.value = true
}

const handleSaveDates = async () => {
  if (!datesForm.value.start_date || !datesForm.value.end_date) {
    message.warning('请填写开始日期和结束日期')
    return
  }
  if (datesForm.value.start_date >= datesForm.value.end_date) {
    message.warning('开始日期必须早于结束日期')
    return
  }
  datesLoading.value = true
  try {
    await updatePeriodDates(datesForm.value.id, {
      start_date: datesForm.value.start_date,
      end_date: datesForm.value.end_date
    })
    message.success('期间日期修改成功')
    datesModalVisible.value = false
    loadData()
  } catch (e: any) {
    message.error(e.message || '修改失败')
  } finally {
    datesLoading.value = false
  }
}

// ==================== 删除年度期间 ====================
const handleDeleteYear = () => {
  if (!filterYear.value) {
    message.warning('请先选择要删除的会计年度')
    return
  }
  const year = parseInt(filterYear.value)
  Modal.confirm({
    title: '确认删除',
    icon: () => null,
    content: `确定要删除 ${year} 年度的所有会计期间吗？仅当所有期间均为"未开启"状态时才允许删除。`,
    okText: '确定删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deletePeriods(year)
        message.success(`${year}年度会计期间已删除`)
        filterYear.value = ''
        loadData()
        fetchYears()
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    }
  })
}

// ==================== 汇总统计 ====================
const summary = computed(() => {
  const total = dataSource.value.length
  const opened = dataSource.value.filter((r: any) => r.status === '已开启').length
  const closed = dataSource.value.filter((r: any) => r.status === '已关闭').length
  const notOpened = dataSource.value.filter((r: any) => r.status === '未开启').length
  return { total, opened, closed, notOpened }
})
</script>

<template>
  <div class="page-header-title">会计期间管理</div>
  <a-card>
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <a-select
          v-model:value="filterYear"
          placeholder="选择年度"
          allow-clear
          style="width: 140px"
          @change="loadData"
        >
          <a-select-option v-for="y in yearList" :key="y" :value="String(y)">{{ y }}年</a-select-option>
        </a-select>
        <a-select
          v-model:value="filterStatus"
          placeholder="状态筛选"
          allow-clear
          style="width: 130px"
          @change="loadData"
        >
          <a-select-option value="未开启">未开启</a-select-option>
          <a-select-option value="已开启">已开启</a-select-option>
          <a-select-option value="已关闭">已关闭</a-select-option>
        </a-select>
        <a-button @click="loadData">查询</a-button>
      </div>
      <div class="toolbar-right">
        <a-button type="primary" @click="handleShowGenerate">
          <template #icon><PlusOutlined /></template>
          生成年度期间
        </a-button>
        <a-button danger @click="handleDeleteYear" :disabled="!filterYear">
          <template #icon><DeleteOutlined /></template>
          删除年度期间
        </a-button>
      </div>
    </div>

    <!-- 汇总栏 -->
    <div class="summary-bar" v-if="dataSource.length > 0">
      <span>共 <b>{{ summary.total }}</b> 个期间</span>
      <a-divider type="vertical" />
      <span>未开启: <b>{{ summary.notOpened }}</b></span>
      <a-divider type="vertical" />
      <span style="color: #52c41a;">已开启: <b>{{ summary.opened }}</b></span>
      <a-divider type="vertical" />
      <span style="color: #ff4d4f;">已关闭: <b>{{ summary.closed }}</b></span>
    </div>

    <!-- 表格 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="false"
      row-key="id"
      :scroll="{ x: 1400 }"
      size="small"
      bordered
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'start_date'">
          {{ formatDate(record.start_date) }}
        </template>
        <template v-else-if="column.key === 'end_date'">
          {{ formatDate(record.end_date) }}
        </template>
        <template v-else-if="column.key === 'closed_date'">
          {{ formatDateTime(record.closed_date) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button
              v-if="record.status === '未开启'"
              type="link"
              size="small"
              @click="handleOpen(record)"
            >
              <template #icon><CheckCircleOutlined /></template>
              开启
            </a-button>
            <a-button
              v-if="record.status === '已开启'"
              type="link"
              size="small"
              danger
              @click="handleClose(record)"
            >
              <template #icon><CloseCircleOutlined /></template>
              关闭
            </a-button>
            <a-button
              type="link"
              size="small"
              @click="handleEditRemark(record)"
            >
              <template #icon><EditOutlined /></template>
              备注
            </a-button>
            <a-button
              v-if="record.status !== '已关闭'"
              type="link"
              size="small"
              @click="handleEditDates(record)"
            >
              <template #icon><CalendarOutlined /></template>
              修改日期
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 生成期间弹窗 -->
    <a-modal
      v-model:open="generateModalVisible"
      title="生成年度会计期间"
      :confirm-loading="generateLoading"
      @ok="handleGenerate"
      ok-text="生成"
      cancel-text="取消"
      :width="440"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" style="margin-top: 16px;">
        <a-form-item label="会计年度">
          <a-input-number
            v-model:value="generateForm.fiscal_year"
            :min="2000"
            :max="2099"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="期间类型">
          <a-radio-group v-model:value="generateForm.period_type">
            <a-radio value="monthly">月度（12个期间）</a-radio>
            <a-radio value="quarterly">季度（4个期间）</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑备注弹窗 -->
    <a-modal
      v-model:open="remarkModalVisible"
      title="编辑备注"
      :confirm-loading="remarkLoading"
      @ok="handleSaveRemark"
      ok-text="保存"
      cancel-text="取消"
      :width="440"
    >
      <a-form style="margin-top: 16px;">
        <a-form-item label="备注">
          <a-textarea
            v-model:value="remarkForm.remark"
            :rows="4"
            placeholder="请输入备注信息"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 修改日期弹窗 -->
    <a-modal
      v-model:open="datesModalVisible"
      title="修改期间日期"
      :confirm-loading="datesLoading"
      @ok="handleSaveDates"
      ok-text="保存"
      cancel-text="取消"
      :width="480"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" style="margin-top: 16px;">
        <a-form-item label="期间名称">
          <span style="font-weight: 500;">{{ datesForm.period_name }}</span>
        </a-form-item>
        <a-form-item label="开始日期" required>
          <a-input
            v-model:value="datesForm.start_date"
            type="date"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item label="结束日期" required>
          <a-input
            v-model:value="datesForm.end_date"
            type="date"
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </a-card>
</template>

<style scoped>
.page-header-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: rgba(0, 0, 0, 0.85);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-bar {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 4px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
}
</style>
