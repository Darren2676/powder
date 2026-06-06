<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, SearchOutlined, ExclamationCircleOutlined,
  EyeOutlined, StopOutlined, DeleteOutlined
} from '@ant-design/icons-vue'
import { createVNode } from 'vue'
import { getMRPRuns, getMRPRunDetail, cancelMRPRun, deleteMRPRun } from '@/api/planning/mrp'
import { useModalDrag } from '@/composables/useModalDrag'

const router = useRouter()
const loading = ref(false)
const runList = ref<any[]>([])
const total = ref(0)

const filterForm = reactive({
  search: '',
  run_status: '',
  page: 1,
  limit: 20
})

// 详情弹窗
const detailVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const detailLoading = ref(false)
const detailRun = ref<any>(null)
const detailList = ref<any[]>([])
const detailActiveTab = ref('all')

const columns = [
  { title: 'MRP运算编号', dataIndex: 'mrp_run_number', key: 'mrp_run_number', width: 160 },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '状态', dataIndex: 'run_status', key: 'run_status', width: 90, align: 'center' as const },
  { title: '计划数量', dataIndex: 'plan_count', key: 'plan_count', width: 80, align: 'center' as const },
  { title: '明细行数', dataIndex: 'detail_count', key: 'detail_count', width: 80, align: 'center' as const },
  { title: '运算时间', dataIndex: 'created_at', key: 'created_at', width: 160 },
  { title: '确认时间', dataIndex: 'confirmed_at', key: 'confirmed_at', width: 160 },
  { title: '创建人', dataIndex: 'created_by', key: 'created_by', width: 100 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const },
]

const detailColumns = [
  { title: 'BOM层', dataIndex: 'bom_level', key: 'bom_level', width: 65, align: 'center' as const },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100, ellipsis: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 55 },
  { title: '类型', dataIndex: 'item_type', key: 'item_type', width: 70 },
  { title: '业务范围', dataIndex: 'business_scope', key: 'business_scope', width: 100 },
  { title: '毛需求', dataIndex: 'gross_requirement', key: 'gross_requirement', width: 90, align: 'right' as const },
  { title: '净需求', dataIndex: 'net_requirement', key: 'net_requirement', width: 90, align: 'right' as const },
  { title: '操作类型', dataIndex: 'action_type', key: 'action_type', width: 100 },
  { title: '生产数量', dataIndex: 'produce_quantity', key: 'produce_quantity', width: 90, align: 'right' as const },
  { title: '采购数量', dataIndex: 'purchase_quantity', key: 'purchase_quantity', width: 90, align: 'right' as const },
  { title: '计划开工', dataIndex: 'planned_start_date', key: 'planned_start_date', width: 100 },
  { title: '计划完工', dataIndex: 'planned_due_date', key: 'planned_due_date', width: 100 },
]

const filteredDetailList = ref<any[]>([])

const updateFilteredDetails = () => {
  if (!detailList.value.length) { filteredDetailList.value = []; return }
  if (detailActiveTab.value === 'all') { filteredDetailList.value = detailList.value; return }
  if (detailActiveTab.value === 'produce') {
    filteredDetailList.value = detailList.value.filter(d => d.action_type === '生产' || d.action_type === '生产+采购')
    return
  }
  if (detailActiveTab.value === 'purchase') {
    filteredDetailList.value = detailList.value.filter(d => d.action_type === '采购' || d.action_type === '生产+采购')
    return
  }
  filteredDetailList.value = detailList.value
}

const loadList = async () => {
  loading.value = true
  try {
    const res: any = await getMRPRuns(filterForm)
    const data = res.data
    runList.value = (data?.items || []).map((r: any) => ({ ...r, key: r.mrp_run_number }))
    total.value = data?.pagination?.total || 0
  } catch { message.error('加载MRP运算记录失败') }
  finally { loading.value = false }
}

const handleSearch = () => {
  filterForm.page = 1
  loadList()
}

const handlePageChange = (page: number, pageSize: number) => {
  filterForm.page = page
  filterForm.limit = pageSize
  loadList()
}

const formatDateTime = (val: any) => {
  if (!val) return '-'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const viewDetail = async (record: any) => {
  detailResetDrag()
  detailVisible.value = true
  detailLoading.value = true
  detailActiveTab.value = 'all'
  try {
    const res: any = await getMRPRunDetail(record.mrp_run_number)
    const data = res.data
    detailRun.value = data?.run || null
    detailList.value = (data?.details || []).map((d: any) => ({ ...d, key: d.id }))
    updateFilteredDetails()
  } catch { message.error('加载MRP运算详情失败') }
  finally { detailLoading.value = false }
}

const handleCancel = (record: any) => {
  Modal.confirm({
    title: '确认取消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确认取消MRP运算 ${record.mrp_run_number} ？取消后将不能再执行。`,
    onOk: async () => {
      try {
        await cancelMRPRun(record.mrp_run_number)
        message.success('已取消')
        loadList()
      } catch (e: any) {
        message.error(e.response?.data?.message || '取消失败')
      }
    }
  })
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确认删除MRP运算 ${record.mrp_run_number} ？删除后数据将不可恢复。`,
    okType: 'danger',
    onOk: async () => {
      try {
        await deleteMRPRun(record.mrp_run_number)
        message.success('已删除')
        loadList()
      } catch (e: any) {
        message.error(e.response?.data?.message || '删除失败')
      }
    }
  })
}

const goToMRP = () => {
  router.push('/mrp')
}

onMounted(() => { loadList() })
</script>

<template>
  <div class="mrp-history-page">
    <a-card title="MRP运算历史" size="small">
      <template #extra>
        <a-space>
          <a-select v-model:value="filterForm.run_status" placeholder="状态筛选" allow-clear style="width: 120px" @change="handleSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="已计算">已计算</a-select-option>
            <a-select-option value="已确认">已确认</a-select-option>
            <a-select-option value="已取消">已取消</a-select-option>
          </a-select>
          <a-input v-model:value="filterForm.search" placeholder="搜索运算编号" allow-clear style="width: 180px" @press-enter="handleSearch">
            <template #prefix><SearchOutlined /></template>
          </a-input>
          <a-button @click="handleSearch"><ReloadOutlined /> 刷新</a-button>
          <a-button type="primary" @click="goToMRP">新建MRP运算</a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="runList"
        :loading="loading"
        row-key="mrp_run_number"
        size="small"
        :scroll="{ x: 1000 }"
        :pagination="{
          current: filterForm.page,
          pageSize: filterForm.limit,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: handlePageChange,
          onShowSizeChange: handlePageChange
        }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'run_status'">
            <a-tag :color="record.run_status === '已确认' ? 'green' : record.run_status === '已取消' ? 'red' : 'orange'">
              {{ record.run_status }}
            </a-tag>
          </template>
          <template v-if="column.key === 'created_at'">{{ formatDateTime(record.created_at) }}</template>
          <template v-if="column.key === 'confirmed_at'">{{ formatDateTime(record.confirmed_at) }}</template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="viewDetail(record)"><EyeOutlined /> 查看</a-button>
              <a-button
                v-if="record.run_status === '已计算'"
                type="link" size="small" danger
                @click="handleCancel(record)"
              ><StopOutlined /> 取消</a-button>
              <a-button
                v-if="record.run_status === '已取消'"
                type="link" size="small" danger
                @click="handleDelete(record)"
              ><DeleteOutlined /> 删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      width="1200px"
      :style="detailModalStyle"
      :footer="null"
    >
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">{{ detailRun ? `MRP运算详情 - ${detailRun.mrp_run_number}` : 'MRP运算详情' }}</div>
      </template>
      <a-spin :spinning="detailLoading">
        <template v-if="detailRun">
          <a-descriptions :column="4" size="small" bordered style="margin-bottom: 12px">
            <a-descriptions-item label="运算编号">{{ detailRun.mrp_run_number }}</a-descriptions-item>
            <a-descriptions-item label="状态">
              <a-tag :color="detailRun.run_status === '已确认' ? 'green' : detailRun.run_status === '已取消' ? 'red' : 'orange'">
                {{ detailRun.run_status }}
              </a-tag>
            </a-descriptions-item>
            <a-descriptions-item label="运算时间">{{ formatDateTime(detailRun.created_at) }}</a-descriptions-item>
            <a-descriptions-item label="确认时间">{{ formatDateTime(detailRun.confirmed_at) }}</a-descriptions-item>
          </a-descriptions>
        </template>

        <a-tabs v-model:activeKey="detailActiveTab" size="small" @change="updateFilteredDetails">
          <a-tab-pane key="all" tab="全部" />
          <a-tab-pane key="produce" tab="生产" />
          <a-tab-pane key="purchase" tab="采购" />
        </a-tabs>

        <a-table
          :columns="detailColumns"
          :data-source="filteredDetailList"
          row-key="id"
          size="small"
          :scroll="{ x: 1500, y: 400 }"
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
      </a-spin>
    </a-modal>
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
.mrp-history-page {
  padding: 0;
}
</style>
