<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, PlusOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownOutlined, DownloadOutlined, CheckOutlined, UndoOutlined,
  ThunderboltOutlined, PlayCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons-vue'
import {
  getEquipmentMaintenancePlans, createEquipmentMaintenancePlan, updateEquipmentMaintenancePlan,
  deleteEquipmentMaintenancePlan, executeMaintenancePlan, completeMaintenancePlan,
  cancelMaintenancePlan, autoGenerateMaintenancePlans, exportEquipmentMaintenancePlans,
  approveEquipmentMaintenancePlan, withdrawEquipmentMaintenancePlan
} from '@/api/equipment/equipmentLife'
import { getEquipments } from '@/api/equipment/equipment'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { APPROVAL_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

interface MaintenancePlan {
  id: number
  plan_number: string
  equipment_number: string
  equipment_name?: string
  maintenance_type: string
  planned_date: string
  actual_date: string | null
  maintenance_items: string
  responsible_person: string
  plan_status: string
  completion_remark: string
  remark: string
  approval_status: string
}

// 查询参数
const filterEquipmentNumber = ref('')
const filterPlanStatus = ref('')
const filterMaintenanceType = ref('')
const filterDateFrom = ref<any>(null)
const filterDateTo = ref<any>(null)

const customFetch = async (params: any) => {
  return getEquipmentMaintenancePlans({
    ...params,
    equipment_number: filterEquipmentNumber.value || undefined,
    plan_status: filterPlanStatus.value || undefined,
    maintenance_type: filterMaintenanceType.value || undefined,
    date_from: filterDateFrom.value ? dayjs(filterDateFrom.value).format('YYYY-MM-DD') : undefined,
    date_to: filterDateTo.value ? dayjs(filterDateTo.value).format('YYYY-MM-DD') : undefined
  })
}

const { loading, dataSource, pagination, fetchData, handleTableChange } = useTableList<MaintenancePlan>(customFetch)

// 设备列表
const equipmentList = ref<any[]>([])
const fetchEquipments = async () => {
  try {
    const res = await getEquipments({ limit: 999 })
    if (res.success) equipmentList.value = res.data?.items || []
  } catch {}
}

const maintenanceTypes = ['定期保养', '专项保养', '临时保养']
const planStatuses = ['待执行', '执行中', '已完成', '已取消']

const planStatusColor: Record<string, string> = {
  '待执行': 'orange',
  '执行中': 'blue',
  '已完成': 'green',
  '已取消': 'default'
}

// 新建/编辑弹窗
const modalVisible = ref(false)
const modalLoading = ref(false)
const isEdit = ref(false)
const editId = ref(0)
const form = reactive({
  plan_number: '',
  equipment_number: '',
  maintenance_type: '定期保养',
  planned_date: '',
  actual_date: '',
  maintenance_items: '',
  responsible_person: '',
  plan_status: '待执行',
  completion_remark: '',
  remark: ''
})
const formPlannedDate = ref<any>(null)
const formActualDate = ref<any>(null)

// 完成弹窗
const completeModalVisible = ref(false)
const completeLoading = ref(false)
const completeId = ref(0)
const completeForm = reactive({ actual_date: '', completion_remark: '' })
const completeActualDate = ref<any>(null)

const columns = [
  { title: '计划编号', dataIndex: 'plan_number', key: 'plan_number', width: 140 },
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 120 },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 140 },
  { title: '保养类型', dataIndex: 'maintenance_type', key: 'maintenance_type', width: 100 },
  { title: '计划日期', dataIndex: 'planned_date', key: 'planned_date', width: 110 },
  { title: '实际日期', dataIndex: 'actual_date', key: 'actual_date', width: 110 },
  { title: '保养项目', dataIndex: 'maintenance_items', key: 'maintenance_items', width: 180, ellipsis: true },
  { title: '负责人', dataIndex: 'responsible_person', key: 'responsible_person', width: 80 },
  { title: '计划状态', dataIndex: 'plan_status', key: 'plan_status', width: 90 },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 90 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const }
]

const formatDate = (date: string | null) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

const handleCreate = () => {
  isEdit.value = false
  Object.assign(form, { plan_number: '', equipment_number: '', maintenance_type: '定期保养', planned_date: '', actual_date: '', maintenance_items: '', responsible_person: '', plan_status: '待执行', completion_remark: '', remark: '' })
  formPlannedDate.value = null
  formActualDate.value = null
  modalVisible.value = true
}

const handleEdit = (record: MaintenancePlan) => {
  isEdit.value = true
  editId.value = record.id
  Object.assign(form, {
    plan_number: record.plan_number,
    equipment_number: record.equipment_number,
    maintenance_type: record.maintenance_type,
    planned_date: record.planned_date,
    actual_date: record.actual_date || '',
    maintenance_items: record.maintenance_items || '',
    responsible_person: record.responsible_person || '',
    plan_status: record.plan_status,
    completion_remark: record.completion_remark || '',
    remark: record.remark || ''
  })
  formPlannedDate.value = record.planned_date ? dayjs(record.planned_date) : null
  formActualDate.value = record.actual_date ? dayjs(record.actual_date) : null
  modalVisible.value = true
}

const handleSubmit = async () => {
  if (!form.equipment_number) { message.warning('请选择设备'); return }
  if (!form.maintenance_type) { message.warning('请选择保养类型'); return }
  if (!formPlannedDate.value) { message.warning('请选择计划日期'); return }

  modalLoading.value = true
  try {
    const data = {
      ...form,
      planned_date: formPlannedDate.value ? dayjs(formPlannedDate.value).format('YYYY-MM-DD') : null,
      actual_date: formActualDate.value ? dayjs(formActualDate.value).format('YYYY-MM-DD') : null
    }
    const res = isEdit.value
      ? await updateEquipmentMaintenancePlan(editId.value, data)
      : await createEquipmentMaintenancePlan(data)
    if (res.success) {
      message.success(isEdit.value ? '修改成功' : '创建成功')
      modalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '操作失败')
    }
  } catch { message.error('操作失败') }
  finally { modalLoading.value = false }
}

const handleDelete = (record: MaintenancePlan) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除保养计划 "${record.plan_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteEquipmentMaintenancePlan(record.id)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// 执行
const handleExecute = async (record: MaintenancePlan) => {
  try {
    const res = await executeMaintenancePlan(record.id)
    if (res.success) { message.success('开始执行'); fetchData() }
    else { message.error(res.message || '操作失败') }
  } catch { message.error('操作失败') }
}

// 完成
const handleCompleteClick = (record: MaintenancePlan) => {
  completeId.value = record.id
  completeForm.actual_date = ''
  completeForm.completion_remark = ''
  completeActualDate.value = dayjs()
  completeModalVisible.value = true
}

const handleCompleteSubmit = async () => {
  completeLoading.value = true
  try {
    const res = await completeMaintenancePlan(completeId.value, {
      actual_date: completeActualDate.value ? dayjs(completeActualDate.value).format('YYYY-MM-DD') : undefined,
      completion_remark: completeForm.completion_remark
    })
    if (res.success) { message.success('保养完成'); completeModalVisible.value = false; fetchData() }
    else { message.error(res.message || '操作失败') }
  } catch { message.error('操作失败') }
  finally { completeLoading.value = false }
}

// 取消
const handleCancel = async (record: MaintenancePlan) => {
  Modal.confirm({
    title: '确认取消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要取消保养计划 "${record.plan_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '返回',
    async onOk() {
      try {
        const res = await cancelMaintenancePlan(record.id)
        if (res.success) { message.success('已取消'); fetchData() }
        else { message.error(res.message || '取消失败') }
      } catch { message.error('取消失败') }
    }
  })
}

// 自动生成
const autoGenerating = ref(false)
const handleAutoGenerate = async () => {
  autoGenerating.value = true
  try {
    const res = await autoGenerateMaintenancePlans()
    if (res.success) { message.success(res.message || '生成完成'); fetchData() }
    else { message.error(res.message || '生成失败') }
  } catch { message.error('自动生成失败') }
  finally { autoGenerating.value = false }
}

const handleExport = async () => {
  try {
    const res = await exportEquipmentMaintenancePlans({
      equipment_number: filterEquipmentNumber.value || undefined,
      plan_status: filterPlanStatus.value || undefined
    })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('maintenance_plans')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleApprove = async (record: MaintenancePlan) => {
  try {
    const res = await approveEquipmentMaintenancePlan(record.id)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

const handleWithdraw = async (record: MaintenancePlan) => {
  try {
    const res = await withdrawEquipmentMaintenancePlan(record.id)
    if (res.success) { message.success('已撤消审核'); fetchData() }
    else { message.error(res.message || '撤消失败') }
  } catch { message.error('撤消失败') }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => {
  filterEquipmentNumber.value = ''
  filterPlanStatus.value = ''
  filterMaintenanceType.value = ''
  filterDateFrom.value = null
  filterDateTo.value = null
  pagination.current = 1
  fetchData()
}

onMounted(() => {
  fetchEquipments()
  fetchData()
})
</script>

<template>
  <div class="maintenance-plan-page">
    <a-card title="设备保养计划" :bordered="false">
      <template #extra>
        <a-space>
          <a-button @click="handleAutoGenerate" :loading="autoGenerating">
            <template #icon><ThunderboltOutlined /></template>
            自动生成
          </a-button>
          <a-button @click="handleExport">
            <template #icon><DownloadOutlined /></template>
            导出
          </a-button>
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
        </a-space>
      </template>

      <!-- 筛选区 -->
      <div style="margin-bottom: 16px">
        <a-space wrap>
          <a-select v-model:value="filterEquipmentNumber" placeholder="设备编号" allow-clear style="width: 180px" show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="eq in equipmentList" :key="eq.equipment_number" :value="eq.equipment_number" :label="eq.equipment_number + ' - ' + eq.equipment_name">
              {{ eq.equipment_number }} - {{ eq.equipment_name }}
            </a-select-option>
          </a-select>
          <a-select v-model:value="filterPlanStatus" placeholder="计划状态" allow-clear style="width: 120px">
            <a-select-option v-for="s in planStatuses" :key="s" :value="s">{{ s }}</a-select-option>
          </a-select>
          <a-select v-model:value="filterMaintenanceType" placeholder="保养类型" allow-clear style="width: 120px">
            <a-select-option v-for="t in maintenanceTypes" :key="t" :value="t">{{ t }}</a-select-option>
          </a-select>
          <a-date-picker v-model:value="filterDateFrom" placeholder="开始日期" />
          <a-date-picker v-model:value="filterDateTo" placeholder="结束日期" />
          <a-button @click="handleReset">
            <template #icon><ReloadOutlined /></template>
            重置
          </a-button>
          <a-button type="primary" @click="handleSearch">查询</a-button>
        </a-space>
      </div>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1600 }"
        row-key="id"
        size="middle"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'planned_date'">
            {{ formatDate(record.planned_date) }}
          </template>
          <template v-else-if="column.key === 'actual_date'">
            {{ formatDate(record.actual_date) }}
          </template>
          <template v-else-if="column.key === 'plan_status'">
            <a-tag :color="planStatusColor[record.plan_status] || 'default'">
              {{ record.plan_status }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'maintenance_type'">
            <a-tag :color="record.maintenance_type === '定期保养' ? 'blue' : record.maintenance_type === '专项保养' ? 'purple' : 'orange'">
              {{ record.maintenance_type }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="record.approval_status === APPROVAL_STATUS.APPROVED ? 'green' : 'orange'">
              {{ record.approval_status || APPROVAL_STATUS.UNAPPROVED }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button v-if="record.plan_status === '待执行'" type="link" size="small" @click="handleExecute(record)">
                <PlayCircleOutlined /> 执行
              </a-button>
              <a-button v-if="record.plan_status === '执行中'" type="link" size="small" @click="handleCompleteClick(record)">
                <CheckOutlined /> 完成
              </a-button>
              <a-button v-if="record.plan_status === '待执行' || record.plan_status === '执行中'" type="link" size="small" danger @click="handleCancel(record)">
                <CloseCircleOutlined /> 取消
              </a-button>
              <a-dropdown>
                <a-button type="link" size="small">
                  更多<DownOutlined />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="handleEdit(record)">修改</a-menu-item>
                    <a-menu-item v-if="record.approval_status !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">
                      <CheckOutlined /> 审核
                    </a-menu-item>
                    <a-menu-item v-if="record.approval_status === APPROVAL_STATUS.APPROVED" @click="handleWithdraw(record)">
                      <UndoOutlined /> 撤消
                    </a-menu-item>
                    <a-menu-item @click="handleDelete(record)">
                      <DeleteOutlined /> 删除
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑保养计划' : '新建保养计划'"
      :confirm-loading="modalLoading"
      @ok="handleSubmit"
      width="640px"
    >
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item v-if="isEdit" label="计划编号">
          <span>{{ form.plan_number }}</span>
        </a-form-item>
        <a-form-item label="设备编号" required>
          <a-select v-if="!isEdit" v-model:value="form.equipment_number" placeholder="请选择设备" show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="eq in equipmentList" :key="eq.equipment_number" :value="eq.equipment_number" :label="eq.equipment_number + ' - ' + eq.equipment_name">
              {{ eq.equipment_number }} - {{ eq.equipment_name }}
            </a-select-option>
          </a-select>
          <span v-else>{{ form.equipment_number }}</span>
        </a-form-item>
        <a-form-item label="保养类型" required>
          <a-select v-model:value="form.maintenance_type" placeholder="请选择保养类型">
            <a-select-option v-for="t in maintenanceTypes" :key="t" :value="t">{{ t }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="计划日期" required>
          <a-date-picker v-model:value="formPlannedDate" style="width: 100%" placeholder="请选择计划日期" />
        </a-form-item>
        <a-form-item label="保养项目">
          <a-textarea v-model:value="form.maintenance_items" :rows="3" placeholder="请输入保养项目" />
        </a-form-item>
        <a-form-item label="负责人">
          <a-input v-model:value="form.responsible_person" placeholder="请输入负责人" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="form.remark" :rows="2" placeholder="请输入备注" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 完成弹窗 -->
    <a-modal
      v-model:open="completeModalVisible"
      title="完成保养"
      :confirm-loading="completeLoading"
      @ok="handleCompleteSubmit"
      width="480px"
    >
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 17 }">
        <a-form-item label="实际日期">
          <a-date-picker v-model:value="completeActualDate" style="width: 100%" placeholder="请选择实际完成日期" />
        </a-form-item>
        <a-form-item label="完成备注">
          <a-textarea v-model:value="completeForm.completion_remark" :rows="3" placeholder="请输入完成备注" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.maintenance-plan-page {
  padding: 0;
}
</style>
