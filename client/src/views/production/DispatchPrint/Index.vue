<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  PrinterOutlined,
  SearchOutlined,
  ReloadOutlined,
  FileTextOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  SettingOutlined
} from '@ant-design/icons-vue'
import { getOrders, getPrintData } from '@/api/production/order'
import { getSchedules } from '@/api/master-data/schedule'
import dayjs from 'dayjs'
import QRCode from 'qrcode'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'

interface Order {
  production_order_number: string
  production_number: string
  item_number: string
  item_name: string
  basic_unit: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
  planned_quantity: number
  equipment_number: string
  equipment_name: string
  mould_number: string
  formed_part_specifications: string
  formed_part_unit_consumption: string
  actual_cavity_count: string
  actual_hole_count: string
  actual_daily_output: string
  planned_completion_time: string | null
  production_date: string | null
  schedule_id: string
  plan_status: string
  remark: string
}

const loading = ref(false)
const dataSource = ref<Order[]>([])
const selectedRowKeys = ref<string[]>([])
const scheduleList = ref<any[]>([])
const printVisible = ref(false)
const detailPrintLoading = ref(false)
const detailPrintData = ref<any[]>([])

// 筛选条件
const filters = reactive({
  production_date: '',
  schedule_id: '',
  equipment_number: '',
  item_number: '',
  search: ''
})

const pagination = reactive({
  current: 1,
  pageSize: 50,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['20', '50', '100', '200'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultDataColumns: any[] = [
  { title: '生产日期', dataIndex: 'production_date', key: 'production_date', width: 110, resizable: true },
  { title: '班次', dataIndex: 'schedule_id', key: 'schedule_id', width: 80, resizable: true },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 120, ellipsis: true, resizable: true },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 140, resizable: true },
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number', width: 140, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 110, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 130, ellipsis: true, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, ellipsis: true, resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 85, align: 'right' as const, resizable: true },
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 90, resizable: true },
  { title: '模具编号', dataIndex: 'mould_number', key: 'mould_number', width: 110, resizable: true },
  { title: '成型件规格', dataIndex: 'formed_part_specifications', key: 'formed_part_specifications', width: 110, ellipsis: true, resizable: true },
  { title: '成型件单耗', dataIndex: 'formed_part_unit_consumption', key: 'formed_part_unit_consumption', width: 100, align: 'right' as const, resizable: true },
  { title: '实际模腔', dataIndex: 'actual_cavity_count', key: 'actual_cavity_count', width: 80, align: 'right' as const, resizable: true },
  { title: '实际模穴', dataIndex: 'actual_hole_count', key: 'actual_hole_count', width: 80, align: 'right' as const, resizable: true },
  { title: '实际班产', key: 'actual_daily_output', width: 85, align: 'right' as const, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('dispatch_print', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 55, align: 'center' as const, fixed: 'left' as const }],
  fixedRight: []
})

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))

const getScheduleName = (scheduleId: string | null) => {
  if (!scheduleId) return ''
  const schedule = scheduleList.value.find((s: any) => s.schedules_id === scheduleId)
  return schedule ? (schedule.schedules_name || scheduleId) : scheduleId
}

const calcActualDailyOutput = (record: Order) => {
  const cavity = Number(record.actual_cavity_count) || 0
  const hole = Number(record.actual_hole_count) || 0
  if (cavity > 0 && hole > 0) return cavity * hole
  return record.actual_daily_output || '-'
}

// 按生产日期(升序)+班次+设备编号排序
const sortByDateShiftEquip = (list: Order[]) => {
  return [...list].sort((a, b) => {
    const dateCmp = (a.production_date || '').localeCompare(b.production_date || '')
    if (dateCmp !== 0) return dateCmp
    const shiftCmp = (a.schedule_id || '').localeCompare(b.schedule_id || '')
    if (shiftCmp !== 0) return shiftCmp
    return (a.equipment_number || '').localeCompare(b.equipment_number || '')
  })
}

const selectedOrders = computed(() => {
  return dataSource.value.filter(o => selectedRowKeys.value.includes(o.production_order_number))
})

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getOrders({
      page: pagination.current,
      limit: pagination.pageSize,
      status: '已派发',
      search: filters.search || undefined,
      production_date: filters.production_date || undefined,
      schedule_id: filters.schedule_id || undefined,
      equipment_number: filters.equipment_number || undefined,
      item_number: filters.item_number || undefined
    })
    if (res.success) {
      // 列表也按 生产日期(升序)+班次+设备编号 排序显示
      dataSource.value = sortByDateShiftEquip(res.data.items)
      pagination.total = res.data.pagination.total
    }
  } catch {
    message.error('获取数据失败')
  } finally {
    loading.value = false
  }
}

const loadSchedules = async () => {
  try {
    const res = await getSchedules({ page: 1, limit: 100 })
    if (res.success) {
      scheduleList.value = res.data.items || []
    }
  } catch { /* ignore */ }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => {
  filters.search = ''
  filters.production_date = ''
  filters.schedule_id = ''
  filters.equipment_number = ''
  filters.item_number = ''
  pagination.current = 1
  fetchData()
}

const handleSelectAll = () => {
  selectedRowKeys.value = dataSource.value.map(o => o.production_order_number)
}

const handleDeselectAll = () => {
  selectedRowKeys.value = []
}

// ==================== 列表打印功能 ====================
const handlePrint = () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先勾选需要打印的调度单')
    return
  }
  printVisible.value = true
  setTimeout(() => {
    triggerPrint()
  }, 500)
}

const triggerPrint = () => {
  const printContent = document.getElementById('print-area')
  if (!printContent) return

  const printWindow = window.open('', '_blank', 'width=900,height=700')
  if (!printWindow) {
    message.error('无法打开打印窗口，请检查浏览器是否允许弹出窗口')
    return
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>生产调度单打印</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 10mm 12mm;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: "Microsoft YaHei", "SimHei", sans-serif;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-page {
          page-break-after: always;
          padding: 4mm 0;
        }
        .print-page:last-child {
          page-break-after: avoid;
        }
        .print-header {
          text-align: center;
          margin-bottom: 6px;
        }
        .print-title {
          font-size: 20px;
          font-weight: bold;
          letter-spacing: 4px;
        }
        .print-subtitle {
          font-size: 11px;
          color: #666;
          margin-top: 2px;
        }
        .print-info {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin-bottom: 6px;
          padding: 0 2px;
        }
        .print-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        .print-table th, .print-table td {
          border: 1px solid #000;
          padding: 4px 6px;
          text-align: center;
          white-space: nowrap;
        }
        .print-table th {
          background-color: #f0f0f0;
          font-weight: bold;
          font-size: 11px;
        }
        .print-table td {
          font-size: 11px;
        }
        .print-table td.text-left {
          text-align: left;
        }
        .print-table td.text-right {
          text-align: right;
        }
        .print-footer {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin-top: 10px;
          padding: 0 2px;
        }
        .print-footer-item {
          min-width: 150px;
        }
        .signature-line {
          display: inline-block;
          width: 100px;
          border-bottom: 1px solid #000;
          margin-left: 8px;
        }
        @media screen {
          body { padding: 20px; background: #f5f5f5; }
          .print-page {
            background: #fff;
            padding: 20px 24px;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 1100px;
            margin-left: auto;
            margin-right: auto;
          }
        }
      </style>
    </head>
    <body>
      ${printContent.innerHTML}
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 300);
        };
      <\/script>
    </body>
    </html>
  `)
  printWindow.document.close()
  printVisible.value = false
}

// 打印数据排序（与列表排序一致）
const sortedSelectedOrders = computed(() => {
  return sortByDateShiftEquip(selectedOrders.value)
})

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  return dayjs(dateStr).format('YYYY-MM-DD')
}

// ==================== 详细打印功能（三栏：基本信息+备料清单+工序任务） ====================
const qrCodeMap = ref<Record<string, string>>({})

const handleDetailPrint = async () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先勾选需要打印的调度单')
    return
  }
  detailPrintLoading.value = true
  try {
    const res = await getPrintData(selectedRowKeys.value)
    if (res.success && res.data?.items?.length > 0) {
      detailPrintData.value = res.data.items
      // 为每个生产单生成二维码（指向移动端生产单详情页，支持备料和报工）
      const qrMap: Record<string, string> = {}
      for (const item of res.data.items) {
        const orderNum = item.order.production_order_number
        const mobileUrl = `${window.location.protocol}//${window.location.hostname}:5174/order/${encodeURIComponent(orderNum)}`
        try {
          qrMap[orderNum] = await QRCode.toDataURL(mobileUrl, {
            width: 120,
            margin: 1,
            errorCorrectionLevel: 'M'
          })
        } catch {
          qrMap[orderNum] = ''
        }
      }
      qrCodeMap.value = qrMap
      setTimeout(() => {
        triggerDetailPrint()
      }, 300)
    } else {
      message.warning('未获取到打印数据')
    }
  } catch {
    message.error('获取打印数据失败')
  } finally {
    detailPrintLoading.value = false
  }
}

const triggerDetailPrint = () => {
  const items = detailPrintData.value
  if (!items || items.length === 0) return

  const printWindow = window.open('', '_blank', 'width=800,height=1000')
  if (!printWindow) {
    message.error('无法打开打印窗口，请检查浏览器是否允许弹出窗口')
    return
  }

  // 班产计算函数（与列表页逻辑一致）
  const calcDailyOutput = (order: any) => {
    const cavity = Number(order.actual_cavity_count) || 0
    const hole = Number(order.actual_hole_count) || 0
    if (cavity > 0 && hole > 0) return String(cavity * hole)
    return order.actual_daily_output || order.batch_production_quota || '-'
  }

  // 格式化时间（去掉秒）
  const fmtTime = (dt: string | null) => {
    if (!dt) return ''
    return dayjs(dt).format('MM-DD HH:mm')
  }

  // 格式化数量（去除尾部多余零）
  const fmtQty = (v: any) => {
    if (v === null || v === undefined || v === '') return ''
    const n = Number(v)
    if (isNaN(n)) return String(v)
    return String(parseFloat(n.toFixed(4)))
  }

  // 为每条记录生成三栏打印内容
  let pagesHtml = ''
  items.forEach((item: any, pageIdx: number) => {
    const order = item.order
    const materials = item.materials || []
    const tasks = item.tasks || []
    const scheduleName = getScheduleName(order.schedule_id)
    const isLast = pageIdx === items.length - 1
    const orderNum = order.production_order_number || ''
    const qrDataUrl = qrCodeMap.value[orderNum] || ''

    // --- 页面头部（含二维码） ---
    const headerHtml = `
      <div class="page-header-area">
        <div class="header-left-space"></div>
        <div class="header-center">
          <div class="page-title">生产调度单</div>
          <div class="page-subtitle">睿信橡胶密封件MES系统</div>
        </div>
        <div class="header-qr">
          ${qrDataUrl ? '<img class="qr-img" src="' + qrDataUrl + '" /><div class="qr-hint">扫码备料/报工</div>' : ''}
        </div>
      </div>
      <div class="page-meta">
        <span>生产单号: ${orderNum}</span>
        <span>第 ${pageIdx + 1} 页 / 共 ${items.length} 页</span>
        <span>打印时间: ${dayjs().format('YYYY-MM-DD HH:mm')}</span>
      </div>
    `

    // --- 第一栏：基本信息（修复班产） ---
    const infoHtml = `
      <div class="section">
        <div class="section-title">一、生产单基本信息</div>
        <table class="info-table">
          <tr>
            <td class="info-label">生产单编号</td>
            <td class="info-value">${orderNum}</td>
            <td class="info-label">生产计划编号</td>
            <td class="info-value">${order.production_number || ''}</td>
            <td class="info-label">生产日期</td>
            <td class="info-value">${formatDate(order.production_date)}</td>
          </tr>
          <tr>
            <td class="info-label">产品编号</td>
            <td class="info-value">${order.item_number || ''}</td>
            <td class="info-label">产品名称</td>
            <td class="info-value">${order.item_name || ''}</td>
            <td class="info-label">规格</td>
            <td class="info-value">${order.specifications || ''}</td>
          </tr>
          <tr>
            <td class="info-label">单位</td>
            <td class="info-value">${order.basic_unit || ''}</td>
            <td class="info-label">计划数量</td>
            <td class="info-value">${order.planned_quantity ?? ''}</td>
            <td class="info-label">班次</td>
            <td class="info-value">${scheduleName}</td>
          </tr>
          <tr>
            <td class="info-label">设备名称</td>
            <td class="info-value">${order.equipment_name || order.equipment_number || ''}</td>
            <td class="info-label">设备编号</td>
            <td class="info-value">${order.equipment_number || ''}</td>
            <td class="info-label">胶料编号</td>
            <td class="info-value">${order.rubber_compound_number || ''}</td>
          </tr>
          <tr>
            <td class="info-label">模具编号</td>
            <td class="info-value">${order.mould_number || ''}</td>
            <td class="info-label">成型件规格</td>
            <td class="info-value">${order.formed_part_specifications || ''}</td>
            <td class="info-label">成型件单耗</td>
            <td class="info-value">${order.formed_part_unit_consumption || ''}</td>
          </tr>
          <tr>
            <td class="info-label">实际模腔</td>
            <td class="info-value">${order.actual_cavity_count || ''}</td>
            <td class="info-label">实际模穴</td>
            <td class="info-value">${order.actual_hole_count || ''}</td>
            <td class="info-label">实际班产</td>
            <td class="info-value highlight">${calcDailyOutput(order)}</td>
          </tr>
          <tr>
            <td class="info-label">产品图号</td>
            <td class="info-value">${order.product_drawing_number || ''}</td>
            <td class="info-label">班产定额</td>
            <td class="info-value">${order.batch_production_quota || ''}</td>
            <td class="info-label">状态</td>
            <td class="info-value">${order.plan_status || ''}</td>
          </tr>
          <tr>
            <td class="info-label">备注</td>
            <td class="info-value" colspan="5">${order.remark || ''}</td>
          </tr>
        </table>
      </div>
    `

    // --- 第二栏：备料清单（完整物料明细） ---
    let materialsBodyHtml = ''
    if (materials.length > 0) {
      materials.forEach((m: any, mIdx: number) => {
        materialsBodyHtml += '<tr>'
          + '<td>' + (mIdx + 1) + '</td>'
          + '<td>' + (m.material_number || '') + '</td>'
          + '<td class="text-left">' + (m.material_name || '') + '</td>'
          + '<td>' + (m.material_type || '') + '</td>'
          + '<td>' + (m.unit || '') + '</td>'
          + '<td class="text-right">' + fmtQty(m.bom_standard_quantity) + '</td>'
          + '<td class="text-right">' + fmtQty(m.required_quantity) + '</td>'
          + '<td class="text-right">' + fmtQty(m.adjusted_quantity) + '</td>'
          + '<td class="text-right">' + fmtQty(m.issued_quantity) + '</td>'
          + '<td class="blank-cell"></td>'
          + '<td>' + (m.work_center_name || '') + '</td>'
          + '<td>' + (m.supply_type || '') + '</td>'
          + '<td>' + (m.default_warehouse || '') + '</td>'
          + '<td class="text-left">' + (m.remark || '') + '</td>'
          + '</tr>'
      })
    } else {
      materialsBodyHtml = '<tr><td colspan="14" class="empty-note">暂无备料数据</td></tr>'
    }
    const materialsHtml = `
      <div class="section">
        <div class="section-title">二、备料清单 <span class="section-count">（共 ${materials.length} 项）</span></div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:30px">序号</th>
              <th style="width:90px">物料编号</th>
              <th>物料名称</th>
              <th style="width:45px">类型</th>
              <th style="width:35px">单位</th>
              <th style="width:55px">BOM用量</th>
              <th style="width:55px">需求量</th>
              <th style="width:55px">调整量</th>
              <th style="width:55px">已领量</th>
              <th style="width:60px">实发量</th>
              <th style="width:70px">工作中心</th>
              <th style="width:50px">供应方式</th>
              <th style="width:55px">仓库</th>
              <th style="width:60px">备注</th>
            </tr>
          </thead>
          <tbody>
            ${materialsBodyHtml}
          </tbody>
        </table>
      </div>
    `

    // --- 第三栏：工序任务（完整工序信息） ---
    let tasksBodyHtml = ''
    if (tasks.length > 0) {
      tasks.forEach((t: any, tIdx: number) => {
        tasksBodyHtml += '<tr>'
          + '<td>' + (tIdx + 1) + '</td>'
          + '<td>' + (t.step_number || '') + '</td>'
          + '<td>' + (t.standard_process_number || '') + '</td>'
          + '<td class="text-left">' + (t.standard_process_name || '') + '</td>'
          + '<td>' + (t.work_center_name || t.work_center_number || '') + '</td>'
          + '<td class="text-right">' + fmtQty(t.planned_quantity) + '</td>'
          + '<td class="text-right">' + fmtQty(t.completed_quantity) + '</td>'
          + '<td class="blank-cell"></td>'
          + '<td>' + (t.process_material_input_number || '') + '</td>'
          + '<td class="text-right">' + fmtQty(t.process_material_input_quantity) + '</td>'
          + '<td>' + fmtTime(t.planned_start_time) + '</td>'
          + '<td>' + fmtTime(t.planned_end_time) + '</td>'
          + '<td>' + (t.task_status || '') + '</td>'
          + '<td class="text-left">' + (t.remark || '') + '</td>'
          + '</tr>'
      })
    } else {
      tasksBodyHtml = '<tr><td colspan="14" class="empty-note">暂无工序任务数据</td></tr>'
    }
    const tasksHtml = `
      <div class="section">
        <div class="section-title">三、工序任务 <span class="section-count">（共 ${tasks.length} 项）</span></div>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:30px">序号</th>
              <th style="width:40px">工序号</th>
              <th style="width:65px">工序编号</th>
              <th>工序名称</th>
              <th style="width:70px">工作中心</th>
              <th style="width:55px">计划数量</th>
              <th style="width:55px">已完成</th>
              <th style="width:60px">实际数量</th>
              <th style="width:65px">投入物料</th>
              <th style="width:50px">投入量</th>
              <th style="width:70px">计划开始</th>
              <th style="width:70px">计划结束</th>
              <th style="width:45px">状态</th>
              <th style="width:60px">备注</th>
            </tr>
          </thead>
          <tbody>
            ${tasksBodyHtml}
          </tbody>
        </table>
      </div>
    `

    // --- 第四栏：不良品记录（固定25项，双栏布局） ---
    const defectNames = [
      '缺料', '模脏', '老化胶', '裂口', '流痕', '气泡', '烫坏',
      '杂质', '脱胶', '撕修坏', '砂坏、车坏', '烂泡', '扒胶',
      '模痕', '拉缺、摆坏', '变形', '骨架不良', '分层', '欠硫',
      '包胶', '切坏', '尺寸不良', '冻坏', '短少', '磕碰'
    ]
    let defectRowsHtml = ''
    const defectRows = 13
    for (let i = 0; i < defectRows; i++) {
      const leftIdx = i
      const rightIdx = i + 13
      const leftNo = leftIdx < defectNames.length ? String(leftIdx + 1) : ''
      const leftName = defectNames[leftIdx] || ''
      const rightNo = rightIdx < defectNames.length ? String(rightIdx + 1) : ''
      const rightName = rightIdx < defectNames.length ? defectNames[rightIdx] : ''
      defectRowsHtml += '<tr>'
        + '<td>' + leftNo + '</td>'
        + '<td class="text-left">' + leftName + '</td>'
        + '<td class="blank-cell"></td>'
        + '<td class="blank-cell"></td>'
        + '<td>' + rightNo + '</td>'
        + '<td class="text-left">' + rightName + '</td>'
        + '<td class="blank-cell"></td>'
        + '<td class="blank-cell"></td>'
        + '</tr>'
    }
    const defectHtml = `
      <div class="section">
        <div class="section-title">四、不良品记录如下：</div>
        <table class="defect-table">
          <thead>
            <tr>
              <th style="width:28px">序号</th>
              <th>不良缺陷</th>
              <th style="width:52px">不良数量</th>
              <th style="width:48px">备注</th>
              <th style="width:28px">序号</th>
              <th>不良缺陷</th>
              <th style="width:52px">不良数量</th>
              <th style="width:48px">备注</th>
            </tr>
          </thead>
          <tbody>
            ${defectRowsHtml}
          </tbody>
        </table>
      </div>
    `

    // --- 底部备注及确认栏 ---
    const footerHtml = `
      <div class="detail-footer">备注：此流转卡作为工资核算依据，请妥善保存。</div>
      <div class="confirm-row">
        <span class="confirm-item">报工完成确认: <span class="sig-line"></span></span>
        <span class="confirm-item">仓库入库确认: <span class="sig-line"></span></span>
      </div>
    `

    pagesHtml += `
      <div class="page${isLast ? ' last-page' : ''}">
        ${headerHtml}
        ${infoHtml}
        ${materialsHtml}
        ${tasksHtml}
        ${defectHtml}
        ${footerHtml}
      </div>
    `
  })

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>生产调度单 - 详细打印</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 6mm 8mm;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: "Microsoft YaHei", "SimHei", sans-serif;
          color: #000;
          font-size: 8px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page {
          page-break-after: always;
          padding: 1mm 0;
        }
        .page.last-page {
          page-break-after: avoid;
        }
        /* 头部区域（含二维码） */
        .page-header-area {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2px;
        }
        .header-left-space {
          width: 72px;
        }
        .header-center {
          flex: 1;
          text-align: center;
        }
        .page-title {
          font-size: 14px;
          font-weight: bold;
          letter-spacing: 3px;
        }
        .page-subtitle {
          font-size: 8px;
          color: #666;
          margin-top: 1px;
        }
        .header-qr {
          width: 72px;
          text-align: center;
        }
        .qr-img {
          width: 60px;
          height: 60px;
        }
        .qr-hint {
          font-size: 7px;
          color: #888;
          margin-top: 1px;
        }
        .page-meta {
          display: flex;
          justify-content: space-between;
          font-size: 8px;
          color: #666;
          margin-bottom: 3px;
          padding: 0 2px;
          border-bottom: 1px solid #ddd;
          padding-bottom: 2px;
        }
        .section {
          margin-bottom: 3px;
        }
        .section-title {
          font-size: 9px;
          font-weight: bold;
          margin-bottom: 2px;
          padding-left: 5px;
          border-left: 2px solid #333;
        }
        .section-count {
          font-weight: normal;
          font-size: 8px;
          color: #888;
        }
        .info-table {
          width: 100%;
          border-collapse: collapse;
        }
        .info-table td {
          border: 1px solid #000;
          padding: 1px 3px;
          font-size: 8px;
          line-height: 1.3;
        }
        .info-label {
          background-color: #f5f5f5;
          font-weight: bold;
          text-align: right;
          width: 62px;
          white-space: nowrap;
        }
        .info-value {
          min-width: 55px;
        }
        .info-value.highlight {
          font-weight: bold;
          color: #d4380d;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th,
        .data-table td {
          border: 1px solid #000;
          padding: 1px 2px;
          font-size: 8px;
          text-align: center;
          line-height: 1.2;
        }
        .data-table th {
          background-color: #f0f0f0;
          font-weight: bold;
          white-space: nowrap;
          font-size: 7.5px;
        }
        .data-table td.text-left {
          text-align: left;
        }
        .data-table td.text-right {
          text-align: right;
        }
        .data-table td.blank-cell {
          background-color: #ffffee;
          min-width: 35px;
        }
        .data-table td.empty-note {
          text-align: center;
          color: #999;
          padding: 4px;
          font-style: italic;
        }
        /* 不良品记录表格 */
        .defect-table {
          width: 100%;
          border-collapse: collapse;
        }
        .defect-table th,
        .defect-table td {
          border: 1px solid #000;
          padding: 1px 3px;
          font-size: 8px;
          text-align: center;
          line-height: 1.2;
        }
        .defect-table th {
          background-color: #f0f0f0;
          font-weight: bold;
          white-space: nowrap;
          font-size: 7.5px;
        }
        .defect-table td.text-left {
          text-align: left;
        }
        .defect-table td.blank-cell {
          background-color: #ffffee;
        }
        .detail-footer {
          margin-top: 4px;
          padding: 0 2px;
          font-size: 8px;
          color: #333;
        }
        .confirm-row {
          display: flex;
          justify-content: space-between;
          margin-top: 6px;
          padding: 0 2px;
          font-size: 9px;
        }
        .confirm-item {
          white-space: nowrap;
        }
        .sig-line {
          display: inline-block;
          width: 90px;
          border-bottom: 1px solid #000;
          margin-left: 4px;
        }
        @media screen {
          body { padding: 20px; background: #e8e8e8; }
          .page {
            background: #fff;
            padding: 20px 24px;
            margin: 0 auto 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            max-width: 800px;
          }
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 400);
        };
      <\/script>
    </body>
    </html>
  `)
  printWindow.document.close()
}

onMounted(async () => {
  await loadSchedules()
  await loadColumnPreference()
  await fetchData()
})
</script>

<template>
  <div class="dispatch-print-page">
    <!-- 顶部标题区 -->
    <div class="page-header">
      <div class="header-left">
        <PrinterOutlined class="header-icon" />
        <span class="header-title">调度单打印</span>
        <a-tag color="blue">已派发</a-tag>
      </div>
      <div class="header-right">
        <a-button
          :disabled="selectedRowKeys.length === 0"
          :loading="detailPrintLoading"
          @click="handleDetailPrint"
        >
          <FileTextOutlined />
          详细打印 ({{ selectedRowKeys.length }})
        </a-button>
        <a-button
          type="primary"
          :disabled="selectedRowKeys.length === 0"
          @click="handlePrint"
        >
          <PrinterOutlined />
          列表打印 ({{ selectedRowKeys.length }})
        </a-button>
        <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      </div>
    </div>

    <!-- 筛选条件区 -->
    <div class="filter-bar">
      <div class="filter-items">
        <div class="filter-item">
          <span class="filter-label">生产日期</span>
          <a-date-picker
            v-model:value="filters.production_date"
            placeholder="选择日期"
            size="small"
            value-format="YYYY-MM-DD"
            style="width: 140px"
            @change="handleSearch"
          />
        </div>
        <div class="filter-item">
          <span class="filter-label">班次</span>
          <a-select
            v-model:value="filters.schedule_id"
            placeholder="全部班次"
            size="small"
            allow-clear
            style="width: 120px"
            @change="handleSearch"
          >
            <a-select-option v-for="s in scheduleList" :key="s.schedules_id" :value="s.schedules_id">
              {{ s.schedules_name || s.schedules_id }}
            </a-select-option>
          </a-select>
        </div>
        <div class="filter-item">
          <span class="filter-label">设备编号</span>
          <a-input
            v-model:value="filters.equipment_number"
            placeholder="输入设备编号"
            size="small"
            style="width: 130px"
            @press-enter="handleSearch"
          />
        </div>
        <div class="filter-item">
          <span class="filter-label">产品编号</span>
          <a-input
            v-model:value="filters.item_number"
            placeholder="输入产品编号"
            size="small"
            style="width: 130px"
            @press-enter="handleSearch"
          />
        </div>
        <a-button size="small" type="primary" @click="handleSearch">
          <SearchOutlined /> 查询
        </a-button>
        <a-button size="small" @click="handleReset">
          <ReloadOutlined /> 重置
        </a-button>
      </div>
      <div class="filter-actions">
        <a-button size="small" @click="handleSelectAll">全选</a-button>
        <a-button size="small" @click="handleDeselectAll">取消全选</a-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :row-selection="rowSelection"
      :loading="loading"
      :pagination="pagination"
      :scroll="{ x: 1920 }"
      row-key="production_order_number"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-else-if="column.key === 'production_date'">
          {{ formatDate(record.production_date) }}
        </template>
        <template v-else-if="column.key === 'schedule_id'">
          {{ getScheduleName(record.schedule_id) }}
        </template>
        <template v-else-if="column.key === 'actual_daily_output'">
          {{ calcActualDailyOutput(record) }}
        </template>
      </template>
    </a-table>

    <!-- 隐藏的列表打印内容区域 -->
    <div v-show="false">
      <div id="print-area">
        <div class="print-page">
          <div class="print-header">
            <div class="print-title">生产调度单</div>
            <div class="print-subtitle">睿信橡胶密封件MES系统</div>
          </div>

          <div class="print-info">
            <span>共 {{ sortedSelectedOrders.length }} 条记录</span>
            <span>打印时间: {{ dayjs().format('YYYY-MM-DD HH:mm') }}</span>
          </div>

          <table class="print-table">
            <thead>
              <tr>
                <th style="width:30px">序号</th>
                <th>生产日期</th>
                <th>班次</th>
                <th>设备</th>
                <th>生产单编号</th>
                <th>计划编号</th>
                <th>产品编号</th>
                <th>产品名称</th>
                <th>规格</th>
                <th>计划数量</th>
                <th>模具编号</th>
                <th>成型件规格</th>
                <th>成型件单耗</th>
                <th>模腔</th>
                <th>模穴</th>
                <th>班产</th>
                <th>胶料编号</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(order, oIdx) in sortedSelectedOrders" :key="order.production_order_number">
                <td>{{ oIdx + 1 }}</td>
                <td>{{ formatDate(order.production_date) }}</td>
                <td>{{ getScheduleName(order.schedule_id) }}</td>
                <td>{{ order.equipment_name || order.equipment_number }}</td>
                <td>{{ order.production_order_number }}</td>
                <td>{{ order.production_number }}</td>
                <td>{{ order.item_number }}</td>
                <td class="text-left">{{ order.item_name }}</td>
                <td>{{ order.specifications }}</td>
                <td class="text-right">{{ order.planned_quantity }}</td>
                <td>{{ order.mould_number }}</td>
                <td>{{ order.formed_part_specifications }}</td>
                <td class="text-right">{{ order.formed_part_unit_consumption }}</td>
                <td>{{ order.actual_cavity_count }}</td>
                <td>{{ order.actual_hole_count }}</td>
                <td class="text-right">{{ calcActualDailyOutput(order) }}</td>
                <td>{{ order.rubber_compound_number }}</td>
                <td class="text-left">{{ order.remark || '' }}</td>
              </tr>
            </tbody>
          </table>

          <div class="print-footer">
            <div class="print-footer-item">
              调度员: <span class="signature-line"></span>
            </div>
            <div class="print-footer-item">
              班组长: <span class="signature-line"></span>
            </div>
            <div class="print-footer-item">
              操作员: <span class="signature-line"></span>
            </div>
            <div class="print-footer-item">
              日期: <span class="signature-line"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

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
.dispatch-print-page {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  min-height: calc(100vh - 120px);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  font-size: 22px;
  color: #1890ff;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  color: #262626;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 6px;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-items {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-label {
  font-size: 13px;
  color: #595959;
  white-space: nowrap;
}

.filter-actions {
  display: flex;
  gap: 6px;
}

/* 打印区域样式（仅在打印区域内生效） */
:deep(.print-page) {
  page-break-after: always;
}

:deep(.print-table) {
  width: 100%;
  border-collapse: collapse;
}

:deep(.print-table th),
:deep(.print-table td) {
  border: 1px solid #000;
  padding: 4px 6px;
  text-align: center;
  font-size: 11px;
}

:deep(.print-table th) {
  background-color: #f0f0f0;
  font-weight: bold;
}

:deep(.print-table td.text-left) {
  text-align: left;
}

:deep(.print-table td.text-right) {
  text-align: right;
}

:deep(.print-header) {
  text-align: center;
  margin-bottom: 6px;
}

:deep(.print-title) {
  font-size: 20px;
  font-weight: bold;
}

:deep(.print-info) {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 6px;
}

:deep(.print-footer) {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-top: 10px;
}

:deep(.signature-line) {
  display: inline-block;
  width: 100px;
  border-bottom: 1px solid #000;
  margin-left: 8px;
}
</style>
