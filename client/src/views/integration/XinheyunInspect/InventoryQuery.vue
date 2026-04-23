<script setup lang="ts">
import { ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { queryInventoryDetail } from '@/api/integration/xinheyunInspect'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

const loading = ref(false)
const exporting = ref(false)
const dataSource = ref<any[]>([])

// 查询条件
const itemCodesInput = ref('')
const warehouseCodesInput = ref('')
const warehouseBinCodesInput = ref('')
const batchCodesInput = ref('')
const snCodesInput = ref('')

/** 将文本框输入拆分为数组（支持逗号、空格、换行分隔） */
const splitInput = (text: string): string[] => {
  if (!text.trim()) return []
  return text.split(/[,，\s\n]+/).map(s => s.trim()).filter(Boolean)
}

const hasCondition = computed(() => {
  return !!(itemCodesInput.value.trim() || warehouseCodesInput.value.trim() ||
    warehouseBinCodesInput.value.trim() || batchCodesInput.value.trim() ||
    snCodesInput.value.trim())
})

const fetchData = async () => {
  if (!hasCondition.value) {
    message.warning('请至少输入一个查询条件')
    return
  }
  loading.value = true
  try {
    const res = await queryInventoryDetail({
      itemCodes: splitInput(itemCodesInput.value),
      warehouseCodes: splitInput(warehouseCodesInput.value),
      warehouseBinCodes: splitInput(warehouseBinCodesInput.value),
      batchCodes: splitInput(batchCodesInput.value),
      snCodes: splitInput(snCodesInput.value)
    })
    if (res.success) {
      dataSource.value = res.data?.items || []
      message.success(res.message || `查询到 ${dataSource.value.length} 条记录`)
    } else {
      message.error(res.message || '查询失败')
    }
  } catch {
    message.error('查询库存明细失败')
  } finally {
    loading.value = false
  }
}

const handleReset = () => {
  itemCodesInput.value = ''
  warehouseCodesInput.value = ''
  warehouseBinCodesInput.value = ''
  batchCodesInput.value = ''
  snCodesInput.value = ''
  dataSource.value = []
}

// 动态列：根据返回数据自动推断
const columns = computed(() => {
  if (dataSource.value.length === 0) return defaultColumns
  // 使用返回的第一条数据的key来生成列
  const firstRow = dataSource.value[0]
  const keys = Object.keys(firstRow)
  // 映射常见字段名
  const mapped = keys.map(key => ({
    title: columnNameMap[key] || key,
    dataIndex: key,
    key,
    width: getColumnWidth(key),
    ellipsis: true
  }))
  return [
    { title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const },
    ...mapped
  ]
})

const columnNameMap: Record<string, string> = {
  itemCode: '物料编码',
  itemName: '物料名称',
  itemSpecification: '规格型号',
  warehouseCode: '仓库编码',
  warehouseName: '仓库名称',
  warehouseBinCode: '库位编码',
  warehouseBinName: '库位名称',
  batchCode: '批次号',
  snCode: '序列号',
  quantity: '库存数量',
  availableQuantity: '可用数量',
  availableQualifiedQty: '库存数B',
  availableUnQualifiedQty: '库存次品数',
  lockedQuantity: '锁定数量',
  unitName: '单位',
  unitCode: '单位编码',
  itemType: '物料属性',
  categoryName: '分类名称',
  categoryId: '分类ID',
  specification: '规格',
  id: 'ID',
  itemId: '物料ID',
  warehouseId: '仓库ID',
  warehouseBinId: '库位ID'
}

const getColumnWidth = (key: string): number => {
  const widthMap: Record<string, number> = {
    itemCode: 140, itemName: 180, itemSpecification: 180,
    warehouseCode: 120, warehouseName: 140,
    warehouseBinCode: 120, warehouseBinName: 140,
    batchCode: 140, snCode: 140,
    quantity: 100, availableQuantity: 100, lockedQuantity: 100,
    unitName: 80, unitCode: 80,
    itemType: 100, categoryName: 120,
    specification: 160, id: 80
  }
  return widthMap[key] || 120
}

const defaultColumns = [
  { title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const },
  { title: '物料编码', dataIndex: 'itemCode', key: 'itemCode', width: 140 },
  { title: '物料名称', dataIndex: 'itemName', key: 'itemName', width: 180 },
  { title: '规格型号', dataIndex: 'itemSpecification', key: 'itemSpecification', width: 180 },
  { title: '仓库编码', dataIndex: 'warehouseCode', key: 'warehouseCode', width: 120 },
  { title: '仓库名称', dataIndex: 'warehouseName', key: 'warehouseName', width: 140 },
  { title: '库位编码', dataIndex: 'warehouseBinCode', key: 'warehouseBinCode', width: 120 },
  { title: '库位名称', dataIndex: 'warehouseBinName', key: 'warehouseBinName', width: 140 },
  { title: '批次号', dataIndex: 'batchCode', key: 'batchCode', width: 140 },
  { title: '序列号', dataIndex: 'snCode', key: 'snCode', width: 140 },
  { title: '库存数量', dataIndex: 'quantity', key: 'quantity', width: 100 },
  { title: '可用数量', dataIndex: 'availableQuantity', key: 'availableQuantity', width: 100 },
  { title: '单位', dataIndex: 'unitName', key: 'unitName', width: 80 },
]

// 汇总统计
const summaryStats = computed(() => {
  const data = dataSource.value
  if (data.length === 0) return null
  const totalQty = data.reduce((sum, d) => sum + (parseFloat(d.quantity) || 0), 0)
  const availableQty = data.reduce((sum, d) => sum + (parseFloat(d.availableQuantity) || 0), 0)
  const itemSet = new Set(data.map((d: any) => d.itemCode).filter(Boolean))
  const whSet = new Set(data.map((d: any) => d.warehouseCode).filter(Boolean))
  return {
    totalRecords: data.length,
    totalQty: totalQty.toFixed(2),
    availableQty: availableQty.toFixed(2),
    itemCount: itemSet.size,
    warehouseCount: whSet.size
  }
})

// 导出Excel
const handleExport = async () => {
  if (dataSource.value.length === 0) {
    message.warning('没有数据可导出')
    return
  }
  exporting.value = true
  try {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('库存明细')

    // 标题行
    const headerKeys = columns.value.filter(c => c.dataIndex).map(c => c.dataIndex!)
    const headerTitles = columns.value.filter(c => c.dataIndex).map(c => c.title)

    // 表头
    const headerRow = ws.addRow(['行号', ...headerTitles])
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1890FF' } }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
    headerRow.height = 24

    // 数据行
    dataSource.value.forEach((row, idx) => {
      const values = headerKeys.map(key => {
        const val = row[key]
        return val !== null && val !== undefined ? val : ''
      })
      const dataRow = ws.addRow([idx + 1, ...values])
      if (idx % 2 === 1) {
        dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
      }
    })

    // 列宽
    ws.columns.forEach((col, i) => {
      col.width = i === 0 ? 8 : Math.max(12, (headerTitles[i - 1] || '').length * 2 + 6)
    })

    // 边框
    ws.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        }
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buf]), `新核云库存明细_${new Date().toISOString().slice(0, 10)}.xlsx`)
    message.success('导出成功')
  } catch {
    message.error('导出失败')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="inventory-page">
    <a-card title="新核云库存明细查询" :bordered="false">
      <template #extra>
        <a-space>
          <a-button :icon="h(DownloadOutlined)" :loading="exporting" :disabled="dataSource.length === 0" @click="handleExport">导出Excel</a-button>
          <a-button :icon="h(ReloadOutlined)" @click="handleReset">重置</a-button>
        </a-space>
      </template>

      <!-- 查询条件区域 -->
      <div class="search-area">
        <a-row :gutter="16">
          <a-col :span="8">
            <div class="field-label">物料编码</div>
            <a-textarea
              v-model:value="itemCodesInput"
              placeholder="输入物料编码，多个用逗号或换行分隔"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              allow-clear
            />
          </a-col>
          <a-col :span="8">
            <div class="field-label">仓库编码</div>
            <a-textarea
              v-model:value="warehouseCodesInput"
              placeholder="输入仓库编码，多个用逗号或换行分隔"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              allow-clear
            />
          </a-col>
          <a-col :span="8">
            <div class="field-label">库位编码</div>
            <a-textarea
              v-model:value="warehouseBinCodesInput"
              placeholder="输入库位编码，多个用逗号或换行分隔"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              allow-clear
            />
          </a-col>
        </a-row>
        <a-row :gutter="16" style="margin-top: 12px">
          <a-col :span="8">
            <div class="field-label">批次号</div>
            <a-textarea
              v-model:value="batchCodesInput"
              placeholder="输入批次号，多个用逗号或换行分隔"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              allow-clear
            />
          </a-col>
          <a-col :span="8">
            <div class="field-label">序列号</div>
            <a-textarea
              v-model:value="snCodesInput"
              placeholder="输入序列号，多个用逗号或换行分隔"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              allow-clear
            />
          </a-col>
          <a-col :span="8" style="display: flex; align-items: flex-end">
            <a-button
              type="primary"
              :icon="h(SearchOutlined)"
              :loading="loading"
              :disabled="!hasCondition"
              size="large"
              style="width: 100%"
              @click="fetchData"
            >
              查询库存
            </a-button>
          </a-col>
        </a-row>
      </div>

      <!-- 汇总统计 -->
      <div v-if="summaryStats" class="summary-bar">
        <a-row :gutter="16">
          <a-col :span="5">
            <a-statistic title="查询结果" :value="summaryStats.totalRecords" suffix="条" :value-style="{ fontSize: '20px', fontWeight: 600 }" />
          </a-col>
          <a-col :span="5">
            <a-statistic title="物料种类" :value="summaryStats.itemCount" suffix="种" :value-style="{ fontSize: '20px', fontWeight: 600 }" />
          </a-col>
          <a-col :span="5">
            <a-statistic title="涉及仓库" :value="summaryStats.warehouseCount" suffix="个" :value-style="{ fontSize: '20px', fontWeight: 600 }" />
          </a-col>
          <a-col :span="5">
            <a-statistic title="库存总量" :value="summaryStats.totalQty" :value-style="{ fontSize: '20px', fontWeight: 600, color: '#1890ff' }" />
          </a-col>
          <a-col :span="4">
            <a-statistic title="可用总量" :value="summaryStats.availableQty" :value-style="{ fontSize: '20px', fontWeight: 600, color: '#52c41a' }" />
          </a-col>
        </a-row>
      </div>

      <!-- 数据表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :scroll="{ x: 1600, y: 'calc(100vh - 520px)' }"
        :pagination="false"
        row-key="__rowKey"
        size="small"
        bordered
      >
        <template #bodyCell="{ column, index, record }">
          <template v-if="column.key === 'rowIndex'">
            {{ index + 1 }}
          </template>
          <template v-else-if="column.dataIndex === 'quantity' || column.dataIndex === 'availableQuantity' || column.dataIndex === 'lockedQuantity'">
            <span :style="{ fontWeight: 600, color: parseFloat(record[column.dataIndex]) > 0 ? '#1890ff' : '#999' }">
              {{ record[column.dataIndex] ?? '-' }}
            </span>
          </template>
        </template>
      </a-table>

      <!-- 空状态 -->
      <div v-if="dataSource.length === 0 && !loading" class="empty-tip">
        <a-empty description="请输入查询条件后点击「查询库存」" />
      </div>
    </a-card>
  </div>
</template>

<script lang="ts">
import { h } from 'vue'
export default { name: 'InventoryQuery' }
</script>

<style scoped>
.inventory-page {
  padding: 0;
}

.search-area {
  background: #fafafa;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #f0f0f0;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  margin-bottom: 6px;
}

.summary-bar {
  background: #f6f9fc;
  border-radius: 6px;
  padding: 16px 20px;
  margin-bottom: 16px;
  border: 1px solid #e8f0fe;
}

.empty-tip {
  padding: 40px 0;
  text-align: center;
}
</style>
