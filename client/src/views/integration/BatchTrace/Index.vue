<script setup lang="ts">
import { ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, NodeIndexOutlined, SwapOutlined, FileSearchOutlined, ApartmentOutlined } from '@ant-design/icons-vue'
import { searchBatch, forwardTrace, reverseTrace, traceByProductionOrder } from '@/api/integration/batchTrace'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { GraphChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components'
import dayjs from 'dayjs'

use([CanvasRenderer, GraphChart, TitleComponent, TooltipComponent, LegendComponent])

const loading = ref(false)
const searchKeyword = ref('')
const searchType = ref('')
const activeTab = ref('search')

// 搜索结果
const materialBatches = ref<any[]>([])
const finishedBatches = ref<any[]>([])

// 追溯结果
const traceResult = ref<any>(null)
const traceDirection = ref<'forward' | 'reverse'>('forward')

// 生产单追溯结果
const ponResult = ref<any>(null)

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const formatDateShort = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

// ========== 批次搜索 ==========
const handleSearch = async () => {
  if (!searchKeyword.value.trim()) {
    message.warning('请输入搜索关键字')
    return
  }
  loading.value = true
  try {
    const res: any = await searchBatch({ keyword: searchKeyword.value.trim(), type: searchType.value })
    materialBatches.value = res.data?.materialBatches || []
    finishedBatches.value = res.data?.finishedBatches || []
    if (materialBatches.value.length === 0 && finishedBatches.value.length === 0) {
      message.info('未找到匹配的批次')
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || '搜索失败')
  } finally {
    loading.value = false
  }
}

// ========== 正向/反向追溯 ==========
const traceBatchNumber = ref('')

const handleTrace = async () => {
  if (!traceBatchNumber.value.trim()) {
    message.warning('请输入批次号')
    return
  }
  loading.value = true
  traceResult.value = null
  try {
    const fn = traceDirection.value === 'forward' ? forwardTrace : reverseTrace
    const res: any = await fn({ batch_number: traceBatchNumber.value.trim() })
    traceResult.value = res.data
    if (traceDirection.value === 'forward') {
      if (!res.data?.finishedBatch) {
        message.info('未找到该成品批次')
      }
    } else {
      if (!res.data?.materialBatch) {
        message.info('未找到该原材料批次')
      }
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || '追溯失败')
  } finally {
    loading.value = false
  }
}

// ========== 生产单追溯 ==========
const ponNumber = ref('')

const handlePonTrace = async () => {
  if (!ponNumber.value.trim()) {
    message.warning('请输入生产单号')
    return
  }
  loading.value = true
  ponResult.value = null
  try {
    const res: any = await traceByProductionOrder({ production_order_number: ponNumber.value.trim() })
    ponResult.value = res.data
    if (!res.data?.productionOrder) {
      message.info('未找到该生产单')
    }
  } catch (e: any) {
    message.error(e.response?.data?.message || '追溯失败')
  } finally {
    loading.value = false
  }
}

// 从搜索结果点击进行追溯
const traceFromSearch = (batchNumber: string, type: 'forward' | 'reverse') => {
  activeTab.value = 'trace'
  traceBatchNumber.value = batchNumber
  traceDirection.value = type
  handleTrace()
}

// ========== 行展开：关联报工和检验 ==========
const expandedBatchKeys = ref<number[]>([])
const expandedPonBatchKeys = ref<number[]>([])

// 根据原材料批次号+生产单号筛选关联数据
const getRelatedWorkReports = (pon: string) => {
  const all = traceResult.value?.workReports || ponResult.value?.workReports || []
  return all.filter((r: any) => r.production_order_number === pon)
}
const getRelatedPurchaseInspections = (batchNumber: string) => {
  const all = traceResult.value?.purchaseInspections || ponResult.value?.purchaseInspections || []
  return all.filter((r: any) => r.batch_number === batchNumber)
}
const getRelatedProductionInspections = (pon: string) => {
  const all = traceResult.value?.productionInspections || ponResult.value?.productionInspections || []
  return all.filter((r: any) => r.production_order_number === pon)
}

// 领料记录行展开：关联来料检验
const expandedIssueKeys = ref<string[]>([])
const getIssuePurchaseInspections = (batchNumber: string) => {
  const all = ponResult.value?.purchaseInspections || []
  return all.filter((r: any) => r.batch_number === batchNumber)
}

// 搜索结果列定义
const materialColumns = [
  { title: '批次号', dataIndex: 'batch_number', width: 160 },
  { title: '物料编号', dataIndex: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
  { title: '当前库存', dataIndex: 'quantity', width: 90 },
  { title: '入库日期', dataIndex: 'inbound_date', width: 110 },
  { title: '生产单号', dataIndex: 'production_order_number', width: 140 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' as const }
]

const finishedColumns = [
  { title: '批次号', dataIndex: 'batch_number', width: 160 },
  { title: '物料编号', dataIndex: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
  { title: '当前库存', dataIndex: 'quantity', width: 90 },
  { title: '入库日期', dataIndex: 'inbound_date', width: 110 },
  { title: '生产单号', dataIndex: 'production_order_number', width: 140 },
  { title: '状态', dataIndex: 'status', width: 80 },
  { title: '操作', key: 'action', width: 100, fixed: 'right' as const }
]

// 追溯关联列（正向 - 原材料批次行）
const traceLinkColumns = [
  { title: '原材料批次号', dataIndex: 'material_batch_number', width: 160 },
  { title: '原材料编号', dataIndex: 'material_item_number', width: 130 },
  { title: '原材料名称', dataIndex: 'material_item_name', width: 160 },
  { title: '领料数量', dataIndex: 'material_quantity', width: 100 },
  { title: '领料单号', dataIndex: 'issue_number', width: 140 },
  { title: '关联类型', dataIndex: 'link_type', width: 80 },
  { title: '当前库存', dataIndex: 'current_stock', width: 100 },
  { title: '操作', key: 'action', width: 100 }
]

// 追溯关联列（反向 - 成品批次行）
const reverseTraceLinkColumns = [
  { title: '成品批次号', dataIndex: 'finished_batch_number', width: 160 },
  { title: '成品编号', dataIndex: 'finished_item_number', width: 130 },
  { title: '成品名称', dataIndex: 'finished_item_name', width: 160 },
  { title: '领料数量', dataIndex: 'material_quantity', width: 100 },
  { title: '领料单号', dataIndex: 'issue_number', width: 140 },
  { title: '关联类型', dataIndex: 'link_type', width: 80 },
  { title: '当前库存', dataIndex: 'current_stock', width: 100 },
  { title: '操作', key: 'action', width: 100 }
]

// 生产单领料列
const issueColumns = [
  { title: '领料单号', dataIndex: 'issue_number', width: 140 },
  { title: '物料编号', dataIndex: 'material_number', width: 130 },
  { title: '物料名称', dataIndex: 'material_name', width: 160 },
  { title: '实领数量', dataIndex: 'actual_quantity', width: 100 },
  { title: '批次号', dataIndex: 'batch_number', width: 160 },
  { title: '单位', dataIndex: 'unit', width: 80 }
]

// 报工记录列（展开行内，不需要生产单号列）
const workReportColumns = [
  { title: '报工单号', dataIndex: 'work_report_number', width: 150 },
  { title: '工序序号', dataIndex: 'step_number', width: 80 },
  { title: '工序名称', dataIndex: 'standard_process_name', width: 120 },
  { title: '合格数量', dataIndex: 'qualified_quantity', width: 90 },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', width: 100 },
  { title: '累计完成', dataIndex: 'cumulative_quantity', width: 90 },
  { title: '报工日期', dataIndex: 'report_date', width: 110 },
  { title: '操作员', dataIndex: 'operator_name', width: 90 },
  { title: '审批状态', dataIndex: 'approval_status', width: 90 }
]

// 来料检验列（展开行内，不需要批次号列）
const purchaseInspectionColumns = [
  { title: '检验单号', dataIndex: 'inspection_number', width: 150 },
  { title: '物料编号', dataIndex: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', width: 140 },
  { title: '供应商', dataIndex: 'supplier_name', width: 130 },
  { title: '来料数量', dataIndex: 'received_quantity', width: 90 },
  { title: '合格数量', dataIndex: 'qualified_quantity', width: 90 },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', width: 100 },
  { title: '检验结果', dataIndex: 'inspect_result', width: 90 },
  { title: '检验员', dataIndex: 'inspector_name', width: 90 },
  { title: '检验日期', dataIndex: 'inspect_date', width: 110 }
]

// 生产检验列（展开行内）
const productionInspectionColumns = [
  { title: '检验单号', dataIndex: 'inspection_number', width: 150 },
  { title: '报工单号', dataIndex: 'work_report_number', width: 130 },
  { title: '工序序号', dataIndex: 'step_number', width: 80 },
  { title: '工序名称', dataIndex: 'standard_process_name', width: 120 },
  { title: '检验类型', dataIndex: 'inspect_type', width: 90 },
  { title: '检验结果', dataIndex: 'inspection_result', width: 90 },
  { title: '检验员', dataIndex: 'inspector_name', width: 90 },
  { title: '检验日期', dataIndex: 'inspection_date', width: 110 }
]

// 领料行展开的来料检验列
const issuePurchaseInspectionColumns = [
  { title: '检验单号', dataIndex: 'inspection_number', width: 150 },
  { title: '物料编号', dataIndex: 'item_number', width: 120 },
  { title: '物料名称', dataIndex: 'item_name', width: 140 },
  { title: '供应商', dataIndex: 'supplier_name', width: 130 },
  { title: '来料数量', dataIndex: 'received_quantity', width: 90 },
  { title: '合格数量', dataIndex: 'qualified_quantity', width: 90 },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', width: 100 },
  { title: '检验结果', dataIndex: 'inspect_result', width: 90 },
  { title: '检验员', dataIndex: 'inspector_name', width: 90 },
  { title: '检验日期', dataIndex: 'inspect_date', width: 110 }
]

// 检验结果 Tag 颜色
const inspectResultColor = (result: string) => {
  if (!result) return 'default'
  if (result.includes('合格') && !result.includes('不')) return 'green'
  if (result.includes('不合格')) return 'red'
  if (result.includes('让步')) return 'blue'
  if (result.includes('待')) return 'orange'
  return 'default'
}

// 展开行切换
const handleBatchExpand = (expanded: boolean, record: any) => {
  const key = record.id
  if (expanded) {
    if (!expandedBatchKeys.value.includes(key)) expandedBatchKeys.value.push(key)
  } else {
    expandedBatchKeys.value = expandedBatchKeys.value.filter(k => k !== key)
  }
}

const handleIssueExpand = (expanded: boolean, record: any) => {
  const key = record.batch_number || record.issue_number
  if (expanded) {
    if (!expandedIssueKeys.value.includes(key)) expandedIssueKeys.value.push(key)
  } else {
    expandedIssueKeys.value = expandedIssueKeys.value.filter(k => k !== key)
  }
}

// ========== 生产过程可视化图表 ==========
const chartTab = ref<'trace' | 'pon'>('trace')

// 根据追溯结果构建图表数据
const chartOption = computed(() => {
  const nodes: any[] = []
  const links: any[] = []
  const categories = [
    { name: '原材料' },
    { name: '半成品' },
    { name: '生产单' },
    { name: '报工工序' },
    { name: '成品' },
    { name: '检验' }
  ]

  const nodeMap = new Map<string, boolean>()

  const addNode = (id: string, name: string, category: number, symbolSize: number, extra?: any) => {
    if (nodeMap.has(id)) return
    nodeMap.set(id, true)
    nodes.push({
      id,
      name,
      category,
      symbolSize,
      label: { show: true, fontSize: 11 },
      itemStyle: { borderWidth: 2 },
      ...extra
    })
  }

  const addLink = (source: string, target: string) => {
    links.push({ source, target, lineStyle: { width: 2, curveness: 0.2 } })
  }

  if (chartTab.value === 'trace' && traceResult.value) {
    const data = traceResult.value
    if (traceDirection.value === 'forward' && data.finishedBatch) {
      // 正向追溯：成品 → 原材料
      const fb = data.finishedBatch
      addNode(`finished-${fb.batch_number}`, `${fb.item_name}\n${fb.batch_number}`, 4, 60)

      // 生产单节点
      const ponSet = new Set<string>()
      if (data.materialBatches) {
        data.materialBatches.forEach((m: any) => {
          if (m.production_order_number && !ponSet.has(m.production_order_number)) {
            ponSet.add(m.production_order_number)
            const pon = data.productionOrders?.find((p: any) => p.production_order_number === m.production_order_number)
            addNode(
              `pon-${m.production_order_number}`,
              `${m.production_order_number}\n${pon?.item_name || ''}`,
              2, 50
            )
          }
        })
      }

      // 报工工序节点：原材料→生产单→报工→成品
      if (data.workReports && data.workReports.length > 0) {
        const ponGroups = new Map<string, any[]>()
        data.workReports.forEach((wr: any) => {
          const key = wr.production_order_number
          if (!ponGroups.has(key)) ponGroups.set(key, [])
          ponGroups.get(key)!.push(wr)
        })
        ponGroups.forEach((wrs: any[], pon: string) => {
          let prevId = `pon-${pon}`
          wrs.forEach((wr: any) => {
            const wrId = `wr-${wr.work_report_number}`
            addNode(wrId, `${wr.standard_process_name}\n${wr.qualified_quantity || 0}件`, 3, 36)
            addLink(prevId, wrId)
            prevId = wrId
          })
          addLink(prevId, `finished-${fb.batch_number}`)
        })
        // 没有报工的生产单直接连成品
        ponSet.forEach(pon => {
          if (!ponGroups.has(pon)) {
            addLink(`pon-${pon}`, `finished-${fb.batch_number}`)
          }
        })
      } else if (ponSet.size > 0) {
        // 完全没有报工记录，所有生产单直接连成品
        ponSet.forEach(pon => {
          addLink(`pon-${pon}`, `finished-${fb.batch_number}`)
        })
      }

      // 原材料节点
      if (data.materialBatches) {
        data.materialBatches.forEach((m: any) => {
          addNode(
            `material-${m.material_batch_number}`,
            `${m.material_item_name || m.material_item_number}\n${m.material_batch_number}`,
            0, 44
          )
          if (m.production_order_number) {
            addLink(`material-${m.material_batch_number}`, `pon-${m.production_order_number}`)
          }
        })
      }

      // 来料检验节点
      if (data.purchaseInspections) {
        data.purchaseInspections.forEach((pi: any) => {
          const piId = `pi-${pi.inspection_number}`
          const resultColor = pi.inspect_result?.includes('合格') && !pi.inspect_result?.includes('不') ? '#52c41a'
            : pi.inspect_result?.includes('不合格') ? '#ff4d4f' : '#faad14'
          addNode(piId, `来料检\n${pi.inspect_result || '待检'}`, 5, 30, { itemStyle: { color: resultColor } })
          addLink(`material-${pi.batch_number}`, piId)
        })
      }

      // 生产检验节点
      if (data.productionInspections) {
        data.productionInspections.forEach((pi: any) => {
          const ppiId = `ppi-${pi.inspection_number}`
          const resultColor = pi.inspection_result?.includes('合格') && !pi.inspection_result?.includes('不') ? '#52c41a'
            : pi.inspection_result?.includes('不合格') ? '#ff4d4f' : '#faad14'
          addNode(ppiId, `生产检\n${pi.inspection_result || '待检'}`, 5, 30, { itemStyle: { color: resultColor } })
          if (pi.work_report_number) {
            addLink(`wr-${pi.work_report_number}`, ppiId)
          } else {
            addLink(`pon-${pi.production_order_number}`, ppiId)
          }
        })
      }

    } else if (traceDirection.value === 'reverse' && data.materialBatch) {
      // 反向追溯：原材料 → 成品
      const mb = data.materialBatch
      addNode(`material-${mb.batch_number}`, `${mb.item_name}\n${mb.batch_number}`, 0, 60)

      // 来料检验
      if (data.purchaseInspections) {
        data.purchaseInspections.forEach((pi: any) => {
          const piId = `pi-${pi.inspection_number}`
          const resultColor = pi.inspect_result?.includes('合格') && !pi.inspect_result?.includes('不') ? '#52c41a'
            : pi.inspect_result?.includes('不合格') ? '#ff4d4f' : '#faad14'
          addNode(piId, `来料检\n${pi.inspect_result || '待检'}`, 5, 30, { itemStyle: { color: resultColor } })
          addLink(`material-${mb.batch_number}`, piId)
        })
      }

      // 生产单节点
      const ponSet = new Set<string>()
      if (data.finishedBatches) {
        data.finishedBatches.forEach((f: any) => {
          if (f.production_order_number && !ponSet.has(f.production_order_number)) {
            ponSet.add(f.production_order_number)
            const pon = data.productionOrders?.find((p: any) => p.production_order_number === f.production_order_number)
            addNode(
              `pon-${f.production_order_number}`,
              `${f.production_order_number}\n${pon?.item_name || ''}`,
              2, 50
            )
            addLink(`material-${mb.batch_number}`, `pon-${f.production_order_number}`)
          }
        })
      }

      // 报工工序节点
      if (data.workReports) {
        const ponGroups = new Map<string, any[]>()
        data.workReports.forEach((wr: any) => {
          const key = wr.production_order_number
          if (!ponGroups.has(key)) ponGroups.set(key, [])
          ponGroups.get(key)!.push(wr)
        })
        ponGroups.forEach((wrs: any[], pon: string) => {
          // 从原材料到第一个工序
          let prevId = `material-${mb.batch_number}`
          wrs.forEach((wr: any, idx: number) => {
            const wrId = `wr-${wr.work_report_number}`
            addNode(wrId, `${wr.standard_process_name}\n${wr.qualified_quantity || 0}件`, 3, 36)
            // 首个工序连接生产单
            if (idx === 0) {
              addLink(`pon-${pon}`, wrId)
            } else {
              addLink(prevId, wrId)
            }
            prevId = wrId
          })
        })
      }

      // 生产检验节点
      if (data.productionInspections) {
        data.productionInspections.forEach((pi: any) => {
          const ppiId = `ppi-${pi.inspection_number}`
          const resultColor = pi.inspection_result?.includes('合格') && !pi.inspection_result?.includes('不') ? '#52c41a'
            : pi.inspection_result?.includes('不合格') ? '#ff4d4f' : '#faad14'
          addNode(ppiId, `生产检\n${pi.inspection_result || '待检'}`, 5, 30, { itemStyle: { color: resultColor } })
          if (pi.work_report_number) {
            addLink(`wr-${pi.work_report_number}`, ppiId)
          } else {
            addLink(`pon-${pi.production_order_number}`, ppiId)
          }
        })
      }

      // 成品批次节点
      if (data.finishedBatches) {
        data.finishedBatches.forEach((f: any) => {
          addNode(
            `finished-${f.finished_batch_number}`,
            `${f.finished_item_name || f.finished_item_number}\n${f.finished_batch_number}`,
            4, 44
          )
          if (f.production_order_number) {
            const pwr = data.workReports?.filter((wr: any) => wr.production_order_number === f.production_order_number)
            if (pwr && pwr.length > 0) {
              addLink(`wr-${pwr[pwr.length - 1].work_report_number}`, `finished-${f.finished_batch_number}`)
            } else {
              addLink(`pon-${f.production_order_number}`, `finished-${f.finished_batch_number}`)
            }
          }
        })
      }
    }
  } else if (chartTab.value === 'pon' && ponResult.value) {
    // 生产单追溯的过程图
    const data = ponResult.value
    if (data.productionOrder) {
      const po = data.productionOrder
      addNode(`pon-${po.production_order_number}`, `${po.production_order_number}\n${po.item_name}`, 2, 60)

      // 领料记录（原材料）
      if (data.issueRecords) {
        data.issueRecords.forEach((ir: any) => {
          const matId = `material-${ir.batch_number || ir.issue_number}`
          addNode(matId, `${ir.material_name}\n${ir.batch_number || ir.issue_number}`, 0, 40)
          addLink(matId, `pon-${po.production_order_number}`)
        })
      }

      // 来料检验
      if (data.purchaseInspections) {
        data.purchaseInspections.forEach((pi: any) => {
          const piId = `pi-${pi.inspection_number}`
          const resultColor = pi.inspect_result?.includes('合格') && !pi.inspect_result?.includes('不') ? '#52c41a'
            : pi.inspect_result?.includes('不合格') ? '#ff4d4f' : '#faad14'
          addNode(piId, `来料检\n${pi.inspect_result || '待检'}`, 5, 30, { itemStyle: { color: resultColor } })
          addLink(`material-${pi.batch_number}`, piId)
        })
      }

      // 报工工序
      if (data.workReports) {
        let prevId = `pon-${po.production_order_number}`
        data.workReports.forEach((wr: any) => {
          const wrId = `wr-${wr.work_report_number}`
          addNode(wrId, `${wr.standard_process_name}\n${wr.qualified_quantity || 0}件`, 3, 36)
          addLink(prevId, wrId)
          prevId = wrId
        })
      }

      // 生产检验
      if (data.productionInspections) {
        data.productionInspections.forEach((pi: any) => {
          const ppiId = `ppi-${pi.inspection_number}`
          const resultColor = pi.inspection_result?.includes('合格') && !pi.inspection_result?.includes('不') ? '#52c41a'
            : pi.inspection_result?.includes('不合格') ? '#ff4d4f' : '#faad14'
          addNode(ppiId, `生产检\n${pi.inspection_result || '待检'}`, 5, 30, { itemStyle: { color: resultColor } })
          if (pi.work_report_number) {
            addLink(`wr-${pi.work_report_number}`, ppiId)
          } else {
            addLink(`pon-${po.production_order_number}`, ppiId)
          }
        })
      }

      // 成品批次
      if (data.finishedBatches) {
        data.finishedBatches.forEach((fb: any) => {
          addNode(`finished-${fb.batch_number}`, `${fb.item_name}\n${fb.batch_number}`, 4, 50)
          const pwr = data.workReports
          if (pwr && pwr.length > 0) {
            addLink(`wr-${pwr[pwr.length - 1].work_report_number}`, `finished-${fb.batch_number}`)
          } else {
            addLink(`pon-${po.production_order_number}`, `finished-${fb.batch_number}`)
          }
        })
      }

      // 半成品批次
      if (data.materialBatches) {
        data.materialBatches.forEach((mb: any) => {
          addNode(`semi-${mb.batch_number}`, `${mb.item_name}\n${mb.batch_number}`, 1, 44)
          const pwr = data.workReports
          if (pwr && pwr.length > 0) {
            addLink(`wr-${pwr[pwr.length - 1].work_report_number}`, `semi-${mb.batch_number}`)
          } else {
            addLink(`pon-${po.production_order_number}`, `semi-${mb.batch_number}`)
          }
        })
      }
    }
  }

  if (nodes.length === 0) return null

  return {
    title: {
      text: '生产过程可视化',
      left: 'center',
      top: 10,
      textStyle: { fontSize: 16 }
    },
    tooltip: {
      formatter: (params: any) => {
        if (params.dataType === 'node') {
          return `<b>${params.name.replace(/\n/g, '<br/>')}</b>`
        }
        if (params.dataType === 'edge') {
          return `${params.data.source} → ${params.data.target}`
        }
        return ''
      }
    },
    legend: {
      data: categories.map(c => c.name),
      bottom: 10,
      textStyle: { fontSize: 12 }
    },
    animationDuration: 800,
    animationEasingUpdate: 'quinticInOut',
    series: [{
      type: 'graph',
      layout: 'force',
      data: nodes,
      links: links,
      categories: categories,
      roam: true,
      draggable: true,
      force: {
        repulsion: 300,
        edgeLength: [80, 180],
        gravity: 0.05,
        layoutAnimation: true
      },
      label: {
        show: true,
        fontSize: 11,
        width: 100,
        overflow: 'break'
      },
      lineStyle: {
        opacity: 0.9,
        width: 2,
        curveness: 0.2
      },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [4, 10],
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 4 }
      }
    }]
  }
})
</script>

<template>
  <div class="page-container">
    <a-tabs v-model:activeKey="activeTab">
      <!-- 批次搜索 -->
      <a-tab-pane key="search">
        <template #tab>
          <SearchOutlined />
          批次搜索
        </template>
        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center;">
          <a-select v-model:value="searchType" style="width: 140px" placeholder="搜索类型" allowClear>
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="material">原材料批次</a-select-option>
            <a-select-option value="finished">成品批次</a-select-option>
          </a-select>
          <a-input-search
            v-model:value="searchKeyword"
            placeholder="输入批次号、物料编号、物料名称或生产单号"
            style="width: 460px"
            :loading="loading"
            @search="handleSearch"
          />
        </div>

        <template v-if="materialBatches.length > 0">
          <h4 style="margin: 16px 0 8px;">原材料/半成品批次</h4>
          <a-table
            :dataSource="materialBatches"
            :columns="materialColumns"
            :pagination="false"
            :scroll="{ x: 1200 }"
            size="small"
            rowKey="batch_number"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'inbound_date'">
                {{ formatDateShort(record.inbound_date) }}
              </template>
              <template v-if="column.dataIndex === 'status'">
                <a-tag :color="record.status === '正常' ? 'green' : 'orange'">{{ record.status }}</a-tag>
              </template>
              <template v-if="column.key === 'action'">
                <a-button type="link" size="small" @click="traceFromSearch(record.batch_number, 'reverse')">反向追溯</a-button>
              </template>
            </template>
          </a-table>
        </template>

        <template v-if="finishedBatches.length > 0">
          <h4 style="margin: 16px 0 8px;">成品批次</h4>
          <a-table
            :dataSource="finishedBatches"
            :columns="finishedColumns"
            :pagination="false"
            :scroll="{ x: 1200 }"
            size="small"
            rowKey="batch_number"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'inbound_date'">
                {{ formatDateShort(record.inbound_date) }}
              </template>
              <template v-if="column.dataIndex === 'status'">
                <a-tag :color="record.status === '正常' ? 'green' : 'orange'">{{ record.status }}</a-tag>
              </template>
              <template v-if="column.key === 'action'">
                <a-button type="link" size="small" @click="traceFromSearch(record.batch_number, 'forward')">正向追溯</a-button>
              </template>
            </template>
          </a-table>
        </template>
      </a-tab-pane>

      <!-- 批次追溯 -->
      <a-tab-pane key="trace">
        <template #tab>
          <NodeIndexOutlined />
          批次追溯
        </template>
        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center;">
          <a-radio-group v-model:value="traceDirection" button-style="solid">
            <a-radio-button value="forward">正向追溯（成品→原材料）</a-radio-button>
            <a-radio-button value="reverse">反向追溯（原材料→成品）</a-radio-button>
          </a-radio-group>
          <a-input
            v-model:value="traceBatchNumber"
            :placeholder="traceDirection === 'forward' ? '输入成品批次号 (FB-...)' : '输入原材料批次号 (MB-... / HB-...)'"
            style="width: 300px"
            @pressEnter="handleTrace"
          />
          <a-button type="primary" :loading="loading" @click="handleTrace">
            <template #icon><SearchOutlined /></template>
            追溯
          </a-button>
        </div>

        <template v-if="traceResult">
          <!-- 正向追溯结果 -->
          <template v-if="traceDirection === 'forward' && traceResult.finishedBatch">
            <a-descriptions title="成品批次信息" bordered size="small" :column="3" style="margin-bottom: 16px;">
              <a-descriptions-item label="批次号">{{ traceResult.finishedBatch.batch_number }}</a-descriptions-item>
              <a-descriptions-item label="物料编号">{{ traceResult.finishedBatch.item_number }}</a-descriptions-item>
              <a-descriptions-item label="物料名称">{{ traceResult.finishedBatch.item_name }}</a-descriptions-item>
              <a-descriptions-item label="规格">{{ traceResult.finishedBatch.specifications }}</a-descriptions-item>
              <a-descriptions-item label="仓库">{{ traceResult.finishedBatch.warehouse_name }}</a-descriptions-item>
              <a-descriptions-item label="当前库存">{{ traceResult.finishedBatch.quantity }}</a-descriptions-item>
              <a-descriptions-item label="初始数量">{{ traceResult.finishedBatch.initial_quantity }}</a-descriptions-item>
              <a-descriptions-item label="入库日期">{{ formatDate(traceResult.finishedBatch.inbound_date) }}</a-descriptions-item>
              <a-descriptions-item label="生产单号">{{ traceResult.finishedBatch.production_order_number || '-' }}</a-descriptions-item>
            </a-descriptions>

            <h4>关联原材料批次 ({{ traceResult.materialBatches?.length || 0 }}条) <span style="font-weight: normal; color: #999; font-size: 12px;">点击行展开查看报工和检验记录</span></h4>
            <a-table
              :dataSource="traceResult.materialBatches"
              :columns="traceLinkColumns"
              :pagination="false"
              :scroll="{ x: 1000 }"
              size="small"
              rowKey="id"
              :expandRowByClick="true"
              v-model:expandedRowKeys="expandedBatchKeys"
              @expand="handleBatchExpand"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'action'">
                  <a-button type="link" size="small" @click.stop="() => { traceBatchNumber = record.material_batch_number; traceDirection = 'reverse'; handleTrace() }">
                    反向追溯
                  </a-button>
                </template>
              </template>
              <template #expandedRowRender="{ record }">
                <div style="padding: 8px 0;">
                  <!-- 报工记录 -->
                  <div v-if="getRelatedWorkReports(record.production_order_number).length > 0" style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #1890ff;">报工记录 ({{ getRelatedWorkReports(record.production_order_number).length }}条)</div>
                    <a-table
                      :dataSource="getRelatedWorkReports(record.production_order_number)"
                      :columns="workReportColumns"
                      :pagination="false"
                      size="small"
                      rowKey="work_report_number"
                    >
                      <template #bodyCell="{ column: col, record: r }">
                        <template v-if="col.dataIndex === 'approval_status'">
                          <a-tag :color="r.approval_status === '已审批' ? 'green' : r.approval_status === '待审批' ? 'orange' : 'default'">{{ r.approval_status }}</a-tag>
                        </template>
                      </template>
                    </a-table>
                  </div>
                  <!-- 来料检验 -->
                  <div v-if="getRelatedPurchaseInspections(record.material_batch_number).length > 0" style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #52c41a;">来料质量检验 ({{ getRelatedPurchaseInspections(record.material_batch_number).length }}条)</div>
                    <a-table
                      :dataSource="getRelatedPurchaseInspections(record.material_batch_number)"
                      :columns="purchaseInspectionColumns"
                      :pagination="false"
                      size="small"
                      rowKey="inspection_number"
                    >
                      <template #bodyCell="{ column: col, record: r }">
                        <template v-if="col.dataIndex === 'inspect_result'">
                          <a-tag :color="inspectResultColor(r.inspect_result)">{{ r.inspect_result }}</a-tag>
                        </template>
                      </template>
                    </a-table>
                  </div>
                  <!-- 生产检验 -->
                  <div v-if="getRelatedProductionInspections(record.production_order_number).length > 0" style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #722ed1;">生产检验 ({{ getRelatedProductionInspections(record.production_order_number).length }}条)</div>
                    <a-table
                      :dataSource="getRelatedProductionInspections(record.production_order_number)"
                      :columns="productionInspectionColumns"
                      :pagination="false"
                      size="small"
                      rowKey="inspection_number"
                    >
                      <template #bodyCell="{ column: col, record: r }">
                        <template v-if="col.dataIndex === 'inspection_result'">
                          <a-tag :color="inspectResultColor(r.inspection_result)">{{ r.inspection_result }}</a-tag>
                        </template>
                      </template>
                    </a-table>
                  </div>
                  <a-empty v-if="getRelatedWorkReports(record.production_order_number).length === 0 && getRelatedPurchaseInspections(record.material_batch_number).length === 0 && getRelatedProductionInspections(record.production_order_number).length === 0" description="暂无关联的报工和检验记录" :image="1" />
                </div>
              </template>
            </a-table>
          </template>

          <!-- 反向追溯结果 -->
          <template v-if="traceDirection === 'reverse' && traceResult.materialBatch">
            <a-descriptions title="原材料批次信息" bordered size="small" :column="3" style="margin-bottom: 16px;">
              <a-descriptions-item label="批次号">{{ traceResult.materialBatch.batch_number }}</a-descriptions-item>
              <a-descriptions-item label="物料编号">{{ traceResult.materialBatch.item_number }}</a-descriptions-item>
              <a-descriptions-item label="物料名称">{{ traceResult.materialBatch.item_name }}</a-descriptions-item>
              <a-descriptions-item label="规格">{{ traceResult.materialBatch.specifications }}</a-descriptions-item>
              <a-descriptions-item label="仓库">{{ traceResult.materialBatch.warehouse_name }}</a-descriptions-item>
              <a-descriptions-item label="当前库存">{{ traceResult.materialBatch.quantity }}</a-descriptions-item>
              <a-descriptions-item label="初始数量">{{ traceResult.materialBatch.initial_quantity }}</a-descriptions-item>
              <a-descriptions-item label="入库日期">{{ formatDate(traceResult.materialBatch.inbound_date) }}</a-descriptions-item>
              <a-descriptions-item label="生产单号">{{ traceResult.materialBatch.production_order_number || '-' }}</a-descriptions-item>
            </a-descriptions>

            <!-- 原材料的来料检验（直接关联此批次号） -->
            <template v-if="traceResult.purchaseInspections?.length > 0">
              <h4 style="margin-top: 16px;">来料质量检验 ({{ traceResult.purchaseInspections.length }}条)</h4>
              <a-table
                :dataSource="traceResult.purchaseInspections"
                :columns="purchaseInspectionColumns"
                :pagination="false"
                :scroll="{ x: 1200 }"
                size="small"
                rowKey="inspection_number"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.dataIndex === 'inspect_result'">
                    <a-tag :color="inspectResultColor(record.inspect_result)">{{ record.inspect_result }}</a-tag>
                  </template>
                </template>
              </a-table>
            </template>

            <h4 style="margin-top: 16px;">关联成品批次 ({{ traceResult.finishedBatches?.length || 0 }}条) <span style="font-weight: normal; color: #999; font-size: 12px;">点击行展开查看报工和检验记录</span></h4>
            <a-table
              :dataSource="traceResult.finishedBatches"
              :columns="reverseTraceLinkColumns"
              :pagination="false"
              :scroll="{ x: 1000 }"
              size="small"
              rowKey="id"
              :expandRowByClick="true"
              v-model:expandedRowKeys="expandedBatchKeys"
              @expand="handleBatchExpand"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'action'">
                  <a-button type="link" size="small" @click.stop="() => { traceBatchNumber = record.finished_batch_number; traceDirection = 'forward'; handleTrace() }">
                    正向追溯
                  </a-button>
                </template>
              </template>
              <template #expandedRowRender="{ record }">
                <div style="padding: 8px 0;">
                  <!-- 报工记录 -->
                  <div v-if="getRelatedWorkReports(record.production_order_number).length > 0" style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #1890ff;">报工记录 ({{ getRelatedWorkReports(record.production_order_number).length }}条)</div>
                    <a-table
                      :dataSource="getRelatedWorkReports(record.production_order_number)"
                      :columns="workReportColumns"
                      :pagination="false"
                      size="small"
                      rowKey="work_report_number"
                    >
                      <template #bodyCell="{ column: col, record: r }">
                        <template v-if="col.dataIndex === 'approval_status'">
                          <a-tag :color="r.approval_status === '已审批' ? 'green' : r.approval_status === '待审批' ? 'orange' : 'default'">{{ r.approval_status }}</a-tag>
                        </template>
                      </template>
                    </a-table>
                  </div>
                  <!-- 生产检验 -->
                  <div v-if="getRelatedProductionInspections(record.production_order_number).length > 0" style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #722ed1;">生产检验 ({{ getRelatedProductionInspections(record.production_order_number).length }}条)</div>
                    <a-table
                      :dataSource="getRelatedProductionInspections(record.production_order_number)"
                      :columns="productionInspectionColumns"
                      :pagination="false"
                      size="small"
                      rowKey="inspection_number"
                    >
                      <template #bodyCell="{ column: col, record: r }">
                        <template v-if="col.dataIndex === 'inspection_result'">
                          <a-tag :color="inspectResultColor(r.inspection_result)">{{ r.inspection_result }}</a-tag>
                        </template>
                      </template>
                    </a-table>
                  </div>
                  <a-empty v-if="getRelatedWorkReports(record.production_order_number).length === 0 && getRelatedProductionInspections(record.production_order_number).length === 0" description="暂无关联的报工和检验记录" :image="1" />
                </div>
              </template>
            </a-table>
          </template>

          <!-- 相关生产单 -->
          <template v-if="traceResult.productionOrders?.length > 0">
            <h4 style="margin-top: 16px;">相关生产单</h4>
            <a-table
              :dataSource="traceResult.productionOrders"
              :pagination="false"
              size="small"
              rowKey="production_order_number"
            >
              <a-table-column title="生产单号" dataIndex="production_order_number" :width="140" />
              <a-table-column title="物料编号" dataIndex="item_number" :width="130" />
              <a-table-column title="物料名称" dataIndex="item_name" :width="160" />
              <a-table-column title="计划数量" dataIndex="planned_quantity" :width="100" />
              <a-table-column title="入库数量" dataIndex="inbound_quantity" :width="100" />
              <a-table-column title="状态" dataIndex="plan_status" :width="80" />
              <a-table-column title="生产日期" dataIndex="production_date" :width="110">
                <template #default="{ record }">{{ formatDateShort(record.production_date) }}</template>
              </a-table-column>
              <a-table-column title="操作" :width="100">
                <template #default="{ record }">
                  <a-button type="link" size="small" @click="() => { activeTab = 'production'; ponNumber = record.production_order_number; handlePonTrace() }">
                    详情追溯
                  </a-button>
                </template>
              </a-table-column>
            </a-table>
          </template>
        </template>
      </a-tab-pane>

      <!-- 生产单追溯 -->
      <a-tab-pane key="production">
        <template #tab>
          <FileSearchOutlined />
          生产单追溯
        </template>
        <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center;">
          <a-input
            v-model:value="ponNumber"
            placeholder="输入生产单号"
            style="width: 300px"
            @pressEnter="handlePonTrace"
          />
          <a-button type="primary" :loading="loading" @click="handlePonTrace">
            <template #icon><SearchOutlined /></template>
            追溯
          </a-button>
        </div>

        <template v-if="ponResult">
          <!-- 生产单信息 -->
          <template v-if="ponResult.productionOrder">
            <a-descriptions title="生产单信息" bordered size="small" :column="3" style="margin-bottom: 16px;">
              <a-descriptions-item label="生产单号">{{ ponResult.productionOrder.production_order_number }}</a-descriptions-item>
              <a-descriptions-item label="物料编号">{{ ponResult.productionOrder.item_number }}</a-descriptions-item>
              <a-descriptions-item label="物料名称">{{ ponResult.productionOrder.item_name }}</a-descriptions-item>
              <a-descriptions-item label="计划数量">{{ ponResult.productionOrder.planned_quantity }}</a-descriptions-item>
              <a-descriptions-item label="入库数量">{{ ponResult.productionOrder.inbound_quantity || 0 }}</a-descriptions-item>
              <a-descriptions-item label="状态">{{ ponResult.productionOrder.plan_status }}</a-descriptions-item>
            </a-descriptions>
          </template>

          <!-- 成品批次 -->
          <template v-if="ponResult.finishedBatches?.length > 0">
            <h4>产出成品批次 ({{ ponResult.finishedBatches.length }}条)</h4>
            <a-table
              :dataSource="ponResult.finishedBatches"
              :columns="finishedColumns.filter(c => c.key !== 'action')"
              :pagination="false"
              size="small"
              rowKey="id"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'inbound_date'">{{ formatDateShort(record.inbound_date) }}</template>
                <template v-if="column.dataIndex === 'status'">
                  <a-tag :color="record.status === '正常' ? 'green' : 'orange'">{{ record.status }}</a-tag>
                </template>
              </template>
            </a-table>
          </template>

          <!-- 半成品批次 -->
          <template v-if="ponResult.materialBatches?.length > 0">
            <h4 style="margin-top: 16px;">产出半成品批次 ({{ ponResult.materialBatches.length }}条)</h4>
            <a-table
              :dataSource="ponResult.materialBatches"
              :pagination="false"
              size="small"
              rowKey="id"
            >
              <a-table-column title="批次号" dataIndex="batch_number" :width="160" />
              <a-table-column title="物料编号" dataIndex="item_number" :width="130" />
              <a-table-column title="物料名称" dataIndex="item_name" :width="160" />
              <a-table-column title="仓库" dataIndex="warehouse_name" :width="120" />
              <a-table-column title="当前库存" dataIndex="quantity" :width="100" />
              <a-table-column title="入库日期" dataIndex="inbound_date" :width="110">
                <template #default="{ record }">{{ formatDateShort(record.inbound_date) }}</template>
              </a-table-column>
              <a-table-column title="状态" dataIndex="status" :width="80">
                <template #default="{ record }">
                  <a-tag :color="record.status === '正常' ? 'green' : 'orange'">{{ record.status }}</a-tag>
                </template>
              </a-table-column>
            </a-table>
          </template>

          <!-- 领料记录（可展开查看来料检验） -->
          <template v-if="ponResult.issueRecords?.length > 0">
            <h4 style="margin-top: 16px;">领料记录 ({{ ponResult.issueRecords.length }}条) <span style="font-weight: normal; color: #999; font-size: 12px;">点击行展开查看来料检验</span></h4>
            <a-table
              :dataSource="ponResult.issueRecords"
              :columns="issueColumns"
              :pagination="false"
              size="small"
              rowKey="batch_number"
              :expandRowByClick="true"
              v-model:expandedRowKeys="expandedIssueKeys"
              @expand="handleIssueExpand"
            >
              <template #expandedRowRender="{ record }">
                <div style="padding: 8px 0;">
                  <div v-if="getIssuePurchaseInspections(record.batch_number).length > 0" style="margin-bottom: 8px;">
                    <div style="font-weight: 600; margin-bottom: 4px; color: #52c41a;">来料质量检验 ({{ getIssuePurchaseInspections(record.batch_number).length }}条)</div>
                    <a-table
                      :dataSource="getIssuePurchaseInspections(record.batch_number)"
                      :columns="issuePurchaseInspectionColumns"
                      :pagination="false"
                      size="small"
                      rowKey="inspection_number"
                    >
                      <template #bodyCell="{ column: col, record: r }">
                        <template v-if="col.dataIndex === 'inspect_result'">
                          <a-tag :color="inspectResultColor(r.inspect_result)">{{ r.inspect_result }}</a-tag>
                        </template>
                      </template>
                    </a-table>
                  </div>
                  <a-empty v-else description="该批次无来料检验记录" :image="1" />
                </div>
              </template>
            </a-table>
          </template>

          <!-- 追溯关联 -->
          <template v-if="ponResult.traceLinks?.length > 0">
            <h4 style="margin-top: 16px;">追溯关联 ({{ ponResult.traceLinks.length }}条)</h4>
            <a-table
              :dataSource="ponResult.traceLinks"
              :pagination="false"
              size="small"
              rowKey="id"
            >
              <a-table-column title="成品批次" dataIndex="finished_batch_number" :width="160" />
              <a-table-column title="成品" dataIndex="finished_item_name" :width="140" />
              <a-table-column title="原材料批次" dataIndex="material_batch_number" :width="160" />
              <a-table-column title="原材料" dataIndex="material_item_name" :width="140" />
              <a-table-column title="领料数量" dataIndex="material_quantity" :width="100" />
              <a-table-column title="关联类型" dataIndex="link_type" :width="80" />
            </a-table>
          </template>

          <!-- 报工记录 -->
          <template v-if="ponResult.workReports?.length > 0">
            <h4 style="margin-top: 16px;">报工记录 ({{ ponResult.workReports.length }}条)</h4>
            <a-table
              :dataSource="ponResult.workReports"
              :columns="workReportColumns"
              :pagination="false"
              size="small"
              rowKey="work_report_number"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'approval_status'">
                  <a-tag :color="record.approval_status === '已审批' ? 'green' : record.approval_status === '待审批' ? 'orange' : 'default'">{{ record.approval_status }}</a-tag>
                </template>
              </template>
            </a-table>
          </template>

          <!-- 生产检验 -->
          <template v-if="ponResult.productionInspections?.length > 0">
            <h4 style="margin-top: 16px;">生产检验 ({{ ponResult.productionInspections.length }}条)</h4>
            <a-table
              :dataSource="ponResult.productionInspections"
              :columns="productionInspectionColumns"
              :pagination="false"
              size="small"
              rowKey="inspection_number"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'inspection_result'">
                  <a-tag :color="inspectResultColor(record.inspection_result)">{{ record.inspection_result }}</a-tag>
                </template>
              </template>
            </a-table>
          </template>
        </template>
      </a-tab-pane>

      <!-- 生产过程可视化 -->
      <a-tab-pane key="chart">
        <template #tab>
          <ApartmentOutlined />
          过程图
        </template>
        <div style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center;">
          <a-radio-group v-model:value="chartTab" button-style="solid">
            <a-radio-button value="trace">批次追溯数据</a-radio-button>
            <a-radio-button value="pon">生产单追溯数据</a-radio-button>
          </a-radio-group>
          <span style="color: #999; font-size: 12px;">请先在"批次追溯"或"生产单追溯"中查询数据，再切换到本标签页查看可视化图表</span>
        </div>

        <template v-if="chartOption">
          <v-chart :option="chartOption" style="height: 600px; width: 100%;" autoresize />
        </template>
        <a-empty v-else description="暂无可视化数据，请先进行批次追溯或生产单追溯查询" />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style scoped>
.page-container {
  padding: 16px;
}
h4 {
  margin: 8px 0;
  color: #333;
}
</style>
