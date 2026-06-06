<template>
  <a-card :bordered="false" style="margin:12px 24px">
    <!-- 标题栏 -->
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;overflow-x:auto">
      <span style="font-size:18px;font-weight:600;white-space:nowrap;flex-shrink:0">样件检测报告</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap">
        <a-input v-model:value="searchText" placeholder="报告编号/样件BOM编号" allow-clear style="width:220px" @pressEnter="fetchData" />
        <a-select v-model:value="filterStatus" placeholder="状态" allow-clear style="width:120px" @change="fetchData">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="已提交">已提交</a-select-option>
        </a-select>
        <a-select v-model:value="filterResult" placeholder="检测结论" allow-clear style="width:120px" @change="fetchData">
          <a-select-option value="合格">合格</a-select-option>
          <a-select-option value="不合格">不合格</a-select-option>
          <a-select-option value="待定">待定</a-select-option>
        </a-select>
        <a-button type="primary" @click="fetchData">查询</a-button>
        <a-button @click="handleReset">重置</a-button>
      </div>
    </div>

    <!-- 表格 -->
    <a-table :columns="columns" :data-source="tableData" :loading="loading" row-key="id"
      :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t:number) => `共 ${t} 条` }"
      @change="handleTableChange" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'report_number'">
          <a-button type="link" size="small" style="padding:0" @click="goToBomDetail(record)">{{ record.report_number }}</a-button>
        </template>
        <template v-if="column.dataIndex === 'sample_bom_number'">
          <a-button type="link" size="small" style="padding:0" @click="goToBomDetail(record)">{{ record.sample_bom_number }}</a-button>
        </template>
        <template v-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === '已提交' ? 'blue' : 'default'">{{ record.status }}</a-tag>
        </template>
        <template v-if="column.dataIndex === 'inspection_result'">
          <a-tag v-if="record.inspection_result" :color="record.inspection_result === '合格' ? 'green' : record.inspection_result === '不合格' ? 'red' : 'orange'">{{ record.inspection_result }}</a-tag>
          <span v-else>-</span>
        </template>
        <template v-if="column.dataIndex === 'version_number'">
          V{{ record.version_number }}
        </template>
      </template>
    </a-table>
  </a-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { getInspectionReports } from '@/api/sales/sampleBom'

const router = useRouter()
const searchText = ref('')
const filterStatus = ref<string | undefined>(undefined)
const filterResult = ref<string | undefined>(undefined)
const loading = ref(false)
const tableData = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

// 缓存BOM编号到id的映射
const bomIdMap = ref<Record<string, number>>({})

const columns = [
  { title: '报告编号', dataIndex: 'report_number', width: 170 },
  { title: '样件BOM编号', dataIndex: 'sample_bom_number', width: 170 },
  { title: '版本', dataIndex: 'version_number', width: 70 },
  { title: '检测日期', dataIndex: 'inspection_date', width: 110 },
  { title: '检测人', dataIndex: 'inspector', width: 90 },
  { title: '检测结论', dataIndex: 'inspection_result', width: 90 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '评价说明', dataIndex: 'conclusion', ellipsis: true },
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getInspectionReports({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value || undefined,
      status: filterStatus.value || undefined,
      inspection_result: filterResult.value || undefined,
    })
    tableData.value = res.data.items || []
    pagination.total = res.data.total || 0
  } catch { message.error('获取数据失败') }
  finally { loading.value = false }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleReset = () => {
  searchText.value = ''
  filterStatus.value = undefined
  filterResult.value = undefined
  pagination.current = 1
  fetchData()
}

const goToBomDetail = async (record: any) => {
  // 需要通过BOM编号查找BOM的id来导航到详情页
  // 先尝试从已知的映射中查找
  if (bomIdMap.value[record.sample_bom_number]) {
    router.push(`/sample-boms/${bomIdMap.value[record.sample_bom_number]}`)
    return
  }
  // 如果没有缓存，先查询BOM列表获取id
  try {
    const { getSampleBoms } = await import('@/api/sales/sampleBom')
    const res = await getSampleBoms({ search: record.sample_bom_number, limit: 1 })
    const items = res.data.items || []
    if (items.length > 0) {
      bomIdMap.value[record.sample_bom_number] = items[0].id
      router.push(`/sample-boms/${items[0].id}`)
    }
  } catch { message.error('无法跳转') }
}

onMounted(() => fetchData())
</script>
