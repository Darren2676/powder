<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { getCompletedScrapStockCounts, getScrapMonthlyReport } from '@/api/warehouse/scrapDisposal'
import dayjs from 'dayjs'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const loading = ref(false)
const stockCountOptions = ref<any[]>([])
const selectedCountNumber = ref('')
const reportData = ref<any>(null)
const dataSource = ref<any[]>([])

const fetchStockCounts = async () => {
  try {
    const res: any = await getCompletedScrapStockCounts()
    stockCountOptions.value = res?.data || []
  } catch (e) {}
}

const onCountChange = (val: string) => {
  selectedCountNumber.value = val
  if (val) fetchReport()
}

const fetchReport = async () => {
  if (!selectedCountNumber.value) return
  loading.value = true
  try {
    const res: any = await getScrapMonthlyReport({ count_number: selectedCountNumber.value })
    if (res?.success) {
      reportData.value = res.data
      dataSource.value = res.data?.items || []
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '获取报表失败')
  } finally { loading.value = false }
}

const fmt = (val: any) => {
  const n = Number(val) || 0
  return n === 0 ? '-' : n.toFixed(2)
}

const fmtBold = (val: any) => {
  const n = Number(val) || 0
  return n.toFixed(2)
}

const columns = [
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 140, fixed: 'left' as const },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160, ellipsis: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, ellipsis: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, align: 'center' as const },
  { title: '期初数量', dataIndex: 'opening_qty', key: 'opening_qty', width: 100, align: 'right' as const },
  {
    title: '入库',
    children: [
      { title: '报废入库', dataIndex: 'in_scrap', key: 'in_scrap', width: 90, align: 'right' as const },
      { title: '盘盈', dataIndex: 'in_surplus', key: 'in_surplus', width: 80, align: 'right' as const },
      { title: '其他入库', dataIndex: 'in_other', key: 'in_other', width: 90, align: 'right' as const },
      { title: '入库合计', dataIndex: 'in_total', key: 'in_total', width: 100, align: 'right' as const }
    ]
  },
  {
    title: '出库',
    children: [
      { title: '报废处置', dataIndex: 'out_disposal', key: 'out_disposal', width: 90, align: 'right' as const },
      { title: '盘亏', dataIndex: 'out_shortage', key: 'out_shortage', width: 80, align: 'right' as const },
      { title: '其他出库', dataIndex: 'out_other', key: 'out_other', width: 90, align: 'right' as const },
      { title: '出库合计', dataIndex: 'out_total', key: 'out_total', width: 100, align: 'right' as const }
    ]
  },
  { title: '期末数量', dataIndex: 'closing_qty', key: 'closing_qty', width: 100, align: 'right' as const, fixed: 'right' as const }
]

const inKeys = ['in_scrap', 'in_surplus', 'in_other', 'in_total']
const outKeys = ['out_disposal', 'out_shortage', 'out_other', 'out_total']

// ==================== 导出Excel ====================
const exportLoading = ref(false)
const handleExport = async () => {
  if (!reportData.value || !dataSource.value.length) {
    message.warning('请先选择盘点单并生成报表数据')
    return
  }
  exportLoading.value = true
  try {
    const d = reportData.value
    const rows = dataSource.value
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('报废仓月度报表', {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    })

    // 列定义 (14列)
    const colDefs = [
      { key: 'item_number', width: 16 },
      { key: 'item_name', width: 20 },
      { key: 'specifications', width: 14 },
      { key: 'basic_unit', width: 8 },
      { key: 'opening_qty', width: 12 },
      { key: 'in_scrap', width: 12 },
      { key: 'in_surplus', width: 10 },
      { key: 'in_other', width: 12 },
      { key: 'in_total', width: 12 },
      { key: 'out_disposal', width: 12 },
      { key: 'out_shortage', width: 10 },
      { key: 'out_other', width: 12 },
      { key: 'out_total', width: 12 },
      { key: 'closing_qty', width: 12 }
    ]
    ws.columns = colDefs

    // 样式常量
    const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 10 }
    const headerFill: Partial<ExcelJS.Fill> = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
    const totalFont: Partial<ExcelJS.Font> = { bold: true, size: 10 }
    const totalFill: Partial<ExcelJS.Fill> = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
    }
    const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' }
    const rightAlign: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' }

    const pv = (val: any) => { const n = Number(val) || 0; return n === 0 ? '-' : n }
    const pvb = (val: any) => { const n = Number(val) || 0; return n }

    // Row 1: 标题
    const titleRow = ws.addRow(['报废仓月度报表'])
    titleRow.height = 30
    titleRow.getCell(1).font = { size: 16, bold: true }
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    ws.mergeCells('A1:N1')

    // Row 2: 元信息
    const metaText = `报表月份：${d.report_month}    仓库：${d.warehouse_name}    期初盘点：${d.count_period}    盘点单号：${d.count_number}`
    const metaRow = ws.addRow([metaText])
    metaRow.height = 20
    metaRow.getCell(1).font = { size: 10, color: { argb: 'FF666666' } }
    metaRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    ws.mergeCells('A2:N2')

    // Row 3: 空行
    ws.addRow([])

    // Row 4: 表头第一行（入库/出库分组）
    const headerRow1 = ws.addRow(['物料编号', '物料名称', '规格', '单位', '期初数量', '入库', '', '', '', '出库', '', '', '', '期末数量'])
    headerRow1.height = 22
    headerRow1.eachCell((cell) => { cell.font = headerFont; cell.fill = headerFill; cell.border = thinBorder; cell.alignment = centerAlign })
    ws.mergeCells('F4:I4')   // 入库
    ws.mergeCells('J4:M4')   // 出库

    // Row 5: 表头第二行（子列）
    const headerRow2 = ws.addRow(['', '', '', '', '', '报废入库', '盘盈', '其他入库', '入库合计', '报废处置', '盘亏', '其他出库', '出库合计', ''])
    headerRow2.height = 22
    headerRow2.eachCell((cell) => { cell.font = headerFont; cell.fill = headerFill; cell.border = thinBorder; cell.alignment = centerAlign })
    ws.mergeCells('A4:A5'); ws.mergeCells('B4:B5'); ws.mergeCells('C4:C5'); ws.mergeCells('D4:D5')
    ws.mergeCells('E4:E5'); ws.mergeCells('N4:N5')

    // 数据行
    const dataKeys = ['item_number', 'item_name', 'specifications', 'basic_unit', 'opening_qty', 'in_scrap', 'in_surplus', 'in_other', 'in_total', 'out_disposal', 'out_shortage', 'out_other', 'out_total', 'closing_qty']
    const textKeys = ['item_number', 'item_name', 'specifications', 'basic_unit']
    const boldDataKeys = ['in_total', 'out_total', 'closing_qty', 'opening_qty']
    rows.forEach(r => {
      const values = dataKeys.map(k => {
        if (textKeys.includes(k)) return r[k] || ''
        if (boldDataKeys.includes(k)) return pvb(r[k])
        return pv(r[k])
      })
      const row = ws.addRow(values)
      row.height = 18
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = thinBorder
        if (colNumber <= 4) cell.alignment = { vertical: 'middle', horizontal: colNumber <= 2 ? 'left' : 'center' }
        else cell.alignment = rightAlign
        if (colNumber === 5 || colNumber === 9 || colNumber === 13 || colNumber === 14) cell.font = { bold: true }
      })
    })

    // 合计行
    if (d.totals) {
      const t = d.totals
      const totalValues = ['合计', '', '', '', pvb(t.opening_qty), pv(t.in_scrap), pv(t.in_surplus), pv(t.in_other), pvb(t.in_total), pv(t.out_disposal), pv(t.out_shortage), pv(t.out_other), pvb(t.out_total), pvb(t.closing_qty)]
      const totalRow = ws.addRow(totalValues)
      totalRow.height = 20
      totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = thinBorder
        cell.font = totalFont
        cell.fill = totalFill
        if (colNumber <= 4) cell.alignment = centerAlign
        else cell.alignment = rightAlign
      })
      ws.mergeCells(`A${totalRow.number}:D${totalRow.number}`)
    }

    // 下载
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const filename = `报废仓月度报表_${d.report_month || dayjs().format('YYYYMM')}.xlsx`
    saveAs(blob, filename)
    message.success('导出成功')
  } catch (err) {
    console.error('导出失败', err)
    message.error('导出失败')
  } finally {
    exportLoading.value = false
  }
}

// ==================== 打印报表 ====================
const handlePrint = () => {
  if (!reportData.value || !dataSource.value.length) {
    message.warning('请先选择盘点单并生成报表数据')
    return
  }

  const d = reportData.value
  const rows = dataSource.value

  const pv = (val: any) => { const n = Number(val) || 0; return n === 0 ? '-' : n.toFixed(2) }
  const pvb = (val: any) => { const n = Number(val) || 0; return n.toFixed(2) }

  const buildRows = (items: any[]) => items.map(r => `
    <tr>
      <td>${r.item_number}</td>
      <td class="tl">${r.item_name || ''}</td>
      <td>${r.specifications || ''}</td>
      <td>${r.basic_unit || ''}</td>
      <td class="r b">${pvb(r.opening_qty)}</td>
      <td class="r">${pv(r.in_scrap)}</td>
      <td class="r">${pv(r.in_surplus)}</td>
      <td class="r">${pv(r.in_other)}</td>
      <td class="r b">${pvb(r.in_total)}</td>
      <td class="r">${pv(r.out_disposal)}</td>
      <td class="r">${pv(r.out_shortage)}</td>
      <td class="r">${pv(r.out_other)}</td>
      <td class="r b">${pvb(r.out_total)}</td>
      <td class="r b">${pvb(r.closing_qty)}</td>
    </tr>`).join('')

  const totalsRow = d.totals ? `
    <tr class="total-row">
      <td colspan="4">合计</td>
      <td class="r b">${pvb(d.totals.opening_qty)}</td>
      <td class="r">${pv(d.totals.in_scrap)}</td>
      <td class="r">${pv(d.totals.in_surplus)}</td>
      <td class="r">${pv(d.totals.in_other)}</td>
      <td class="r b">${pvb(d.totals.in_total)}</td>
      <td class="r">${pv(d.totals.out_disposal)}</td>
      <td class="r">${pv(d.totals.out_shortage)}</td>
      <td class="r">${pv(d.totals.out_other)}</td>
      <td class="r b">${pvb(d.totals.out_total)}</td>
      <td class="r b">${pvb(d.totals.closing_qty)}</td>
    </tr>` : ''

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>报废仓月度报表</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Microsoft YaHei', 'SimSun', sans-serif; font-size: 10px; color: #333; }
  .header { text-align: center; margin-bottom: 6px; }
  .header h1 { font-size: 18px; margin-bottom: 4px; }
  .header .meta { font-size: 11px; color: #666; }
  .header .meta span { margin: 0 12px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #999; padding: 3px 4px; text-align: center; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  th { background: #f0f0f0; font-weight: 600; }
  .r { text-align: right; }
  .tl { text-align: left; }
  .b { font-weight: 700; }
  .total-row td { background: #f5f5f5; font-weight: 700; }
  .col-qty { width: 6.5%; }
  .footer { margin-top: 8px; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
</style>
</head><body>
<div class="header">
  <h1>报废仓月度报表</h1>
  <div class="meta">
    <span>报表月份：${d.report_month}</span>
    <span>仓库：${d.warehouse_name}</span>
    <span>期初盘点：${d.count_period}</span>
    <span>盘点单号：${d.count_number}</span>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>物料编号</th>
      <th>物料名称</th>
      <th>规格</th>
      <th>单位</th>
      <th class="col-qty">期初数量</th>
      <th class="col-qty">报废入库</th>
      <th class="col-qty">盘盈</th>
      <th class="col-qty">其他入库</th>
      <th class="col-qty">入库合计</th>
      <th class="col-qty">报废处置</th>
      <th class="col-qty">盘亏</th>
      <th class="col-qty">其他出库</th>
      <th class="col-qty">出库合计</th>
      <th class="col-qty">期末数量</th>
    </tr>
  </thead>
  <tbody>
    ${buildRows(rows)}
    ${totalsRow}
  </tbody>
</table>
<div class="footer">
  <span>打印时间：${dayjs().format('YYYY-MM-DD HH:mm')}</span>
  <span>共 ${rows.length} 条记录</span>
</div>
</body></html>`

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.onload = () => { printWindow.print() }
  } else {
    message.error('无法打开打印窗口，请允许弹出窗口')
  }
}

onMounted(() => { fetchStockCounts() })
</script>

<template>
  <div style="padding: 20px">
    <!-- 顶部筛选 -->
    <div style="margin-bottom: 16px">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: nowrap">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">报废仓月度报表</span>
        <span style="font-weight: 500; white-space: nowrap; flex-shrink: 0">基础盘点单:</span>
        <a-select
          v-model:value="selectedCountNumber"
          placeholder="选择已完成的报废仓盘点单"
          style="min-width: 320px; flex: 0 1 380px"
          show-search
          allow-clear
          :filter-option="(input: string, option: any) => {
            const item = stockCountOptions.find((s: any) => s.count_number === option.value)
            return item ? (item.count_number + item.warehouse_name + item.count_period).toLowerCase().includes(input.toLowerCase()) : false
          }"
          @change="onCountChange"
        >
          <a-select-option v-for="s in stockCountOptions" :key="s.count_number" :value="s.count_number">
            {{ s.count_number }} | {{ s.count_period }} | {{ s.warehouse_name }}
          </a-select-option>
        </a-select>
        <a-button v-if="reportData" type="primary" @click="handlePrint">
          <template #icon><PrinterOutlined /></template>
          打印
        </a-button>
        <a-button v-if="reportData" :loading="exportLoading" @click="handleExport">
          <template #icon><DownloadOutlined /></template>
          导出
        </a-button>
        <div style="flex: 1" />
        <template v-if="reportData">
          <a-tag color="blue">报表月份: {{ reportData.report_month }}</a-tag>
          <a-tag color="red">仓库: {{ reportData.warehouse_name }}</a-tag>
          <a-tag>期初盘点: {{ reportData.count_period }}</a-tag>
        </template>
      </div>
    </div>

    <!-- 报表表格 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="false"
      :row-key="(record: any) => record.item_number"
      :scroll="{ x: 1700 }"
      size="small"
      bordered
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'opening_qty'">
          <span style="font-weight: 600">{{ fmtBold(record.opening_qty) }}</span>
        </template>
        <template v-else-if="inKeys.includes(column.key)">
          <span :style="{ color: Number(record[column.key]) > 0 ? '#52c41a' : '', fontWeight: column.key === 'in_total' ? '600' : 'normal' }">
            {{ column.key === 'in_total' ? fmtBold(record[column.key]) : fmt(record[column.key]) }}
          </span>
        </template>
        <template v-else-if="outKeys.includes(column.key)">
          <span :style="{ color: Number(record[column.key]) > 0 ? '#f5222d' : '', fontWeight: column.key === 'out_total' ? '600' : 'normal' }">
            {{ column.key === 'out_total' ? fmtBold(record[column.key]) : fmt(record[column.key]) }}
          </span>
        </template>
        <template v-else-if="column.key === 'closing_qty'">
          <span style="font-weight: 700">{{ fmtBold(record.closing_qty) }}</span>
        </template>
      </template>

      <!-- 合计行 -->
      <template #summary v-if="reportData?.totals">
        <a-table-summary fixed>
          <a-table-summary-row>
            <a-table-summary-cell :index="0" :col-span="4">
              <span style="font-weight: 700">合计</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="4" align="right">
              <span style="font-weight: 700">{{ fmtBold(reportData.totals.opening_qty) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="5" align="right">
              <span style="color: #52c41a">{{ fmt(reportData.totals.in_scrap) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="6" align="right">
              <span style="color: #52c41a">{{ fmt(reportData.totals.in_surplus) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="7" align="right">
              <span style="color: #52c41a">{{ fmt(reportData.totals.in_other) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="8" align="right">
              <span style="color: #52c41a; font-weight: 700">{{ fmtBold(reportData.totals.in_total) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="9" align="right">
              <span style="color: #f5222d">{{ fmt(reportData.totals.out_disposal) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="10" align="right">
              <span style="color: #f5222d">{{ fmt(reportData.totals.out_shortage) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="11" align="right">
              <span style="color: #f5222d">{{ fmt(reportData.totals.out_other) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="12" align="right">
              <span style="color: #f5222d; font-weight: 700">{{ fmtBold(reportData.totals.out_total) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="13" align="right">
              <span style="font-weight: 700">{{ fmtBold(reportData.totals.closing_qty) }}</span>
            </a-table-summary-cell>
          </a-table-summary-row>
        </a-table-summary>
      </template>
    </a-table>

    <a-empty v-if="!selectedCountNumber && !loading" description="请选择一个已完成的报废仓盘点单以生成报表" style="margin-top: 60px" />
  </div>
</template>
