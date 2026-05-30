<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { useModalDrag } from '@/composables/useModalDrag'
import {
  ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
  ExclamationCircleOutlined, ReloadOutlined,
} from '@ant-design/icons-vue'
import {
  getLifecycleDetail, updateLifecycle, updateLifecycleStatus,
  createLog, updateLog, deleteLog,
} from '@/api/master-data/engineeringChange'
import { getRoutingHeaders } from '@/api/master-data/routingMaster'
import { getBomHeaders } from '@/api/master-data/bom'
import { getSampleRequests } from '@/api/sales/sampleRequest'
import { getUsers } from '@/api/system/user'

defineOptions({ name: 'EngineeringChangeDetail' })

const route = useRoute()
const router = useRouter()

const lifecycleId = computed(() => Number(route.params.id))

const CHANGE_TYPES = ['样件通过', '客户要求变更', '工艺调整', '其他']
const LIFECYCLE_STATUS_OPTIONS = ['进行中', '已完成', '已关闭']

interface Header {
  id?: number
  product_number?: string
  product_name?: string
  customer_number?: string
  customer_name?: string
  origin_sample_request_no?: string
  sample_pass_date?: string
  lifecycle_status?: string
  change_count?: number
  latest_change_type?: string
  latest_change_at?: string
  remark?: string
  created_by?: string
  created_at?: string
  updated_by?: string
  updated_at?: string
}

interface ChangeLog {
  id?: number
  lifecycle_id?: number
  change_seq?: number
  change_date?: string
  change_type?: string
  change_summary?: string
  change_detail?: string
  before_value?: string
  after_value?: string
  related_sample_request_no?: string
  related_routing_id?: string
  related_bom_id?: string
  handled_by?: string
  attachment_url?: string
}

const header = ref<Header>({})
const logs = ref<ChangeLog[]>([])
const loading = ref(false)

// 下拉选项
const sampleRequestOptions = ref<{ label: string; value: string }[]>([])
const routingOptions = ref<{ label: string; value: string }[]>([])
const bomOptions = ref<{ label: string; value: string }[]>([])
const userOptions = ref<{ label: string; value: string }[]>([])

const fetchSampleRequests = async () => {
  try {
    const res: any = await getSampleRequests({ page: 1, limit: 9999 })
    const list = res?.data?.items || []
    sampleRequestOptions.value = list.map((x: any) => ({
      label: `${x.request_number}${x.customer_name ? ' - ' + x.customer_name : ''}`,
      value: x.request_number,
    }))
  } catch {}
}

const fetchRoutings = async () => {
  try {
    const res: any = await getRoutingHeaders({ page: 1, limit: 9999 })
    const list = res?.data?.items || []
    routingOptions.value = list.map((x: any) => ({
      label: x.process_route_name ? `${x.process_route_number} - ${x.process_route_name}` : x.process_route_number,
      value: x.process_route_number,
    })).filter((x: any) => x.value)
  } catch {}
}

const fetchBoms = async () => {
  try {
    const res: any = await getBomHeaders({ page: 1, limit: 9999 })
    const list = res?.data?.items || []
    bomOptions.value = list.map((x: any) => ({
      label: x.bom_name ? `${x.bom_number} - ${x.bom_name}` : x.bom_number,
      value: x.bom_number,
    })).filter((x: any) => x.value)
  } catch {}
}

const fetchUsers = async () => {
  try {
    const res: any = await getUsers({ page: 1, limit: 9999 })
    const list = res?.data?.items || []
    userOptions.value = list.map((x: any) => ({
      label: x.real_name ? `${x.username} - ${x.real_name}` : x.username,
      value: x.username,
    }))
  } catch {}
}

// 加载主表+履历
const fetchDetail = async () => {
  if (!lifecycleId.value) return
  loading.value = true
  try {
    const res: any = await getLifecycleDetail(lifecycleId.value)
    if (res?.success) {
      header.value = res.data.header || {}
      logs.value = res.data.logs || []
    } else {
      message.error(res?.message || '加载失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 状态切换
const handleChangeStatus = (target: string) => {
  if (header.value.lifecycle_status === target) return
  Modal.confirm({
    title: '确认变更状态',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定将状态更新为「${target}」？`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await updateLifecycleStatus(lifecycleId.value, target)
        if (res?.success) { message.success('状态更新成功'); fetchDetail() }
        else { message.error(res?.message || '更新失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '更新失败')
      }
    },
  })
}

const statusColor = (s?: string) => {
  if (s === '进行中') return 'processing'
  if (s === '已完成') return 'success'
  if (s === '已关闭') return 'default'
  return 'default'
}

const changeTypeColor = (t?: string) => {
  if (t === '样件通过') return 'green'
  if (t === '客户要求变更') return 'orange'
  if (t === '工艺调整') return 'blue'
  return 'default'
}

// 编辑主表（基础信息）
const headerEditVisible = ref(false)
const headerForm = reactive<Header>({})
const openHeaderEdit = () => {
  Object.assign(headerForm, header.value)
  headerEditVisible.value = true
}
const handleHeaderSave = async () => {
  try {
    const res: any = await updateLifecycle(lifecycleId.value, headerForm)
    if (res?.success) {
      message.success('更新成功')
      headerEditVisible.value = false
      fetchDetail()
    } else {
      message.error(res?.message || '更新失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '更新失败')
  }
}

// 变更日志：新增/编辑弹窗
const logModalVisible = ref(false)
const logModalMode = ref<'create' | 'edit'>('create')
const logForm = reactive<ChangeLog>({})

const resetLogForm = () => {
  Object.keys(logForm).forEach((k) => { (logForm as any)[k] = undefined })
}

const { modalStyle: logModalStyle, onDragStart: onLogDragStart, resetDrag: resetLogDrag } = useModalDrag()

const openCreateLog = () => {
  resetLogForm()
  logForm.change_date = new Date().toISOString().slice(0, 10)
  logForm.change_type = '客户要求变更'
  logModalMode.value = 'create'
  logModalVisible.value = true
  resetLogDrag()
}

const openEditLog = (record: ChangeLog) => {
  resetLogForm()
  Object.assign(logForm, record)
  if (logForm.change_date) logForm.change_date = String(logForm.change_date).slice(0, 10)
  logModalMode.value = 'edit'
  logModalVisible.value = true
  resetLogDrag()
}

const handleLogSave = async () => {
  if (!logForm.change_date) { message.error('请选择变更日期'); return }
  if (!logForm.change_type) { message.error('请选择变更类型'); return }
  if (!logForm.change_summary) { message.error('请填写变更摘要'); return }
  try {
    let res: any
    if (logModalMode.value === 'create') {
      res = await createLog(lifecycleId.value, logForm)
    } else {
      res = await updateLog(lifecycleId.value, logForm.id!, logForm)
    }
    if (res?.success) {
      message.success(logModalMode.value === 'create' ? '新增成功' : '更新成功')
      logModalVisible.value = false
      fetchDetail()
    } else {
      message.error(res?.message || '保存失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '保存失败')
  }
}

const handleDeleteLog = (record: ChangeLog) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除这条变更日志吗？`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await deleteLog(lifecycleId.value, record.id!)
        if (res?.success) { message.success('删除成功'); fetchDetail() }
        else { message.error(res?.message || '删除失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '删除失败')
      }
    },
  })
}

const logColumns = [
  { title: '序号', dataIndex: 'change_seq', key: 'change_seq', width: 80 },
  { title: '变更日期', dataIndex: 'change_date', key: 'change_date', width: 120 },
  { title: '变更类型', dataIndex: 'change_type', key: 'change_type', width: 130 },
  { title: '摘要', dataIndex: 'change_summary', key: 'change_summary', width: 220 },
  { title: '变更前', dataIndex: 'before_value', key: 'before_value', width: 200, ellipsis: true },
  { title: '变更后', dataIndex: 'after_value', key: 'after_value', width: 200, ellipsis: true },
  { title: '关联样品单', dataIndex: 'related_sample_request_no', key: 'related_sample_request_no', width: 140 },
  { title: '关联工艺路线', dataIndex: 'related_routing_id', key: 'related_routing_id', width: 140 },
  { title: '关联BOM', dataIndex: 'related_bom_id', key: 'related_bom_id', width: 140 },
  { title: '处理人', dataIndex: 'handled_by', key: 'handled_by', width: 100 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const },
]

const formatDateTime = (v?: string) => v ? String(v).slice(0, 19).replace('T', ' ') : '-'
const formatDate = (v?: string) => v ? String(v).slice(0, 10) : '-'

onMounted(() => {
  fetchDetail()
  fetchSampleRequests()
  fetchRoutings()
  fetchBoms()
  fetchUsers()
})
</script>

<template>
  <div>
    <a-card :bordered="false">
      <!-- 顶部条 -->
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap">
        <a-space>
          <a-button @click="router.back()">
            <template #icon><ArrowLeftOutlined /></template>返回
          </a-button>
          <span style="font-size: 18px; font-weight: 600">工程更改详情</span>
          <a-tag :color="statusColor(header.lifecycle_status)">{{ header.lifecycle_status || '-' }}</a-tag>
        </a-space>
        <a-space>
          <a-button @click="fetchDetail">
            <template #icon><ReloadOutlined /></template>刷新
          </a-button>
          <a-button @click="openHeaderEdit">
            <template #icon><EditOutlined /></template>编辑基础信息
          </a-button>
          <a-dropdown>
            <a-button type="primary">状态切换</a-button>
            <template #overlay>
              <a-menu>
                <a-menu-item v-for="s in LIFECYCLE_STATUS_OPTIONS" :key="s"
                  :disabled="header.lifecycle_status === s" @click="handleChangeStatus(s)">
                  置为：{{ s }}
                </a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </a-space>
      </div>

      <!-- 基础信息 -->
      <a-descriptions :column="3" bordered size="small">
        <a-descriptions-item label="产品编号">{{ header.product_number || '-' }}</a-descriptions-item>
        <a-descriptions-item label="产品名称">{{ header.product_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="客户">{{ header.customer_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="起源样品单号">{{ header.origin_sample_request_no || '-' }}</a-descriptions-item>
        <a-descriptions-item label="样件通过日期">{{ formatDate(header.sample_pass_date) }}</a-descriptions-item>
        <a-descriptions-item label="变更次数">{{ header.change_count ?? 0 }}</a-descriptions-item>
        <a-descriptions-item label="最近变更类型">{{ header.latest_change_type || '-' }}</a-descriptions-item>
        <a-descriptions-item label="最近变更时间">{{ formatDateTime(header.latest_change_at) }}</a-descriptions-item>
        <a-descriptions-item label="创建人">{{ header.created_by || '-' }}</a-descriptions-item>
        <a-descriptions-item label="备注" :span="3">{{ header.remark || '-' }}</a-descriptions-item>
      </a-descriptions>

      <a-divider />

      <!-- 变更履历 -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px">
        <span style="font-size: 16px; font-weight: 600">变更履历</span>
        <a-button type="primary" @click="openCreateLog">
          <template #icon><PlusOutlined /></template>新增变更
        </a-button>
      </div>

      <a-tabs default-active-key="timeline">
        <a-tab-pane key="timeline" tab="时间轴视图">
          <a-empty v-if="!logs.length" description="暂无变更记录" />
          <a-timeline v-else mode="left">
            <a-timeline-item v-for="lg in logs" :key="lg.id" :color="changeTypeColor(lg.change_type)">
              <template #label>
                <span style="font-weight: 600">{{ formatDate(lg.change_date) }}</span>
                <span style="margin-left: 8px; color: #888">#{{ lg.change_seq }}</span>
              </template>
              <div style="padding: 4px 0">
                <a-tag :color="changeTypeColor(lg.change_type)">{{ lg.change_type }}</a-tag>
                <strong style="margin-left: 8px">{{ lg.change_summary }}</strong>
              </div>
              <div v-if="lg.change_detail" style="white-space: pre-wrap; color: #555; margin-top: 4px">{{ lg.change_detail }}</div>
              <div v-if="lg.before_value || lg.after_value" style="margin-top: 6px; font-size: 12px; color: #666">
                <span v-if="lg.before_value">变更前：{{ lg.before_value }}</span>
                <span v-if="lg.before_value && lg.after_value" style="margin: 0 8px">→</span>
                <span v-if="lg.after_value">变更后：{{ lg.after_value }}</span>
              </div>
              <div style="margin-top: 6px; font-size: 12px; color: #888">
                <span v-if="lg.handled_by">处理人：{{ lg.handled_by }}</span>
                <span v-if="lg.related_sample_request_no" style="margin-left: 8px">样品单：{{ lg.related_sample_request_no }}</span>
                <span v-if="lg.related_routing_id" style="margin-left: 8px">工艺路线：{{ lg.related_routing_id }}</span>
                <span v-if="lg.related_bom_id" style="margin-left: 8px">BOM：{{ lg.related_bom_id }}</span>
              </div>
              <div style="margin-top: 6px">
                <a-button type="link" size="small" @click="openEditLog(lg)">编辑</a-button>
                <a-button type="link" size="small" danger @click="handleDeleteLog(lg)">删除</a-button>
              </div>
            </a-timeline-item>
          </a-timeline>
        </a-tab-pane>
        <a-tab-pane key="table" tab="表格视图">
          <a-table
            :columns="logColumns" :data-source="logs" :loading="loading"
            :row-key="(record: ChangeLog) => record.id!"
            :pagination="false" :scroll="{ x: 'max-content' }" size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'change_date'">{{ formatDate(record.change_date) }}</template>
              <template v-else-if="column.key === 'change_type'">
                <a-tag :color="changeTypeColor(record.change_type)">{{ record.change_type }}</a-tag>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="4">
                  <a-button type="link" size="small" @click="openEditLog(record)">编辑</a-button>
                  <a-divider type="vertical" />
                  <a-button type="link" size="small" danger @click="handleDeleteLog(record)">删除</a-button>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- 编辑基础信息弹窗 -->
    <a-modal v-model:open="headerEditVisible" title="编辑基础信息" width="700px"
      @ok="handleHeaderSave" okText="保存" cancelText="取消">
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="产品编号"><a-input :value="headerForm.product_number" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="产品名称"><a-input v-model:value="headerForm.product_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="客户编号"><a-input v-model:value="headerForm.customer_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="客户名称"><a-input v-model:value="headerForm.customer_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="起源样品单号">
              <a-select v-model:value="headerForm.origin_sample_request_no" show-search allow-clear placeholder="可选"
                :options="sampleRequestOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="样件通过日期">
              <a-date-picker v-model:value="headerForm.sample_pass_date" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="备注" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }">
              <a-textarea v-model:value="headerForm.remark" :rows="3" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 新增/编辑变更日志 -->
    <a-modal v-model:open="logModalVisible"
      width="780px" @ok="handleLogSave" okText="保存" cancelText="取消"
      :style="logModalStyle">
      <template #title>
        <div class="drag-handle" @mousedown="onLogDragStart">{{ logModalMode === 'create' ? '新增变更日志' : '编辑变更日志' }}</div>
      </template>
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 17 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="变更日期" required>
              <a-date-picker v-model:value="logForm.change_date" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="变更类型" required>
              <a-select v-model:value="logForm.change_type">
                <a-select-option v-for="t in CHANGE_TYPES" :key="t" :value="t">{{ t }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="变更摘要" required :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }">
              <a-input v-model:value="logForm.change_summary" placeholder="一句话概括本次变更" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="变更详情" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }">
              <a-textarea v-model:value="logForm.change_detail" :rows="3" placeholder="可填写详细说明" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="变更前"><a-textarea v-model:value="logForm.before_value" :rows="2" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="变更后"><a-textarea v-model:value="logForm.after_value" :rows="2" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="关联样品单">
              <a-select v-model:value="logForm.related_sample_request_no" show-search allow-clear placeholder="可选"
                :options="sampleRequestOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="关联工艺路线">
              <a-select v-model:value="logForm.related_routing_id" show-search allow-clear placeholder="可选"
                :options="routingOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="关联BOM">
              <a-select v-model:value="logForm.related_bom_id" show-search allow-clear placeholder="可选"
                :options="bomOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="处理人">
              <a-select v-model:value="logForm.handled_by" show-search allow-clear placeholder="输入搜索用户"
                :options="userOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="附件URL" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }">
              <a-input v-model:value="logForm.attachment_url" placeholder="可选，记录附件链接" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
