<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined,
  EyeOutlined, WarningOutlined, CheckCircleOutlined,
  UndoOutlined
} from '@ant-design/icons-vue'
import {
  getNonconformingProducts, getNonconformingProductDetail,
  handleNonconforming, cancelHandleNonconforming, exportNonconformingProducts
} from '@/api/quality/nonconformingProduct'
import { generateExportFilename } from '@/utils/exportFilename'
import { getWarehouses } from '@/api/master-data/warehouse'
import { getItemDetail } from '@/api/master-data/itemMaster'

defineOptions({ name: 'NonconformingProductList' })

// ==================== State ====================
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterSourceType = ref<string | undefined>(undefined)
const filterHandlingStatus = ref<string | undefined>('已完成')
const pagination = reactive({ current: 1, pageSize: 15, total: 0 })
const stats = ref<any>({})

// ==================== Detail Modal ====================
const detailVisible = ref(false)
const detailRecord = ref<any>({})

// ==================== Handle Modal ====================
const handleVisible = ref(false)
const handleRecord = ref<any>({})
const handleForm = reactive({
  handling_method: '' as string,
  handling_quantity: 0 as number,
  rework_step_number: undefined as number | undefined,
  concession_quantity: 0 as number,
  scrap_type: '批量' as string,
  scrap_quantity: 0 as number,
  return_type: '退货退款' as string,
  return_order_number: '' as string,
  special_warehouse: '' as string,
  qualified_quantity_after: 0 as number,
  unqualified_quantity_after: 0 as number,
  handling_remark: '' as string
})

// 处理方式选项 - 根据来源类型
const handlingOptions = computed(() => {
  const type = handleRecord.value.source_type
  if (type === '来料检验') return ['挑选', '拒收', '报废', '特采', '退货']
  if (type === '生产检验') return ['返修', '报废', '让步接收']
  if (type === '委外检验') return ['挑选', '拒收', '报废', '特采', '退货', '返修', '让步接收']
  return []
})

// ==================== Columns ====================
const columns = [
  { title: '行号', key: 'rowIndex', width: 55, fixed: 'left' as const },
  { title: '不合格品单号', dataIndex: 'nonconforming_number', key: 'nonconforming_number', width: 160 },
  { title: '来源类型', key: 'source_type', width: 90 },
  { title: '检验单号', dataIndex: 'source_number', key: 'source_number', width: 160 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 110 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 100 },
  { title: '缺陷分类', dataIndex: 'defect_class_name', key: 'defect_class_name', width: 100 },
  { title: '缺陷名称', dataIndex: 'defect_name', key: 'defect_name', width: 100 },
  { title: '处理方式', dataIndex: 'handling_method', key: 'handling_method', width: 90 },
  { title: '处理状态', key: 'handling_status', width: 100 },
  { title: '关联单号', key: 'related_number', width: 150 },
  { title: '处理人', dataIndex: 'operator', key: 'operator', width: 80 },
  { title: '处理日期', dataIndex: 'handling_date', key: 'handling_date', width: 140 },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' as const }
]

// ==================== CRUD ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res = await getNonconformingProducts({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value || undefined,
      source_type: filterSourceType.value || undefined,
      handling_status: filterHandlingStatus.value || undefined
    })
    dataSource.value = res.data.items || []
    pagination.total = res.data.pagination?.total || 0
    stats.value = res.data.stats || {}
  } catch { message.error('获取不合格品列表失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchList() }
const handleReset = () => {
  searchText.value = ''; filterSourceType.value = undefined
  filterHandlingStatus.value = undefined; pagination.current = 1; fetchList()
}
const handleTableChange = (pag: any) => {
  pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchList()
}

// ==================== Detail ====================
const handleDetail = async (record: any) => {
  try {
    const res = await getNonconformingProductDetail(record.nonconforming_number)
    detailRecord.value = res.data || {}
    detailVisible.value = true
  } catch { message.error('加载详情失败') }
}

// ==================== Handle (处理) ====================
const warehouseOptions = ref<any[]>([])
const filterWarehouseOption = (input: string, option: any) => {
  const search = input.toLowerCase()
  const label = (option.label || '').toLowerCase()
  return label.includes(search)
}

const fetchWarehouses = async () => {
  try {
    const res = await getWarehouses({ page: 1, limit: 9999 })
    warehouseOptions.value = res.data?.items || []
  } catch {}
}

const openHandle = async (record: any) => {
  handleRecord.value = { ...record }
  handleForm.handling_method = ''
  handleForm.handling_quantity = record.unqualified_quantity || 0
  handleForm.rework_step_number = undefined
  handleForm.concession_quantity = record.unqualified_quantity || 0
  handleForm.scrap_type = '批量'
  handleForm.scrap_quantity = record.unqualified_quantity || 0
  handleForm.return_type = '退货退款'
  handleForm.return_order_number = ''
  handleForm.special_warehouse = ''
  handleForm.qualified_quantity_after = 0
  handleForm.unqualified_quantity_after = 0
  handleForm.handling_remark = ''

  // 查询物料主数据默认仓库
  if (record.item_number) {
    try {
      const itemRes = await getItemDetail(record.item_number)
      const defaultWh = itemRes.data?.default_warehouse
      if (defaultWh) handleForm.special_warehouse = defaultWh
    } catch {}
  }

  handleVisible.value = true
}

const handleOk = async () => {
  if (!handleForm.handling_method) { message.warning('请选择处理方式'); return }
  try {
    await handleNonconforming(handleRecord.value.nonconforming_number, { ...handleForm })
    message.success('不合格品处理完成')
    handleVisible.value = false
    fetchList()
  } catch (e: any) {
    message.error(e.response?.data?.message || e.response?.data?.error || '处理失败')
  }
}

// ==================== 撤销处理 ====================
const handleCancelHandling = async (record: any) => {
  try {
    await new Promise((resolve, reject) => {
      Modal.confirm({
        title: '确认撤销',
        content: `确定要撤销不合格品单 ${record.nonconforming_number} 的处理吗？将回退相关单据的数量和状态。`,
        okText: '确认撤销',
        cancelText: '取消',
        okType: 'danger',
        onOk: () => resolve(true),
        onCancel: () => reject(new Error('cancel'))
      })
    })
    await cancelHandleNonconforming(record.nonconforming_number)
    message.success('不合格品处理已撤销')
    fetchList()
  } catch (e: any) {
    if (e.message !== 'cancel') {
      message.error(e.response?.data?.message || '撤销失败')
    }
  }
}

// ==================== Export ====================
const handleExport = async () => {
  try {
    const res = await exportNonconformingProducts()
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('nonconforming_products', 'xlsx')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

// ==================== Helpers ====================
const getSourceTypeColor = (type: string) => {
  if (type === '来料检验') return 'blue'
  if (type === '生产检验') return 'green'
  if (type === '委外检验') return 'purple'
  return 'default'
}
const getHandlingStatusColor = (status: string) => {
  if (status === '待处理') return 'orange'
  if (status === '处理中') return 'processing'
  if (status === '已完成') return 'green'
  if (status === '返修不合格') return 'red'
  return 'default'
}
const getHandlingMethodColor = (method: string) => {
  if (method === '返修') return 'blue'
  if (method === '报废') return 'red'
  if (method === '让步接收') return 'orange'
  if (method === '特采') return 'purple'
  if (method === '退货') return 'cyan'
  if (method === '挑选') return 'geekblue'
  if (method === '拒收') return 'volcano'
  return 'default'
}

onMounted(() => { fetchWarehouses(); fetchList() })
</script>

<template>
  <div>
    <!-- 统计卡片 -->
    <a-row :gutter="16" style="margin-bottom: 16px;">
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff7e6;">
          <a-statistic title="待处理" :value="stats.pending_count || 0">
            <template #prefix><WarningOutlined style="color: #fa8c16;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #fff1f0;">
          <a-statistic title="不合格总数" :value="stats.total_unqualified || 0" :precision="0" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #f6ffed;">
          <a-statistic title="已处理" :value="stats.completed_count || 0">
            <template #prefix><CheckCircleOutlined style="color: #52c41a;" /></template>
          </a-statistic>
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card size="small" :bordered="false" style="background: #e6f7ff;">
          <a-statistic title="总记录数" :value="stats.total_count || 0" />
        </a-card>
      </a-col>
    </a-row>

    <a-card title="不合格处理单" :bordered="false">
      <template #extra>
        <a-space wrap>
          <a-input-search v-model:value="searchText" placeholder="搜索单号/物料" style="width: 200px" @search="handleSearch" allowClear @change="(e: any) => { if (!e.target.value) handleSearch() }" />
          <a-select v-model:value="filterSourceType" placeholder="来源类型" style="width: 110px" allowClear @change="handleSearch">
            <a-select-option value="来料检验">来料检验</a-select-option>
            <a-select-option value="生产检验">生产检验</a-select-option>
            <a-select-option value="委外检验">委外检验</a-select-option>
          </a-select>
          <a-select v-model:value="filterHandlingStatus" placeholder="处理状态" style="width: 100px" allowClear @change="handleSearch">
            <a-select-option value="已完成">已完成</a-select-option>
            <a-select-option value="待处理">待处理</a-select-option>
            <a-select-option value="处理中">处理中</a-select-option>
            <a-select-option value="返修不合格">返修不合格</a-select-option>
          </a-select>
          <a-button @click="handleReset"><ReloadOutlined />重置</a-button>
          <a-button @click="handleExport"><DownloadOutlined />导出</a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns" :data-source="dataSource" :loading="loading"
        row-key="nonconforming_number" :pagination="pagination"
        :scroll="{ x: 1900, y: 'calc(100vh - 380px)' }"
        @change="handleTableChange" size="small"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'source_type'">
            <a-tag :color="getSourceTypeColor(record.source_type)">{{ record.source_type }}</a-tag>
          </template>
          <template v-else-if="column.key === 'handling_method'">
            <a-tag v-if="record.handling_method" :color="getHandlingMethodColor(record.handling_method)">{{ record.handling_method }}</a-tag>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'handling_status'">
            <a-tag :color="getHandlingStatusColor(record.handling_status)">{{ record.handling_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'related_number'">
            <span v-if="record.rework_order_number" style="color: #1890ff; cursor: pointer;" @click="$router.push('/rework-orders')">{{ record.rework_order_number }}</span>
            <span v-else-if="record.stock_in_number" style="color: #52c41a;">{{ record.stock_in_number }}</span>
            <span v-else-if="record.return_order_number" style="color: #722ed1;">{{ record.return_order_number }}</span>
            <span v-else style="color: #ccc;">-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleDetail(record)"><EyeOutlined />详情</a-button>
              <a-button v-if="record.handling_status === '已完成' || record.handling_status === '处理中'" type="link" size="small" style="color: #faad14;" @click="handleCancelHandling(record)"><UndoOutlined />撤销</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== Detail Modal ========== -->
    <a-modal v-model:open="detailVisible" title="不合格品详情" :footer="null" width="900px">
      <a-descriptions :column="3" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '110px' }">
        <a-descriptions-item label="不合格品单号">{{ detailRecord.nonconforming_number }}</a-descriptions-item>
        <a-descriptions-item label="来源类型">
          <a-tag :color="getSourceTypeColor(detailRecord.source_type)">{{ detailRecord.source_type }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="检验单号">{{ detailRecord.source_number }}</a-descriptions-item>
        <a-descriptions-item label="物料编号">{{ detailRecord.item_number }}</a-descriptions-item>
        <a-descriptions-item label="物料名称">{{ detailRecord.item_name }}</a-descriptions-item>
        <a-descriptions-item label="规格型号">{{ detailRecord.specifications || '-' }}</a-descriptions-item>
        <a-descriptions-item label="不合格数量"><span style="color: red; font-weight: bold;">{{ detailRecord.unqualified_quantity }}</span></a-descriptions-item>
        <a-descriptions-item label="缺陷分类">{{ detailRecord.defect_class_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="缺陷名称">{{ detailRecord.defect_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="缺陷原因" :span="3">{{ detailRecord.defect_reason_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="处理方式">
          <a-tag v-if="detailRecord.handling_method" :color="getHandlingMethodColor(detailRecord.handling_method)">{{ detailRecord.handling_method }}</a-tag>
          <span v-else>-</span>
        </a-descriptions-item>
        <a-descriptions-item label="处理状态">
          <a-tag :color="getHandlingStatusColor(detailRecord.handling_status)">{{ detailRecord.handling_status }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="处理数量">{{ detailRecord.handling_quantity || '-' }}</a-descriptions-item>
        <a-descriptions-item v-if="detailRecord.source_type === '生产检验'" label="生产单号">{{ detailRecord.production_order_number || '-' }}</a-descriptions-item>
        <a-descriptions-item v-if="detailRecord.source_type === '生产检验'" label="工序号">{{ detailRecord.step_number || '-' }}</a-descriptions-item>
        <a-descriptions-item v-if="detailRecord.source_type === '来料检验'" label="供应商">{{ detailRecord.supplier_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="处理人">{{ detailRecord.operator || '-' }}</a-descriptions-item>
        <a-descriptions-item label="处理日期">{{ detailRecord.handling_date || '-' }}</a-descriptions-item>
        <a-descriptions-item label="处理备注" :span="3">{{ detailRecord.handling_remark || '-' }}</a-descriptions-item>
        <a-descriptions-item v-if="detailRecord.rework_order_number" label="返修单号">
          <span style="color: #1890ff; cursor: pointer;" @click="$router.push('/rework-orders')">{{ detailRecord.rework_order_number }}</span>
        </a-descriptions-item>
        <a-descriptions-item v-if="detailRecord.stock_in_number" label="入库单号">
          <span style="color: #52c41a;">{{ detailRecord.stock_in_number }}</span>
        </a-descriptions-item>
        <a-descriptions-item v-if="detailRecord.return_order_number" label="退货单号">
          <span style="color: #722ed1;">{{ detailRecord.return_order_number }}</span>
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>

    <!-- ========== Handle Modal ========== -->
    <a-modal v-model:open="handleVisible" title="不合格品处理" @ok="handleOk" okText="确认处理" cancelText="取消" width="600px">
      <a-descriptions :column="2" size="small" style="margin-bottom: 16px;">
        <a-descriptions-item label="不合格品单号">{{ handleRecord.nonconforming_number }}</a-descriptions-item>
        <a-descriptions-item label="来源类型">
          <a-tag :color="getSourceTypeColor(handleRecord.source_type)">{{ handleRecord.source_type }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="物料">{{ handleRecord.item_name }}</a-descriptions-item>
        <a-descriptions-item label="不合格数量"><span style="color: red; font-weight: bold;">{{ handleRecord.unqualified_quantity }}</span></a-descriptions-item>
        <a-descriptions-item label="缺陷分类">{{ handleRecord.defect_class_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="缺陷名称">{{ handleRecord.defect_name || '-' }}</a-descriptions-item>
        <a-descriptions-item label="缺陷原因" :span="2">{{ handleRecord.defect_reason_name || '-' }}</a-descriptions-item>
      </a-descriptions>
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="处理方式" required>
          <a-radio-group v-model:value="handleForm.handling_method">
            <a-radio v-for="opt in handlingOptions" :key="opt" :value="opt">{{ opt }}</a-radio>
          </a-radio-group>
        </a-form-item>

        <!-- 返修 -->
        <a-form-item v-if="handleForm.handling_method === '返修'" label="返修目标工序号">
          <a-input-number v-model:value="handleForm.rework_step_number" :min="0" style="width: 100%;" placeholder="输入目标工序序号" />
        </a-form-item>

        <!-- 报废 -->
        <a-form-item v-if="handleForm.handling_method === '报废'" label="报废类型">
          <a-select v-model:value="handleForm.scrap_type" style="width: 100%;">
            <a-select-option value="批量">批量</a-select-option>
            <a-select-option value="单件">单件</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="handleForm.handling_method === '报废'" label="报废数量">
          <a-input-number v-model:value="handleForm.scrap_quantity" :min="0" :max="handleRecord.unqualified_quantity" style="width: 100%;" />
        </a-form-item>

        <!-- 让步接收 -->
        <a-form-item v-if="handleForm.handling_method === '让步接收'" label="让步接收数量">
          <a-input-number v-model:value="handleForm.concession_quantity" :min="0" :max="handleRecord.unqualified_quantity" style="width: 100%;" />
        </a-form-item>

        <!-- 挑选 -->
        <a-form-item v-if="handleForm.handling_method === '挑选'" label="挑选后合格数量">
          <a-input-number v-model:value="handleForm.qualified_quantity_after" :min="0" style="width: 100%;" />
        </a-form-item>
        <a-form-item v-if="handleForm.handling_method === '挑选'" label="挑选后不合格数量">
          <a-input-number v-model:value="handleForm.unqualified_quantity_after" :min="0" style="width: 100%;" />
        </a-form-item>

        <!-- 特采 -->
        <a-form-item v-if="handleForm.handling_method === '特采'" label="特采入库仓库">
          <a-select
            v-model:value="handleForm.special_warehouse"
            show-search
            :filter-option="filterWarehouseOption"
            placeholder="输入仓库编号或名称搜索"
            allow-clear
          >
            <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number" :label="`${w.warehouse_number} - ${w.warehouse_name}`">
              {{ w.warehouse_number }} - {{ w.warehouse_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="handleForm.handling_method === '特采'" label="特采数量">
          <a-input-number v-model:value="handleForm.handling_quantity" :min="0" :max="handleRecord.unqualified_quantity" style="width: 100%;" />
        </a-form-item>

        <!-- 退货 -->
        <a-form-item v-if="handleForm.handling_method === '退货'" label="退货类型">
          <a-select v-model:value="handleForm.return_type" placeholder="选择退货类型">
            <a-select-option value="退货退款">退货退款</a-select-option>
            <a-select-option value="退货换货">退货换货</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="handleForm.handling_method === '退货'" label="退货数量">
          <a-input-number v-model:value="handleForm.handling_quantity" :min="1" :max="handleRecord.unqualified_quantity" style="width: 100%;" />
        </a-form-item>
        <a-form-item v-if="handleForm.handling_method === '退货'" label="">
          <a-alert type="info" show-icon style="margin-bottom: 0;">
            <template #message>系统将自动创建采购退货单，并在退货单审批后执行退货出库</template>
          </a-alert>
        </a-form-item>

        <!-- 拒收 -->
        <a-form-item v-if="handleForm.handling_method === '拒收'" label="拒收数量">
          <a-input-number v-model:value="handleForm.handling_quantity" :min="0" :max="handleRecord.unqualified_quantity" style="width: 100%;" />
        </a-form-item>

        <a-form-item label="处理备注">
          <a-textarea v-model:value="handleForm.handling_remark" :rows="3" placeholder="请输入处理备注" />
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
