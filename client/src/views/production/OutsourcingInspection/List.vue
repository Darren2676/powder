<template>
  <div class="page-container">
    <a-card :bordered="false">
      <div class="table-header">
        <div class="table-header-left">
          <a-input-search v-model:value="searchText" placeholder="搜索质检单号/收回单号/委外订单号" style="width: 360px" allow-clear @search="fetchList" @pressEnter="fetchList" />
          <a-select v-model:value="resultFilter" placeholder="检验结果" style="width: 120px; margin-left: 8px" allow-clear @change="fetchList">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="合格">合格</a-select-option>
            <a-select-option value="不合格">不合格</a-select-option>
            <a-select-option value="让步接收">让步接收</a-select-option>
          </a-select>
        </div>
        <div class="table-header-right">
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建质检单</a-button>
        </div>
      </div>

      <a-table
        :columns="columns" :data-source="tableData" :loading="loading"
        :pagination="{ current: page, pageSize: limit, total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
        @change="handleTableChange"
        :scroll="{ x: 1800 }" row-key="inspection_number" size="small" bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'inspection_status'">
            <a-tag :color="record.inspection_status === '已完成' ? 'green' : record.inspection_status === '待检验' ? 'orange' : 'default'">{{ record.inspection_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'inspection_result'">
            <a-tag v-if="record.inspection_result" :color="record.inspection_result === '合格' ? 'green' : record.inspection_result === '不合格' ? 'red' : 'blue'">{{ record.inspection_result }}</a-tag>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="0" wrap>
              <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
              <a-button v-if="record.inspection_status === '待检验'" type="link" size="small" @click="handleEdit(record)">录入结果</a-button>
              <a-button v-if="record.inspection_status === '待检验' && record.inspection_result" type="link" size="small" style="color: #1890ff" @click="handleComplete(record)">完成质检</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 查看/编辑弹窗 -->
    <a-modal v-model:open="detailVisible" :title="detailMode === 'edit' ? '录入质检结果' : '查看委外质检单'" :footer="detailMode === 'edit' ? undefined : null" @ok="handleEditOk" okText="保存" cancelText="取消" width="900px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="质检单号">
              <a-input v-model:value="detailData.inspection_number" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="收回单号">
              <a-input v-model:value="detailData.receipt_number" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="委外订单号">
              <a-input v-model:value="detailData.outsourcing_order_number" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="检验日期">
              <a-date-picker v-model:value="detailData.inspection_date" format="YYYY/MM/DD" valueFormat="YYYY/MM/DD" style="width: 100%" :disabled="detailMode !== 'edit'" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="检验员">
              <a-input v-model:value="detailData.inspector" :disabled="detailMode !== 'edit'" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="检验结果">
              <a-select v-model:value="detailData.inspection_result" :disabled="detailMode !== 'edit'" placeholder="请选择检验结果">
                <a-select-option value="合格">合格</a-select-option>
                <a-select-option value="不合格">不合格</a-select-option>
                <a-select-option value="让步接收">让步接收</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="合格数量">
              <a-input-number v-model:value="detailData.qualified_quantity" :min="0" :precision="2" style="width: 100%" :disabled="detailMode !== 'edit'" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="不合格数量">
              <a-input-number v-model:value="detailData.unqualified_quantity" :min="0" :precision="2" style="width: 100%" :disabled="detailMode !== 'edit'" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="缺陷描述">
              <a-textarea v-model:value="detailData.defect_description" :rows="2" :disabled="detailMode !== 'edit'" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="处理方式">
              <a-textarea v-model:value="detailData.handling_method" :rows="2" :disabled="detailMode !== 'edit'" placeholder="如：返工、报废、退货等" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="备注">
              <a-textarea v-model:value="detailData.remark" :rows="2" :disabled="detailMode !== 'edit'" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { getOutsourcingInspections, createOutsourcingInspection, updateInspectionResult, completeInspection, exportOutsourcingInspections } from '@/api/production/outsourcingInspection'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchText = ref('')
const resultFilter = ref('')
const page = ref(1)
const limit = ref(20)
const total = ref(0)

const columns = [
  { title: '质检单号', dataIndex: 'inspection_number', key: 'inspection_number', width: 150 },
  { title: '收回单号', dataIndex: 'receipt_number', key: 'receipt_number', width: 150 },
  { title: '委外订单号', dataIndex: 'outsourcing_order_number', key: 'outsourcing_order_number', width: 150 },
  { title: '检验日期', dataIndex: 'inspection_date', key: 'inspection_date', width: 120 },
  { title: '检验员', dataIndex: 'inspector', key: 'inspector', width: 100 },
  { title: '检验状态', key: 'inspection_status', dataIndex: 'inspection_status', width: 100 },
  { title: '检验结果', key: 'inspection_result', dataIndex: 'inspection_result', width: 100 },
  { title: '合格数量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 100 },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 120 },
  { title: '处理方式', dataIndex: 'handling_method', key: 'handling_method', width: 120 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const }
]

const detailVisible = ref(false)
const detailMode = ref<'view' | 'edit'>('view')
const detailData = reactive<any>({
  inspection_number: '',
  receipt_number: '',
  outsourcing_order_number: '',
  inspection_date: '',
  inspector: '',
  inspection_result: '',
  qualified_quantity: 0,
  unqualified_quantity: 0,
  defect_description: '',
  handling_method: '',
  remark: '',
  inspection_status: ''
})

const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getOutsourcingInspections({
      page: page.value,
      limit: limit.value,
      search: searchText.value,
      inspection_result: resultFilter.value
    })
    if (res.success) {
      tableData.value = res.data.items
      total.value = res.data.pagination.total
    }
  } catch (err) {
    message.error('获取列表失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  page.value = pag.current
  limit.value = pag.pageSize
  fetchList()
}

const handleCreate = () => {
  detailMode.value = 'edit'
  Object.assign(detailData, {
    inspection_number: '',
    receipt_number: '',
    outsourcing_order_number: '',
    inspection_date: '',
    inspector: '',
    inspection_result: '',
    qualified_quantity: 0,
    unqualified_quantity: 0,
    defect_description: '',
    handling_method: '',
    remark: '',
    inspection_status: '待检验'
  })
  detailVisible.value = true
}

const handleEdit = (record: any) => {
  detailMode.value = 'edit'
  Object.assign(detailData, record)
  detailVisible.value = true
}

const handleView = (record: any) => {
  detailMode.value = 'view'
  Object.assign(detailData, record)
  detailVisible.value = true
}

const handleEditOk = async () => {
  try {
    await updateInspectionResult(detailData.inspection_number, detailData)
    message.success('更新成功')
    detailVisible.value = false
    fetchList()
  } catch (err) {
    message.error('操作失败')
  }
}

const handleComplete = async (record: any) => {
  Modal.confirm({
    title: '完成质检',
    content: `完成后将触发入库操作，确定要继续吗？`,
    okText: '确定',
    okType: 'primary',
    cancelText: '取消',
    async onOk() {
      try {
        await completeInspection(record.inspection_number)
        message.success('质检完成，合格品已入库')
        fetchList()
      } catch (err) {
        message.error('操作失败')
      }
    }
  })
}

const handleExport = async () => {
  try {
    const res: any = await exportOutsourcingInspections(searchText.value)
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `委外质检单_${new Date().getTime()}.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (err) {
    message.error('导出失败')
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.page-container {
  padding: 0;
}
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.table-header-left {
  display: flex;
  align-items: center;
}
.table-header-right {
  display: flex;
  gap: 8px;
}
</style>
