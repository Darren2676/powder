<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  EyeOutlined, DeleteOutlined
} from '@ant-design/icons-vue'
import {
  getProductionInspections, getProductionInspectionDetail,
  updateProductionInspection, completeInspection, defectHandling,
  deleteProductionInspection,
  exportProductionInspections
} from '@/api/quality/productionInspection'
import { generateExportFilename } from '@/utils/exportFilename'

defineOptions({ name: 'ProductionInspectionList' })

// ==================== State ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterType = ref<string | undefined>(undefined)
const filterResult = ref<string | undefined>(undefined)
const filterStatus = ref<string | undefined>(undefined)
const pagination = reactive({ current: 1, pageSize: 15, total: 0 })

// ==================== Detail Modal ====================
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailRecord = ref<any>({})
const detailItems = ref<any[]>([])

// ==================== Inspect Modal (填写检验结果) ====================
const inspectVisible = ref(false)
const inspectLoading = ref(false)
const inspectRecord = ref<any>({})
const inspectItems = ref<any[]>([])

// ==================== Defect Modal ====================
const defectVisible = ref(false)
const defectRecord = ref<any>({})
const defectForm = reactive({
  handling_method: '' as string,
  rework_target_step: '' as string,
  scrap_quantity: 0 as number,
  concession_quantity: 0 as number,
  remark: ''
})

// ==================== Columns ====================
const columns = [
  { title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const },
  { title: '检验单号', dataIndex: 'inspection_number', key: 'inspection_number', width: 180 },
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 140 },
  { title: '工序序号', dataIndex: 'step_number', key: 'step_number', width: 80 },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 120 },
  { title: '检验类型', dataIndex: 'inspect_type', key: 'inspect_type', width: 90 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '报工数量', dataIndex: 'total_quantity', key: 'total_quantity', width: 90 },
  { title: '检验方案', dataIndex: 'inspection_plan_name', key: 'inspection_plan_name', width: 120 },
  { title: '检验规范', dataIndex: 'inspection_spec_name', key: 'inspection_spec_name', width: 120 },
  { title: '检验结果', key: 'inspection_result', width: 90 },
  { title: '合格数量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 90 },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 100 },
  { title: '状态', key: 'status', width: 90 },
  { title: '不合格处理', dataIndex: 'defect_handling', key: 'defect_handling', width: 100 },
  { title: '检验人', dataIndex: 'inspector_name', key: 'inspector_name', width: 90 },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '操作', key: 'action', width: 180, fixed: 'right' as const }
]

const inspectItemColumns = [
  { title: '序号', key: 'rowIndex', width: 50 },
  { title: '质量特性', dataIndex: 'char_name', key: 'char_name', width: 150 },
  { title: '检验方法', dataIndex: 'inspect_requirement', key: 'inspect_requirement', width: 120 },
  { title: '标准值', dataIndex: 'standard_value', key: 'standard_value', width: 100 },
  { title: '上限', dataIndex: 'upper_limit', key: 'upper_limit', width: 80 },
  { title: '下限', dataIndex: 'lower_limit', key: 'lower_limit', width: 80 },
  { title: '实测值', key: 'actual_value', width: 120 },
  { title: '判定', key: 'item_result', width: 80 }
]

// ==================== CRUD ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getProductionInspections({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value || undefined,
      inspect_type: filterType.value || undefined,
      inspection_result: filterResult.value || undefined,
      status: filterStatus.value || undefined
    })
    dataSource.value = res.data.items || []
    pagination.total = res.data.pagination?.total || 0
  } catch { message.error('获取检验列表失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchList() }
const handleReset = () => {
  searchText.value = ''; filterType.value = undefined
  filterResult.value = undefined; filterStatus.value = undefined
  pagination.current = 1; fetchList()
}
const handleTableChange = (pag: any) => {
  pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchList()
}

// ==================== Detail ====================
const handleDetail = async (record: any) => {
  detailRecord.value = { ...record }
  detailItems.value = []
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res = await getProductionInspectionDetail(record.inspection_number)
    const data = res.data || {}
    detailRecord.value = data
    detailItems.value = data.items || []
  } catch { message.error('加载详情失败') }
  finally { detailLoading.value = false }
}

// ==================== Inspect (填写检验) ====================
const openInspect = async (record: any) => {
  inspectRecord.value = { ...record }
  inspectItems.value = []
  inspectVisible.value = true
  inspectLoading.value = true
  try {
    const res = await getProductionInspectionDetail(record.inspection_number)
    const data = res.data || {}
    inspectRecord.value = data
    inspectItems.value = (data.items || []).map((item: any) => ({ ...item, actual_value: item.actual_value || '' }))
  } catch { message.error('加载检验详情失败') }
  finally { inspectLoading.value = false }
}

const handleInspectOk = async () => {
  try {
    await updateProductionInspection(inspectRecord.value.inspection_number, {
      items: inspectItems.value.map((item: any) => ({
        id: item.id,
        actual_value: item.actual_value
      }))
    })
    message.success('检验数据已保存')
    inspectVisible.value = false
    fetchList()
  } catch { message.error('保存检验数据失败') }
}

// ==================== Complete Inspection ====================
const handleComplete = (record: any) => {
  Modal.confirm({
    title: '完成检验', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要完成检验单「${record.inspection_number}」的检验吗？系统将自动判定合格/不合格。`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await completeInspection(record.inspection_number)
        message.success('检验已完成')
        fetchList()
      } catch (e: any) {
        message.error(e.response?.data?.error || '完成检验失败')
      }
    }
  })
}

// ==================== Defect Handling ====================
const openDefectHandling = (record: any) => {
  defectRecord.value = { ...record }
  defectForm.handling_method = ''
  defectForm.rework_target_step = ''
  defectForm.scrap_quantity = record.unqualified_quantity || 0
  defectForm.concession_quantity = record.unqualified_quantity || 0
  defectForm.remark = ''
  defectVisible.value = true
}

const handleDefectOk = async () => {
  if (!defectForm.handling_method) { message.warning('请选择处理方式'); return }
  try {
    await defectHandling(defectRecord.value.inspection_number, { ...defectForm })
    message.success('不合格品处理完成')
    defectVisible.value = false
    fetchList()
  } catch (e: any) {
    message.error(e.response?.data?.error || '处理失败')
  }
}

// ==================== Delete Inspection ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '删除检验记录',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除检验单「${record.inspection_number}」吗？删除后关联工序的检验状态将被清除。仅允许删除「待检」或「检验中」状态的记录。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteProductionInspection(record.inspection_number)
        message.success('检验记录已删除')
        fetchList()
      } catch (e: any) {
        message.error(e.response?.data?.message || '删除失败')
      }
    }
  })
}

// ==================== Export ====================
const handleExport = async () => {
  try {
    const res = await exportProductionInspections()
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('production_inspections', 'xlsx')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

// ==================== Helpers ====================
const getResultColor = (result: string) => {
  if (result === '合格') return 'green'
  if (result === '不合格') return 'red'
  return 'default'
}
const getStatusColor = (status: string) => {
  if (status === '待检') return 'orange'
  if (status === '检验中') return 'processing'
  if (status === '已完成') return 'green'
  if (status === '已处理') return 'blue'
  return 'default'
}
const isItemPass = (item: any): boolean => {
  if (!item.actual_value) return true
  const actual = parseFloat(item.actual_value)
  if (isNaN(actual)) return true
  if (item.upper_limit != null && actual > parseFloat(item.upper_limit)) return false
  if (item.lower_limit != null && actual < parseFloat(item.lower_limit)) return false
  return true
}

onMounted(() => { fetchList() })
</script>

<template>
  <div>
    <a-card title="生产检验管理" :bordered="false">
      <template #extra>
        <a-space wrap>
          <a-input-search v-model:value="searchText" placeholder="搜索检验单号/生产单号" style="width: 220px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
          <a-select v-model:value="filterType" placeholder="检验类型" style="width: 100px" allowClear @change="handleSearch">
            <a-select-option value="自检">自检</a-select-option>
            <a-select-option value="专检">专检</a-select-option>
          </a-select>
          <a-select v-model:value="filterResult" placeholder="检验结果" style="width: 100px" allowClear @change="handleSearch">
            <a-select-option value="合格">合格</a-select-option>
            <a-select-option value="不合格">不合格</a-select-option>
          </a-select>
          <a-select v-model:value="filterStatus" placeholder="状态" style="width: 100px" allowClear @change="handleSearch">
            <a-select-option value="待检">待检</a-select-option>
            <a-select-option value="检验中">检验中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
            <a-select-option value="已处理">已处理</a-select-option>
          </a-select>
          <a-button @click="handleReset"><ReloadOutlined />重置</a-button>
          <a-button @click="handleExport"><DownloadOutlined />导出</a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns" :data-source="dataSource" :loading="loading"
        row-key="inspection_number" :pagination="pagination"
        :scroll="{ x: 2000, y: 'calc(100vh - 300px)' }"
        @change="handleTableChange" size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'inspect_type'">
            <a-tag :color="record.inspect_type === '自检' ? 'blue' : 'green'">{{ record.inspect_type }}</a-tag>
          </template>
          <template v-else-if="column.key === 'inspection_result'">
            <a-tag v-if="record.inspection_result" :color="getResultColor(record.inspection_result)">{{ record.inspection_result }}</a-tag>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="getStatusColor(record.status)">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleDetail(record)"><EyeOutlined />详情</a-button>
              <a-button v-if="record.status === '待检' || record.status === '检验中'" type="link" size="small" @click="openInspect(record)"><SearchOutlined />检验</a-button>
              <a-button v-if="record.status === '检验中'" type="link" size="small" @click="handleComplete(record)"><CheckCircleOutlined />完成</a-button>
              <a-button v-if="record.inspection_result === '不合格' && record.status === '已完成'" type="link" danger size="small" @click="openDefectHandling(record)"><CloseCircleOutlined />处理</a-button>
              <a-button v-if="record.status === '待检' || record.status === '检验中'" type="link" danger size="small" @click="handleDelete(record)"><DeleteOutlined />删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== Detail Modal ========== -->
    <a-modal v-model:open="detailVisible" title="检验详情" :footer="null" width="1100px">
      <a-spin :spinning="detailLoading">
        <a-descriptions :column="3" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '110px' }">
          <a-descriptions-item label="检验单号">{{ detailRecord.inspection_number }}</a-descriptions-item>
          <a-descriptions-item label="生产单号">{{ detailRecord.production_order_number }}</a-descriptions-item>
          <a-descriptions-item label="工序序号">{{ detailRecord.step_number }}</a-descriptions-item>
          <a-descriptions-item label="工序名称">{{ detailRecord.standard_process_name }}</a-descriptions-item>
          <a-descriptions-item label="检验类型">
            <a-tag :color="detailRecord.inspect_type === '自检' ? 'blue' : 'green'">{{ detailRecord.inspect_type }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="产品编号">{{ detailRecord.item_number }}</a-descriptions-item>
          <a-descriptions-item label="报工数量">{{ detailRecord.total_quantity }}</a-descriptions-item>
          <a-descriptions-item label="检验方案">{{ detailRecord.inspection_plan_name || '-' }}</a-descriptions-item>
          <a-descriptions-item label="检验规范">{{ detailRecord.inspection_spec_name || '-' }}</a-descriptions-item>
          <a-descriptions-item label="检验结果">
            <a-tag v-if="detailRecord.inspection_result" :color="getResultColor(detailRecord.inspection_result)">{{ detailRecord.inspection_result }}</a-tag>
            <span v-else>-</span>
          </a-descriptions-item>
          <a-descriptions-item label="合格数量">{{ detailRecord.qualified_quantity ?? '-' }}</a-descriptions-item>
          <a-descriptions-item label="不合格数量">{{ detailRecord.unqualified_quantity ?? '-' }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="getStatusColor(detailRecord.status)">{{ detailRecord.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="检验人">{{ detailRecord.inspector_name || '-' }}</a-descriptions-item>
          <a-descriptions-item label="不合格处理">{{ detailRecord.defect_handling || '-' }}</a-descriptions-item>
          <a-descriptions-item label="创建时间" :span="3">{{ detailRecord.creation_date }}</a-descriptions-item>
        </a-descriptions>
        <div v-if="detailItems.length > 0" style="margin-top: 16px;">
          <h4>检验明细项</h4>
          <a-table :data-source="detailItems" :pagination="false" size="small" bordered row-key="id">
            <a-table-column title="质量特性" data-index="char_name" :width="150" />
            <a-table-column title="检验方法" data-index="inspect_requirement" :width="120" />
            <a-table-column title="标准值" data-index="standard_value" :width="100" />
            <a-table-column title="上限" data-index="upper_limit" :width="80" />
            <a-table-column title="下限" data-index="lower_limit" :width="80" />
            <a-table-column title="实测值" data-index="actual_value" :width="100" />
            <a-table-column title="判定" :width="80">
              <template #default="{ record: item }">
                <a-tag v-if="item.result" :color="item.result === '合格' ? 'green' : 'red'">{{ item.result }}</a-tag>
                <span v-else style="color: #ccc;">-</span>
              </template>
            </a-table-column>
          </a-table>
        </div>
      </a-spin>
    </a-modal>

    <!-- ========== Inspect Modal (填写检验) ========== -->
    <a-modal v-model:open="inspectVisible" title="填写检验结果" @ok="handleInspectOk" okText="保存" cancelText="取消" width="1000px">
      <a-spin :spinning="inspectLoading">
        <a-descriptions :column="4" size="small" style="margin-bottom: 12px;">
          <a-descriptions-item label="检验单号">{{ inspectRecord.inspection_number }}</a-descriptions-item>
          <a-descriptions-item label="工序">{{ inspectRecord.standard_process_name }}</a-descriptions-item>
          <a-descriptions-item label="检验类型">{{ inspectRecord.inspect_type }}</a-descriptions-item>
          <a-descriptions-item label="报工数量">{{ inspectRecord.total_quantity }}</a-descriptions-item>
        </a-descriptions>
        <a-table :columns="inspectItemColumns" :data-source="inspectItems" :pagination="false" size="small" bordered row-key="id">
          <template #bodyCell="{ column, record: item, index }">
            <template v-if="column.key === 'rowIndex'">{{ index + 1 }}</template>
            <template v-else-if="column.key === 'actual_value'">
              <a-input v-model:value="inspectItems[index].actual_value" placeholder="输入实测值" style="width: 100%;" />
            </template>
            <template v-else-if="column.key === 'item_result'">
              <template v-if="item.actual_value">
                <a-tag v-if="isItemPass(item)" color="green">合格</a-tag>
                <a-tag v-else color="red">不合格</a-tag>
              </template>
              <span v-else style="color: #ccc;">-</span>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <!-- ========== Defect Handling Modal ========== -->
    <a-modal v-model:open="defectVisible" title="不合格品处理" @ok="handleDefectOk" okText="确认处理" cancelText="取消" width="600px">
      <a-descriptions :column="2" size="small" style="margin-bottom: 16px;">
        <a-descriptions-item label="检验单号">{{ defectRecord.inspection_number }}</a-descriptions-item>
        <a-descriptions-item label="不合格数量"><span style="color: red; font-weight: bold;">{{ defectRecord.unqualified_quantity }}</span></a-descriptions-item>
      </a-descriptions>
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="处理方式" required>
          <a-radio-group v-model:value="defectForm.handling_method">
            <a-radio value="返修">返修</a-radio>
            <a-radio value="报废">报废</a-radio>
            <a-radio value="让步接收">让步接收</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item v-if="defectForm.handling_method === '返修'" label="返修目标工序">
          <a-input-number v-model:value="defectForm.rework_target_step" :min="0" style="width: 100%;" placeholder="输入目标工序序号" />
        </a-form-item>
        <a-form-item v-if="defectForm.handling_method === '报废'" label="报废数量">
          <a-input-number v-model:value="defectForm.scrap_quantity" :min="0" :max="defectRecord.unqualified_quantity" style="width: 100%;" />
        </a-form-item>
        <a-form-item v-if="defectForm.handling_method === '让步接收'" label="让步接收数量">
          <a-input-number v-model:value="defectForm.concession_quantity" :min="0" :max="defectRecord.unqualified_quantity" style="width: 100%;" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="defectForm.remark" :rows="3" placeholder="请输入处理备注" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-descriptions-item-label) {
  white-space: nowrap;
}
</style>
