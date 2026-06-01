<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, PlusOutlined, DeleteOutlined, ExclamationCircleOutlined, SettingOutlined, DownOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import { getProcessParameters, deleteProcessParameter, exportProcessParameters, downloadImportTemplate, importProcessParameters } from '@/api/master-data/processParameter'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'

const router = useRouter()

// 搜索条件
const searchForm = reactive({
  search: '',
  approval_status: '',
})

// 列表数据
const { loading, pagination, dataSource, fetchData, handleTableChange } = useTableList(getProcessParameters, searchForm)

// 行选择
const selectedRowKeys = ref<number[]>([])
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: number[]) => { selectedRowKeys.value = keys },
}))

// 列定义
const defaultDataColumns: any[] = [
  { title: '参数编号', dataIndex: 'parameter_number', key: 'parameter_number', width: 160, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '工艺路线编号', dataIndex: 'process_route_number', key: 'process_route_number', width: 140, resizable: true },
  { title: '版本', dataIndex: 'version', key: 'version', width: 60, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 130, resizable: true },
  { title: '说明', dataIndex: 'description', key: 'description', width: 180, ellipsis: true, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true, resizable: true },
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('process_parameter_list', defaultDataColumns)

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => {
  searchForm.search = ''
  searchForm.approval_status = ''
  pagination.current = 1
  fetchData()
}

// 新建
const handleCreate = () => {
  router.push({ name: 'ProcessParameterDetail', params: { id: 'new' } })
}

// 查看详情
const handleView = (record: any) => {
  router.push({ name: 'ProcessParameterDetail', params: { id: record.id } })
}

// 删除
const handleDelete = (record: any) => {
  if (record.approval_status !== '草稿') { message.warning('仅草稿状态可删除'); return }
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除工艺参数 ${record.parameter_number} 吗？`,
    onOk: async () => {
      const res: any = await deleteProcessParameter(record.id)
      if (res.success) { message.success('删除成功'); fetchData() }
      else { message.error(res.message || '删除失败') }
    },
  })
}

// 审批操作
const handleSubmitApproval = async (record: any) => {
  try {
    const res: any = await submitForApproval('process_parameter_header', record.parameter_number)
    if (res.success) { message.success('提交审批成功'); fetchData() }
    else { message.error(res.message || '提交失败') }
  } catch { message.error('提交审批失败') }
}

const handleApprove = async (record: any) => {
  try {
    const res: any = await approveRecord('process_parameter_header', record.parameter_number)
    if (res.success) { message.success('审批通过'); fetchData() }
    else { message.error(res.message || '审批失败') }
  } catch { message.error('审批失败') }
}

const handleWithdraw = async (record: any) => {
  try {
    const res: any = await withdrawApproval('process_parameter_header', record.parameter_number)
    if (res.success) { message.success('已撤回'); fetchData() }
    else { message.error(res.message || '撤回失败') }
  } catch { message.error('撤回失败') }
}

const handleReverse = async (record: any) => {
  try {
    const res: any = await reverseApproval('process_parameter_header', record.parameter_number)
    if (res.success) { message.success('反审成功'); fetchData() }
    else { message.error(res.message || '反审失败') }
  } catch { message.error('反审失败') }
}

// 导出
const handleExport = async () => {
  try {
    const res: any = await exportProcessParameters(searchForm.search)
    const blob = new Blob([res as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '工艺参数导出.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

// 下载导入模板
const handleDownloadTemplate = async () => {
  try {
    const res: any = await downloadImportTemplate()
    const blob = new Blob([res as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '工艺参数导入模板.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
    message.success('模板下载成功')
  } catch { message.error('下载失败') }
}

// 导入
const fileInputRef = ref<HTMLInputElement>()
const handleImport = () => { fileInputRef.value?.click() }
const onFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const formData = new FormData()
  formData.append('file', file)
  try {
    const res: any = await importProcessParameters(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  ;(e.target as HTMLInputElement).value = ''
}

// 批量审批
const handleBatchSubmit = async () => {
  if (!selectedRowKeys.value.length) { message.warning('请先选择记录'); return }
  try {
    const records = dataSource.value.filter((r: any) => selectedRowKeys.value.includes(r.id) && r.approval_status === '草稿')
    if (!records.length) { message.warning('所选记录中没有草稿状态'); return }
    const numbers = records.map((r: any) => r.parameter_number)
    const res: any = await batchSubmitForApproval('process_parameter_header', numbers)
    if (res.success) { message.success(res.message || '批量提交成功'); selectedRowKeys.value = []; fetchData() }
    else { message.error(res.message || '批量提交失败') }
  } catch { message.error('批量提交失败') }
}

const handleBatchApprove = async () => {
  if (!selectedRowKeys.value.length) { message.warning('请先选择记录'); return }
  try {
    const records = dataSource.value.filter((r: any) => selectedRowKeys.value.includes(r.id) && r.approval_status === '待审批')
    if (!records.length) { message.warning('所选记录中没有待审批状态'); return }
    const numbers = records.map((r: any) => r.parameter_number)
    const res: any = await batchApproveRecords('process_parameter_header', numbers)
    if (res.success) { message.success(res.message || '批量审批成功'); selectedRowKeys.value = []; fetchData() }
    else { message.error(res.message || '批量审批失败') }
  } catch { message.error('批量审批失败') }
}

onMounted(() => {
  loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 0;">
    <a-card :bordered="false" :body-style="{ padding: '16px' }">
      <!-- 标题 + 搜索栏（同一行） -->
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">工艺参数</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-input v-model:value="searchForm.search" placeholder="参数编号/产品编号/产品名称" allow-clear style="width: 220px;" @pressEnter="handleSearch" />
          <a-select v-model:value="searchForm.approval_status" placeholder="审批状态" allow-clear style="width: 130px">
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审批</a-select-option>
            <a-select-option value="已审批">已审批</a-select-option>
          </a-select>
          <a-button type="primary" @click="handleSearch"><template #icon><ReloadOutlined /></template>查询</a-button>
          <a-button @click="handleReset">重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleDownloadTemplate"><template #icon><DownloadOutlined /></template>下载模板</a-button>
          <a-button @click="handleImport"><template #icon><UploadOutlined /></template>导入</a-button>
          <input type="file" ref="fileInputRef" accept=".xlsx,.xls" style="display: none;" @change="onFileChange" />
          <a-button v-if="selectedRowKeys.length" @click="handleBatchSubmit">批量提交</a-button>
          <a-button v-if="selectedRowKeys.length" @click="handleBatchApprove">批量审批</a-button>
          <a-button type="primary" @click="handleCreate"><template #icon><PlusOutlined /></template>新建</a-button>
          <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
        </div>
      </div>

      <!-- 数据表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        :row-selection="rowSelection"
        row-key="id"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'parameter_number'">
            <a @click="handleView(record)">{{ record.parameter_number }}</a>
          </template>
          <template v-else-if="column.key === 'process_route_number'">
            <span v-if="record.process_route_number">{{ record.process_route_number }}</span>
            <a-tag v-else color="blue">产品级</a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <ApprovalStatusTag :status="record.approval_status" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleSubmitApproval(record)">提交审批</a-menu-item>
                    <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleApprove(record)">审批</a-menu-item>
                    <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleWithdraw(record)">撤回</a-menu-item>
                    <a-menu-item v-if="(record.approval_status || '').trim() === '已审批'" @click="handleReverse(record)">反审</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item @click="handleDelete(record)">
                      <span style="color: #ff4d4f">删除</span>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>
