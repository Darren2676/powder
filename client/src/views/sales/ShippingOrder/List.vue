<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, DownOutlined,
  PrinterOutlined, CheckCircleOutlined, SettingOutlined, ExclamationCircleOutlined,
  StopOutlined
} from '@ant-design/icons-vue'
import {
  getShippingOrders, getShippingOrderDetail,
  updateShippingOrderLogistics, updateShippingOrderStatus,
  getShippingOrderPrintData, cancelShippingOrder
} from '@/api/sales/shippingOrder'
import { getInvoicesByShippingDetail } from '@/api/sales/salesInvoice'
import { getLogisticsCompanies } from '@/api/master-data/logisticsCompany'
import { getCustomerDetail } from '@/api/master-data/customer'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'




const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getShippingOrders)

const filterStatus = ref('')



const defaultDataColumns: any[] = [
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160, resizable: true },
  { title: '出库仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130, resizable: true },
  { title: '发货日期', dataIndex: 'shipping_date', key: 'shipping_date', width: 110, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '承运商', dataIndex: 'carrier', key: 'carrier', width: 140, resizable: true },
  { title: '运单号', dataIndex: 'tracking_number', key: 'tracking_number', width: 150, resizable: true },
  { title: '运费', dataIndex: 'freight', key: 'freight', width: 100, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100, resizable: true },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 170, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('shipping_order_list', defaultDataColumns, {
  fixedLeft: [{ title: '发货单号', dataIndex: 'shipping_order_number', key: 'shipping_order_number', width: 170, fixed: 'left' as const, resizable: true }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
})

const statusColors: Record<string, string> = {
  '待发货': 'orange',
  '已发货': 'blue',
  '已签收': 'green',
  '已取消': 'red'
}

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
const formatDateTime = (date: any) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'

// ==================== 详情弹窗 ====================
const detailVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const { modalStyle: logisticsModalStyle, onDragStart: logisticsDragStart, resetDrag: logisticsResetDrag } = useModalDrag()
const detailLoading = ref(false)
const detailHeader = ref<any>({})
const detailItems = ref<any[]>([])

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', width: 60 },
  { title: '发货申请号', dataIndex: 'request_number', width: 160, resizable: true },
  { title: '销售订单号', dataIndex: 'sales_order_number', width: 150, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', width: 70, resizable: true },
  { title: '发货数量', dataIndex: 'quantity', width: 100, resizable: true },
  { title: '开票状态', dataIndex: 'invoice_status', key: 'invoice_status', width: 100 }
]

const batchColumns = [
  { title: '批次号', dataIndex: 'batch_number', width: 160 },
  { title: '产品编号', dataIndex: 'item_number', width: 130 },
  { title: '数量', dataIndex: 'quantity', width: 100 }
]

const handleViewDetail = async (record: any) => {
  detailResetDrag()
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res: any = await getShippingOrderDetail(record.shipping_order_number)
    if (res?.success) {
      detailHeader.value = res.data.header
      detailItems.value = res.data.details || []
    }
  } catch {
    message.error('获取发货单详情失败')
  } finally {
    detailLoading.value = false
  }
}

// ==================== 开票状态双向查询 ====================
const invoiceStatusColors: Record<string, string> = {
  '未开票': 'default',
  '部分开票': 'orange',
  '已开票': 'green'
}
const relatedInvoicesVisible = ref(false)
const relatedInvoicesLoading = ref(false)
const relatedInvoices = ref<any[]>([])
const relatedInvoicesDetailId = ref(0)

const handleViewRelatedInvoices = async (detailId: number) => {
  relatedInvoicesDetailId.value = detailId
  relatedInvoicesVisible.value = true
  relatedInvoicesLoading.value = true
  try {
    const res: any = await getInvoicesByShippingDetail(detailId)
    if (res?.success) relatedInvoices.value = res.data || []
  } catch { message.error('获取关联发票失败') }
  finally { relatedInvoicesLoading.value = false }
}

const relatedInvoiceColumns = [
  { title: '发票编号', dataIndex: 'invoice_number', width: 170 },
  { title: '发票代码', dataIndex: 'invoice_code', width: 120 },
  { title: '发票号码', dataIndex: 'invoice_no', width: 120 },
  { title: '开票日期', dataIndex: 'invoice_date', width: 110 },
  { title: '客户名称', dataIndex: 'customer_name', width: 140 },
  { title: '开票数量', dataIndex: 'invoice_quantity', width: 90 },
  { title: '含税单价', dataIndex: 'unit_price', width: 90 },
  { title: '不含税金额', dataIndex: 'amount_without_tax', width: 110 },
  { title: '审批状态', dataIndex: 'approval_status', width: 90 }
]

// ==================== 物流信息编辑 ====================
const logisticsVisible = ref(false)
const logisticsLoading = ref(false)
const logisticsForm = reactive({
  shipping_order_number: '',
  carrier: '',
  tracking_number: '',
  freight: 0,
  shipping_address: '',
  contact_person: '',
  contact_phone: ''
})

const logisticsCompanyList = ref<any[]>([])

const loadLogisticsCompanies = async () => {
  try {
    const res: any = await getLogisticsCompanies({ page: 1, limit: 9999, condition: '启用' })
    logisticsCompanyList.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

const fillCustomerInfo = async (customerNumber: string) => {
  try {
    const res: any = await getCustomerDetail(customerNumber)
    if (!res?.success) return
    const c = res.data
    // 优先从 customer_address 中取"发货地址"
    const shipAddr = (c.addresses || []).find((a: any) => (a.address_type || '').trim() === '发货地址')
    if (shipAddr) {
      if (!logisticsForm.shipping_address) logisticsForm.shipping_address = [shipAddr.region, shipAddr.detail_address].filter(Boolean).join('')
      if (!logisticsForm.contact_person) logisticsForm.contact_person = shipAddr.receiver || ''
      if (!logisticsForm.contact_phone) logisticsForm.contact_phone = shipAddr.mobile || shipAddr.telephone || ''
    } else {
      // 没有发货地址记录，则从客户主表取
      const fullAddr = [c.region, c.region2, c.region3, c.region4, c.detail_address].filter(Boolean).join('')
      if (!logisticsForm.shipping_address) logisticsForm.shipping_address = fullAddr
      if (!logisticsForm.contact_person) logisticsForm.contact_person = c.linkman || ''
      if (!logisticsForm.contact_phone) logisticsForm.contact_phone = c.contacts || c.telephone || ''
    }
  } catch { /* ignore */ }
}

const handleEditLogistics = async (record: any) => {
  logisticsForm.shipping_order_number = record.shipping_order_number
  logisticsForm.carrier = record.carrier || ''
  logisticsForm.tracking_number = record.tracking_number || ''
  logisticsForm.freight = record.freight || 0
  logisticsForm.shipping_address = record.shipping_address || ''
  logisticsForm.contact_person = record.contact_person || ''
  logisticsForm.contact_phone = record.contact_phone || ''
  logisticsResetDrag()
  logisticsVisible.value = true
  await Promise.all([loadLogisticsCompanies(), fillCustomerInfo(record.customer_number)])
}

const handleCarrierSelect = (val: string) => {
  const found = logisticsCompanyList.value.find((c: any) => c.company_name === val || c.company_number === val)
  if (found) {
    logisticsForm.carrier = found.company_name || val
    logisticsForm.contact_person = found.contact_person || logisticsForm.contact_person
    logisticsForm.contact_phone = found.mobile || found.telephone || logisticsForm.contact_phone
    logisticsForm.shipping_address = logisticsForm.shipping_address || found.address || ''
  } else {
    logisticsForm.carrier = val
  }
}

const handleLogisticsSubmit = async () => {
  logisticsLoading.value = true
  try {
    const res: any = await updateShippingOrderLogistics(logisticsForm.shipping_order_number, {
      carrier: logisticsForm.carrier,
      tracking_number: logisticsForm.tracking_number,
      freight: logisticsForm.freight,
      shipping_address: logisticsForm.shipping_address,
      contact_person: logisticsForm.contact_person,
      contact_phone: logisticsForm.contact_phone
    })
    if (res?.success) {
      message.success('物流信息更新成功')
      logisticsVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '更新物流信息失败')
  } finally {
    logisticsLoading.value = false
  }
}

// ==================== 签收确认 ====================
const handleConfirmReceive = (record: any) => {
  Modal.confirm({
    title: '签收确认',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确认发货单「${record.shipping_order_number}」已签收？`,
    okText: '确认签收',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await updateShippingOrderStatus(record.shipping_order_number, { status: '已签收' })
        if (res?.success) {
          message.success('已确认签收')
          fetchData()
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '操作失败')
      }
    }
  })
}

// ==================== 撤消发货单 ====================
const handleCancelOrder = (record: any) => {
  const statusLabel = (record.status || '').trim()
  const extraWarning = statusLabel === '已发货' ? '\n\n⚠ 此发货单已出库，撤消后将回冲库存（含批次库存、箱码状态回退）并作废出库流水。' : ''
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消发货单「${record.shipping_order_number}」吗？当前状态：${statusLabel}${extraWarning}`,
    okText: '确认撤消',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await cancelShippingOrder(record.shipping_order_number)
        if (res?.success) {
          message.success('发货单已撤消')
          fetchData()
        } else {
          message.error(res?.message || '撤消失败')
        }
      } catch (err: any) {
        message.error(err.response?.data?.message || '撤消失败')
      }
    }
  })
}

// ==================== 打印 ====================
const handlePrint = async (record: any) => {
  try {
    const res: any = await getShippingOrderPrintData(record.shipping_order_number)
    if (!res?.success) { message.error('获取打印数据失败'); return }

    const { header, details } = res.data

    let detailRows = ''
    let batchRows = ''
    let rowIndex = 0

    for (const d of details) {
      rowIndex++
      detailRows += `<tr>
        <td style="text-align:center">${rowIndex}</td>
        <td>${d.item_number || ''}</td>
        <td>${d.item_name || ''}</td>
        <td>${d.specifications || ''}</td>
        <td style="text-align:center">${d.basic_unit || ''}</td>
        <td style="text-align:right">${d.quantity || 0}</td>
        <td>${d.sales_order_number || ''}</td>
        <td>${d.remark || ''}</td>
      </tr>`

      if (d.batches && d.batches.length > 0) {
        for (const b of d.batches) {
          batchRows += `<tr>
            <td>${d.item_number || ''}</td>
            <td>${d.item_name || ''}</td>
            <td>${b.batch_number || ''}</td>
            <td style="text-align:right">${b.quantity || 0}</td>
          </tr>`
        }
      }
    }

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>发货单 - ${header.shipping_order_number}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: SimSun, serif; font-size: 12px; color: #333; }
  .header { text-align: center; margin-bottom: 20px; }
  .header h1 { font-size: 22px; margin: 0 0 4px 0; }
  .header .no { font-size: 14px; color: #666; }
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .info-table td { padding: 4px 8px; font-size: 12px; }
  .info-table .label { color: #888; width: 80px; }
  table.detail { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table.detail th, table.detail td { border: 1px solid #999; padding: 4px 6px; font-size: 11px; }
  table.detail th { background: #f0f0f0; font-weight: bold; text-align: center; }
  .section-title { font-size: 13px; font-weight: bold; margin: 16px 0 8px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .sign-area { margin-top: 40px; display: flex; justify-content: space-between; }
  .sign-area .sign-item { width: 30%; }
  .sign-area .sign-line { border-bottom: 1px solid #333; margin-top: 30px; }
  @media print { button { display: none !important; } }
</style></head><body>
<div class="header">
  <h1>发 货 单</h1>
  <div class="no">单号：${header.shipping_order_number}</div>
</div>
<table class="info-table">
  <tr>
    <td class="label">客户名称：</td><td>${header.customer_name || ''}</td>
    <td class="label">出库仓库：</td><td>${header.warehouse_name || ''}</td>
    <td class="label">发货日期：</td><td>${header.shipping_date ? new Date(header.shipping_date).toLocaleDateString('zh-CN') : ''}</td>
  </tr>
  <tr>
    <td class="label">承运商：</td><td>${header.carrier || ''}</td>
    <td class="label">运单号：</td><td>${header.tracking_number || ''}</td>
    <td class="label">运费：</td><td>${header.freight || ''}</td>
  </tr>
  <tr>
    <td class="label">收货地址：</td><td colspan="3">${header.shipping_address || ''}</td>
    <td class="label">联系人：</td><td>${header.contact_person || ''}${header.contact_phone ? ' ' + header.contact_phone : ''}</td>
  </tr>
  <tr>
    <td class="label">备注：</td><td colspan="5">${header.remark || ''}</td>
  </tr>
</table>

<div class="section-title">发货明细</div>
<table class="detail">
  <thead><tr>
    <th style="width:40px">序号</th><th>产品编号</th><th>产品名称</th><th>规格</th>
    <th style="width:50px">单位</th><th style="width:70px">数量</th><th>销售订单号</th><th>备注</th>
  </tr></thead>
  <tbody>${detailRows}</tbody>
</table>

${batchRows ? `
<div class="section-title">批次明细</div>
<table class="detail">
  <thead><tr><th>产品编号</th><th>产品名称</th><th>批次号</th><th style="width:80px">数量</th></tr></thead>
  <tbody>${batchRows}</tbody>
</table>` : ''}

<div class="sign-area">
  <div class="sign-item">制单人：${header.creation_man || ''}<div class="sign-line"></div></div>
  <div class="sign-item">发货人：<div class="sign-line"></div></div>
  <div class="sign-item">收货人：<div class="sign-line"></div></div>
</div>

<div style="text-align:center; margin-top:20px">
  <button onclick="window.print()" style="padding:8px 24px; font-size:14px; cursor:pointer">打印</button>
</div>
</body></html>`

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
    } else {
      message.error('无法打开打印窗口，请检查浏览器弹窗设置')
    }
  } catch {
    message.error('获取打印数据失败')
  }
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px">
      <div style="display: flex; gap: 8px; align-items: center">
        <span style="font-size: 18px; font-weight: 600; color: #1a1a2e; margin-right: 4px; white-space: nowrap">发货单</span>
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索发货单号/客户/承运商/运单号"
          style="width: 320px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select
          v-model:value="filterStatus"
          placeholder="全部状态"
          style="width: 120px"
          allow-clear
          @change="handleSearch"
        >
          <a-select-option value="已发货">已发货</a-select-option>
          <a-select-option value="已签收">已签收</a-select-option>
          <a-select-option value="已取消">已取消</a-select-option>
        </a-select>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 1600 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="statusColors[record.status] || 'default'">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'shipping_date'">
          {{ formatDate(record.shipping_date) }}
        </template>
        <template v-else-if="column.key === 'creation_date'">
          {{ formatDateTime(record.creation_date) }}
        </template>
        <template v-else-if="column.key === 'freight'">
          <span v-if="record.freight > 0">{{ record.freight }}</span>
          <span v-else style="color: #ccc">-</span>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleViewDetail(record)">查看</a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="(record.status || '').trim() !== '已取消'" @click="handleEditLogistics(record)">物流信息</a-menu-item>
                  <a-menu-item @click="handlePrint(record)"><PrinterOutlined style="margin-right:4px" />打印</a-menu-item>
                  <a-menu-item v-if="(record.status || '').trim() === '已发货'" @click="handleConfirmReceive(record)">
                    <span style="color: #52c41a"><CheckCircleOutlined style="margin-right:4px" />签收</span>
                  </a-menu-item>
                  <a-menu-divider v-if="(record.status || '').trim() !== '已取消' && (record.status || '').trim() !== '已签收'" />
                  <a-menu-item v-if="(record.status || '').trim() !== '已取消' && (record.status || '').trim() !== '已签收'" @click="handleCancelOrder(record)">
                    <span style="color: #ff4d4f"><StopOutlined style="margin-right:4px" />撤消</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 详情弹窗 -->
    <a-modal v-model:open="detailVisible" width="1100px" :footer="null"
      :style="detailModalStyle"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }">
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">发货单详情</div>
      </template>
      <a-spin :spinning="detailLoading">
        <a-descriptions bordered :column="3" size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="发货单号">{{ detailHeader.shipping_order_number }}</a-descriptions-item>
          <a-descriptions-item label="客户名称">{{ detailHeader.customer_name }}</a-descriptions-item>
          <a-descriptions-item label="出库仓库">{{ detailHeader.warehouse_name }}</a-descriptions-item>
          <a-descriptions-item label="发货日期">{{ formatDate(detailHeader.shipping_date) }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="statusColors[detailHeader.status] || 'default'">{{ detailHeader.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="创建人">{{ detailHeader.creation_man }}</a-descriptions-item>
          <a-descriptions-item label="承运商">{{ detailHeader.carrier || '-' }}</a-descriptions-item>
          <a-descriptions-item label="运单号">{{ detailHeader.tracking_number || '-' }}</a-descriptions-item>
          <a-descriptions-item label="运费">{{ detailHeader.freight || '-' }}</a-descriptions-item>
          <a-descriptions-item label="收货地址" :span="2">{{ detailHeader.shipping_address || '-' }}</a-descriptions-item>
          <a-descriptions-item label="联系人">{{ detailHeader.contact_person || '-' }}{{ detailHeader.contact_phone ? ' ' + detailHeader.contact_phone : '' }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="3">{{ detailHeader.remark || '-' }}</a-descriptions-item>
        </a-descriptions>

        <div style="font-weight: 600; margin-bottom: 8px">发货明细</div>
        <a-table
          :columns="detailColumns"
          :data-source="detailItems"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 1000 }"
          :expandedRowKeys="detailItems.filter((d: any) => d.batches && d.batches.length > 0).map((d: any) => d.id)"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'quantity'">
              <span style="color: #fa541c; font-weight: 600">{{ record.quantity }}</span>
            </template>
            <template v-else-if="column.key === 'invoice_status'">
              <a-tag :color="invoiceStatusColors[record.invoice_status] || 'default'" style="cursor: pointer" @click="handleViewRelatedInvoices(record.id)">
                {{ record.invoice_status || '未开票' }}
              </a-tag>
            </template>
          </template>
          <template #expandedRowRender="{ record }">
            <div v-if="record.batches && record.batches.length > 0" style="padding: 4px 0">
              <div style="font-size: 12px; color: #888; margin-bottom: 4px">批次明细：</div>
              <a-table
                :columns="batchColumns"
                :data-source="record.batches"
                :pagination="false"
                row-key="id"
                size="small"
                bordered
              />
            </div>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <!-- 物流信息编辑弹窗 -->
    <a-modal v-model:open="logisticsVisible" width="600px"
      :style="logisticsModalStyle"
      @ok="handleLogisticsSubmit" :confirmLoading="logisticsLoading" okText="保存">
      <template #title>
        <div class="drag-handle" @mousedown="logisticsDragStart">编辑物流信息</div>
      </template>
      <a-form :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }">
        <a-form-item label="承运商">
          <a-select
            v-model:value="logisticsForm.carrier"
            show-search
            option-filter-prop="label"
            placeholder="选择或输入承运商"
            style="width: 100%"
            allow-clear
            @change="handleCarrierSelect"
          >
            <a-select-option v-for="c in logisticsCompanyList" :key="c.company_number" :value="c.company_name" :label="c.company_name">{{ c.company_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="运单号">
          <a-input v-model:value="logisticsForm.tracking_number" placeholder="请输入运单号" />
        </a-form-item>
        <a-form-item label="运费">
          <a-input-number v-model:value="logisticsForm.freight" :min="0" :precision="2" style="width: 100%" placeholder="请输入运费" />
        </a-form-item>
        <a-form-item label="收货地址">
          <a-textarea v-model:value="logisticsForm.shipping_address" :rows="2" placeholder="请输入收货地址" />
        </a-form-item>
        <a-form-item label="联系人">
          <a-input v-model:value="logisticsForm.contact_person" placeholder="请输入联系人" />
        </a-form-item>
        <a-form-item label="联系电话">
          <a-input v-model:value="logisticsForm.contact_phone" placeholder="请输入联系电话" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 关联发票弹窗 -->
    <a-modal v-model:open="relatedInvoicesVisible" title="关联发票列表" width="900px" :footer="null">
      <a-spin :spinning="relatedInvoicesLoading">
        <a-table
          :columns="relatedInvoiceColumns"
          :data-source="relatedInvoices"
          :pagination="false"
          row-key="invoice_number"
          size="small"
          bordered
          :scroll="{ y: 350 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'approval_status'">
              <a-tag :color="record.approval_status === '已审批' ? 'green' : 'orange'">{{ record.approval_status }}</a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'invoice_date'">
              {{ formatDate(record.invoice_date) }}
            </template>
          </template>
        </a-table>
        <div v-if="!relatedInvoicesLoading && relatedInvoices.length === 0" style="text-align: center; color: #999; padding: 20px">
          该发货明细行暂无关联发票
        </div>
      </a-spin>
    </a-modal>

    <ColumnSettingDrawer
      v-model:open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
