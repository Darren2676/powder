<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, DownloadOutlined, ExclamationCircleOutlined, DownOutlined } from '@ant-design/icons-vue'
import { getStockIns, getStockInDetail, deleteStockIn, confirmStockIn, withdrawStockIn, exportStockIns } from '@/api/warehouse/stockIn'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

// ==================== 数据 ====================

const dataList = ref<any[]>([])


const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getStockIns)

const filterStatus = ref('')

const detailVisible = ref(false)
const detailHeader = ref<any>({})
const detailRows = ref<any[]>([])

// ==================== 列定义 ====================
const columns = [
  { title: '入库单号', dataIndex: 'stock_in_number', key: 'stock_in_number', width: 180 },
  { title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 180 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '入库日期', dataIndex: 'stock_in_date', key: 'stock_in_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '入库类型', dataIndex: 'stock_in_type', key: 'stock_in_type', width: 100 },
  { title: '状态', dataIndex: 'approval_status', key: 'approval_status', width: 90 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100 },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const }
]

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', width: 60 },
  { title: '物料编码', dataIndex: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', width: 60 },
  { title: '订单数量', dataIndex: 'order_quantity', width: 90 },
  { title: '已入库', dataIndex: 'received_quantity', width: 80 },
  { title: '本次入库', dataIndex: 'stock_in_quantity', width: 90 },
  { title: '合格数量', dataIndex: 'qualified_quantity', width: 90 },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', width: 90 },
  { title: '检验单号', dataIndex: 'inspection_number', width: 160 },
  { title: '检验状态', dataIndex: 'inspect_status', width: 100 },
  { title: '批次号', dataIndex: 'batch_number', width: 160 }
]

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getStockIns({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterStatus.value
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

onMounted(() => fetchList())

// ==================== 详情弹窗 ====================
const openDetail = async (record: any) => {
  try {
    const res: any = await getStockInDetail(record.stock_in_number)
    if (res?.success) {
      detailHeader.value = res.data?.header || {}
      detailRows.value = res.data?.details || []
      detailVisible.value = true
    }
  } catch {
    message.error('获取入库单详情失败')
  }
}

// ==================== 确认入库 ====================
const handleConfirm = async (record: any) => {
  try {
    const res: any = await confirmStockIn(record.stock_in_number)
    if (res.success) { message.success('确认入库成功'); fetchList() }
    else { message.error(res.message || '入库失败') }
  } catch (e: any) {
    message.error(e.response?.data?.message || '入库失败')
  }
}

// ==================== 撤回入库 ====================
const handleWithdraw = (record: any) => {
  Modal.confirm({
    title: '确认撤回',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤回入库单「${(record.stock_in_number || '').trim()}」吗？撤回将反转所有库存变动，且关联的检验单将被作废。`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawStockIn(record.stock_in_number)
        if (res.success) { message.success('已撤回入库'); fetchList() }
        else { message.error(res.message || '撤回失败') }
      } catch (e: any) { message.error(e.response?.data?.message || '撤回失败') }
    }
  })
}

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除入库单「${(record.stock_in_number || '').trim()}」吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteStockIn(record.stock_in_number)
        if (res.success) { message.success('删除成功'); fetchList() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// ==================== 导出 ====================
const handleExport = async () => {
  const res: any = await exportStockIns(searchText.value)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'stock_ins.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
}
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;overflow-x:auto">
      <span style="font-size:18px;font-weight:600;white-space:nowrap;flex-shrink:0">采购入库单</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap">
        <a-input-search v-model:value="searchText" placeholder="搜索入库单号/采购单号/供应商/仓库" style="width:300px" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterStatus" placeholder="状态" style="width:120px" allow-clear @change="handleSearch">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="已入库">已入库</a-select-option>
          <a-select-option value="已撤回">已撤回</a-select-option>
        </a-select>
        <a-button @click="fetchList"><template #icon><ReloadOutlined /></template></a-button>
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handleTableChange" row-key="stock_in_number" :scroll="{ x: 1300 }" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'approval_status'">
          <a-tag :color="record.approval_status === '已入库' ? 'green' : record.approval_status === '已撤回' ? 'orange' : 'default'">{{ record.approval_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="openDetail(record)">查看</a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>
                更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleConfirm(record)">确认入库</a-menu-item>
                  <a-menu-item v-else-if="(record.approval_status || '').trim() === '已入库'" @click="handleWithdraw(record)">撤回入库</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f">删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 明细弹窗 -->
    <a-modal v-model:open="detailVisible" title="入库单详情" width="1000px" :footer="null">
      <a-descriptions bordered size="small" :column="3" style="margin-bottom:16px">
        <a-descriptions-item label="入库单号">{{ detailHeader.stock_in_number }}</a-descriptions-item>
        <a-descriptions-item label="采购订单号">{{ detailHeader.purchase_order_number }}</a-descriptions-item>
        <a-descriptions-item label="供应商">{{ detailHeader.supplier_name }}</a-descriptions-item>
        <a-descriptions-item label="仓库">{{ detailHeader.warehouse_name }}</a-descriptions-item>
        <a-descriptions-item label="入库日期">{{ detailHeader.stock_in_date ? dayjs(detailHeader.stock_in_date).format('YYYY-MM-DD') : '' }}</a-descriptions-item>
        <a-descriptions-item label="状态"><a-tag :color="detailHeader.approval_status === '已入库' ? 'green' : detailHeader.approval_status === '已撤回' ? 'orange' : 'default'">{{ detailHeader.approval_status }}</a-tag></a-descriptions-item>
        <a-descriptions-item label="操作人">{{ detailHeader.operator }}</a-descriptions-item>
        <a-descriptions-item label="创建时间">{{ detailHeader.creation_date }}</a-descriptions-item>
        <a-descriptions-item label="备注">{{ detailHeader.remark }}</a-descriptions-item>
      </a-descriptions>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" row-key="id" size="small" :scroll="{ x: 1100 }" />
    </a-modal>
  </div>
</template>