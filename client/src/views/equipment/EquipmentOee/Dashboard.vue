<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import {
  ReloadOutlined, PlusOutlined, DeleteOutlined, ExclamationCircleOutlined,
  CalculatorOutlined, DashboardOutlined
} from '@ant-design/icons-vue'
import {
  getEquipmentOees, saveEquipmentOee, deleteEquipmentOee,
  getOeeDashboard, calculateOeeFromProduction
} from '@/api/equipment/equipmentLife'
import { getEquipments } from '@/api/equipment/equipment'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

interface OeeRecord {
  id: number
  equipment_number: string
  equipment_name?: string
  record_date: string
  shift_id: string | null
  planned_time_minutes: number
  downtime_minutes: number
  actual_run_minutes: number
  ideal_output: number
  actual_output: number
  good_output: number
  availability_rate: number
  performance_rate: number
  quality_rate: number
  oee_rate: number
  data_source: string
  remark: string
}

// 查询参数
const filterEquipmentNumber = ref('')
const filterDateFrom = ref<any>(dayjs().subtract(30, 'day'))
const filterDateTo = ref<any>(dayjs())

// 仪表盘数据
const dashboardData = ref<any>(null)
const dashboardLoading = ref(false)

const fetchDashboard = async () => {
  dashboardLoading.value = true
  try {
    const res = await getOeeDashboard({
      date_from: filterDateFrom.value ? dayjs(filterDateFrom.value).format('YYYY-MM-DD') : undefined,
      date_to: filterDateTo.value ? dayjs(filterDateTo.value).format('YYYY-MM-DD') : undefined,
      equipment_number: filterEquipmentNumber.value || undefined
    })
    if (res.success) {
      dashboardData.value = res.data
    }
  } catch {}
  finally { dashboardLoading.value = false }
}

// OEE记录列表
const customFetch = async (params: any) => {
  return getEquipmentOees({
    ...params,
    equipment_number: filterEquipmentNumber.value || undefined,
    date_from: filterDateFrom.value ? dayjs(filterDateFrom.value).format('YYYY-MM-DD') : undefined,
    date_to: filterDateTo.value ? dayjs(filterDateTo.value).format('YYYY-MM-DD') : undefined
  })
}

const { loading, dataSource, pagination, fetchData, handleTableChange } = useTableList<OeeRecord>(customFetch)

// 设备列表
const equipmentList = ref<any[]>([])
const fetchEquipments = async () => {
  try {
    const res = await getEquipments({ limit: 999 })
    if (res.success) equipmentList.value = res.data?.items || []
  } catch {}
}

// 新建OEE弹窗
const modalVisible = ref(false)
const modalLoading = ref(false)
const form = reactive({
  equipment_number: '',
  record_date: '',
  shift_id: '',
  planned_time_minutes: 1440,
  downtime_minutes: 0,
  actual_run_minutes: 0,
  ideal_output: 0,
  actual_output: 0,
  good_output: 0,
  data_source: '手动',
  remark: ''
})
const formRecordDate = ref<any>(dayjs())

// 自动计算
const calculating = ref(false)
const handleCalculate = async () => {
  calculating.value = true
  try {
    const res = await calculateOeeFromProduction({
      date: filterDateTo.value ? dayjs(filterDateTo.value).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      equipment_number: filterEquipmentNumber.value || undefined
    })
    if (res.success) { message.success(res.message || '计算完成'); fetchData(); fetchDashboard() }
    else { message.error(res.message || '计算失败') }
  } catch { message.error('计算失败') }
  finally { calculating.value = false }
}

const columns = [
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 120 },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 140 },
  { title: '日期', dataIndex: 'record_date', key: 'record_date', width: 110 },
  { title: '班次', dataIndex: 'shift_id', key: 'shift_id', width: 70 },
  { title: '计划时间', dataIndex: 'planned_time_minutes', key: 'planned_time_minutes', width: 90 },
  { title: '停机时间', dataIndex: 'downtime_minutes', key: 'downtime_minutes', width: 90 },
  { title: '可用率%', dataIndex: 'availability_rate', key: 'availability_rate', width: 90 },
  { title: '性能率%', dataIndex: 'performance_rate', key: 'performance_rate', width: 90 },
  { title: '质量率%', dataIndex: 'quality_rate', key: 'quality_rate', width: 90 },
  { title: 'OEE%', dataIndex: 'oee_rate', key: 'oee_rate', width: 90 },
  { title: '数据来源', dataIndex: 'data_source', key: 'data_source', width: 80 },
  { title: '操作', key: 'action', width: 80, fixed: 'right' as const }
]

const handleCreate = () => {
  Object.assign(form, { equipment_number: '', record_date: '', shift_id: '', planned_time_minutes: 1440, downtime_minutes: 0, actual_run_minutes: 0, ideal_output: 0, actual_output: 0, good_output: 0, data_source: '手动', remark: '' })
  formRecordDate.value = dayjs()
  modalVisible.value = true
}

const handleSubmit = async () => {
  if (!form.equipment_number) { message.warning('请选择设备'); return }
  if (!formRecordDate.value) { message.warning('请选择日期'); return }

  modalLoading.value = true
  try {
    const data = {
      ...form,
      record_date: dayjs(formRecordDate.value).format('YYYY-MM-DD')
    }
    const res = await saveEquipmentOee(data)
    if (res.success) { message.success('保存成功'); modalVisible.value = false; fetchData(); fetchDashboard() }
    else { message.error(res.message || '保存失败') }
  } catch { message.error('保存失败') }
  finally { modalLoading.value = false }
}

const handleDelete = (record: OeeRecord) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定要删除此OEE记录吗？',
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteEquipmentOee(record.id)
        if (res.success) { message.success('删除成功'); fetchData(); fetchDashboard() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// 速率颜色
const rateColor = (val: number) => {
  if (val >= 85) return '#52c41a'
  if (val >= 60) return '#faad14'
  return '#f5222d'
}

const handleSearch = () => { pagination.current = 1; fetchData(); fetchDashboard() }
const handleReset = () => {
  filterEquipmentNumber.value = ''
  filterDateFrom.value = dayjs().subtract(30, 'day')
  filterDateTo.value = dayjs()
  pagination.current = 1
  fetchData()
  fetchDashboard()
}

onMounted(() => {
  fetchEquipments()
  fetchDashboard()
  fetchData()
})
</script>

<template>
  <div class="oee-page">
    <!-- 筛选区 -->
    <a-card :bordered="false" style="margin-bottom: 16px">
      <a-space wrap>
        <a-select v-model:value="filterEquipmentNumber" placeholder="设备编号" allow-clear style="width: 200px" show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
          <a-select-option v-for="eq in equipmentList" :key="eq.equipment_number" :value="eq.equipment_number" :label="eq.equipment_number + ' - ' + eq.equipment_name">
            {{ eq.equipment_number }} - {{ eq.equipment_name }}
          </a-select-option>
        </a-select>
        <a-date-picker v-model:value="filterDateFrom" placeholder="开始日期" />
        <a-date-picker v-model:value="filterDateTo" placeholder="结束日期" />
        <a-button type="primary" @click="handleSearch">查询</a-button>
        <a-button @click="handleReset">
          <template #icon><ReloadOutlined /></template>
          重置
        </a-button>
      </a-space>
    </a-card>

    <!-- KPI 卡片 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :span="6">
        <a-card :bordered="false" :loading="dashboardLoading">
          <a-statistic title="综合OEE" :value="dashboardData?.summary?.avg_oee || 0" :precision="1" suffix="%">
            <template #prefix><DashboardOutlined /></template>
          </a-statistic>
          <div style="margin-top: 8px; height: 4px; background: #f0f0f0; border-radius: 2px">
            <div :style="{ width: Math.min(dashboardData?.summary?.avg_oee || 0, 100) + '%', height: '100%', background: rateColor(dashboardData?.summary?.avg_oee || 0), borderRadius: '2px', transition: 'all 0.3s' }"></div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" :loading="dashboardLoading">
          <a-statistic title="可用率" :value="dashboardData?.summary?.avg_availability || 0" :precision="1" suffix="%">
            <template #prefix><span style="color: #1890ff">A</span></template>
          </a-statistic>
          <div style="margin-top: 8px; height: 4px; background: #f0f0f0; border-radius: 2px">
            <div :style="{ width: Math.min(dashboardData?.summary?.avg_availability || 0, 100) + '%', height: '100%', background: rateColor(dashboardData?.summary?.avg_availability || 0), borderRadius: '2px', transition: 'all 0.3s' }"></div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" :loading="dashboardLoading">
          <a-statistic title="性能率" :value="dashboardData?.summary?.avg_performance || 0" :precision="1" suffix="%">
            <template #prefix><span style="color: #52c41a">P</span></template>
          </a-statistic>
          <div style="margin-top: 8px; height: 4px; background: #f0f0f0; border-radius: 2px">
            <div :style="{ width: Math.min(dashboardData?.summary?.avg_performance || 0, 100) + '%', height: '100%', background: rateColor(dashboardData?.summary?.avg_performance || 0), borderRadius: '2px', transition: 'all 0.3s' }"></div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :bordered="false" :loading="dashboardLoading">
          <a-statistic title="质量率" :value="dashboardData?.summary?.avg_quality || 0" :precision="1" suffix="%">
            <template #prefix><span style="color: #722ed1">Q</span></template>
          </a-statistic>
          <div style="margin-top: 8px; height: 4px; background: #f0f0f0; border-radius: 2px">
            <div :style="{ width: Math.min(dashboardData?.summary?.avg_quality || 0, 100) + '%', height: '100%', background: rateColor(dashboardData?.summary?.avg_quality || 0), borderRadius: '2px', transition: 'all 0.3s' }"></div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 设备OEE排行 -->
    <a-card title="设备OEE排行" :bordered="false" style="margin-bottom: 16px" :loading="dashboardLoading">
      <a-table
        v-if="dashboardData?.by_equipment?.length"
        :columns="[
          { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number' },
          { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name' },
          { title: '记录数', dataIndex: 'record_count', key: 'record_count' },
          { title: '可用率%', dataIndex: 'avg_availability', key: 'avg_availability' },
          { title: '性能率%', dataIndex: 'avg_performance', key: 'avg_performance' },
          { title: '质量率%', dataIndex: 'avg_quality', key: 'avg_quality' },
          { title: 'OEE%', dataIndex: 'avg_oee', key: 'avg_oee' }
        ]"
        :data-source="dashboardData?.by_equipment || []"
        :pagination="false"
        row-key="equipment_number"
        size="small"
        bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'avg_oee'">
            <span :style="{ color: rateColor(record.avg_oee), fontWeight: 600 }">
              {{ (record.avg_oee || 0).toFixed(1) }}%
            </span>
          </template>
          <template v-else-if="column.key === 'avg_availability' || column.key === 'avg_performance' || column.key === 'avg_quality'">
            {{ (record[column.dataIndex] || 0).toFixed(1) }}%
          </template>
        </template>
      </a-table>
      <a-empty v-else description="暂无OEE数据" />
    </a-card>

    <!-- OEE记录列表 -->
    <a-card title="OEE记录明细" :bordered="false">
      <template #extra>
        <a-space>
          <a-button @click="handleCalculate" :loading="calculating">
            <template #icon><CalculatorOutlined /></template>
            自动计算
          </a-button>
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            手动录入
          </a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1400 }"
        row-key="id"
        size="middle"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'oee_rate'">
            <span :style="{ color: rateColor(record.oee_rate), fontWeight: 600 }">
              {{ (record.oee_rate || 0).toFixed(1) }}%
            </span>
          </template>
          <template v-else-if="column.key === 'availability_rate'">
            <span :style="{ color: rateColor(record.availability_rate) }">
              {{ (record.availability_rate || 0).toFixed(1) }}%
            </span>
          </template>
          <template v-else-if="column.key === 'performance_rate'">
            <span :style="{ color: rateColor(record.performance_rate) }">
              {{ (record.performance_rate || 0).toFixed(1) }}%
            </span>
          </template>
          <template v-else-if="column.key === 'quality_rate'">
            <span :style="{ color: rateColor(record.quality_rate) }">
              {{ (record.quality_rate || 0).toFixed(1) }}%
            </span>
          </template>
          <template v-else-if="column.key === 'data_source'">
            <a-tag :color="record.data_source === '自动' ? 'blue' : 'green'">{{ record.data_source }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" danger size="small" @click="handleDelete(record)">
              <DeleteOutlined /> 删除
            </a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 手动录入弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      title="手动录入OEE数据"
      :confirm-loading="modalLoading"
      @ok="handleSubmit"
      width="640px"
    >
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="设备编号" required>
          <a-select v-model:value="form.equipment_number" placeholder="请选择设备" show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="eq in equipmentList" :key="eq.equipment_number" :value="eq.equipment_number" :label="eq.equipment_number + ' - ' + eq.equipment_name">
              {{ eq.equipment_number }} - {{ eq.equipment_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="日期" required>
          <a-date-picker v-model:value="formRecordDate" style="width: 100%" />
        </a-form-item>
        <a-form-item label="班次">
          <a-input v-model:value="form.shift_id" placeholder="如：白班/夜班" />
        </a-form-item>
        <a-form-item label="计划时间(分)">
          <a-input-number v-model:value="form.planned_time_minutes" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="停机时间(分)">
          <a-input-number v-model:value="form.downtime_minutes" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="理想产量">
          <a-input-number v-model:value="form.ideal_output" :min="0" :precision="2" style="width: 100%" />
        </a-form-item>
        <a-form-item label="实际产量">
          <a-input-number v-model:value="form.actual_output" :min="0" :precision="2" style="width: 100%" />
        </a-form-item>
        <a-form-item label="合格产量">
          <a-input-number v-model:value="form.good_output" :min="0" :precision="2" style="width: 100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script lang="ts">
import { createVNode } from 'vue'
import { Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
</script>

<style scoped>
.oee-page {
  padding: 0;
}
</style>
