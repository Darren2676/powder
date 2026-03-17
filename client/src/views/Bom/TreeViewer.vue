<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ApartmentOutlined, ArrowLeftOutlined, ExpandAltOutlined, ShrinkOutlined,
  WarningOutlined, SearchOutlined
} from '@ant-design/icons-vue'
import { getBomHeaders, getBomTree } from '@/api/bom'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { TreeChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([TreeChart, TooltipComponent, LegendComponent, CanvasRenderer])

defineOptions({ name: 'BomTreeViewer' })

const route = useRoute()
const router = useRouter()

// ==================== Interfaces ====================
interface TreeNode {
  key: string
  material_number: string
  material_name: string
  material_type: string
  standard_quantity: number
  unit: string
  wastage_rate: number
  actual_quantity: number
  has_child_bom: boolean
  matched_bom_number: string | null
  sub_bom_info: { bom_number: string; bom_name: string; bom_version: string } | null
  is_circular: boolean
  circular_bom_number: string | null
  level: number
  children?: TreeNode[]
}

// ==================== State ====================
const selectedBomNumber = ref<string>('')
const bomOptions = ref<{ label: string; value: string }[]>([])
const treeLoading = ref(false)
const bomTreeRaw = ref<any>(null)
const tableTreeData = ref<TreeNode[]>([])
const expandedRowKeys = ref<string[]>([])
const allRowKeys = ref<string[]>([])
const activeTab = ref<string>('table')

// ==================== BOM Options ====================
const fetchBomOptions = async () => {
  try {
    const res = await getBomHeaders({ page: 1, limit: 9999 })
    const items = res.data.items || []
    bomOptions.value = items.map((h: any) => ({
      label: `${h.bom_number} - ${h.bom_name || h.item_name || ''}`,
      value: h.bom_number
    }))
  } catch { message.error('获取BOM列表失败') }
}

// ==================== Data Transform ====================
function transformBomTreeToTableData(tree: any, parentKey: string, level: number): TreeNode[] {
  if (!tree || !tree.details) return []
  const nodes: TreeNode[] = []
  tree.details.forEach((d: any, index: number) => {
    const key = `${parentKey}-${index}-${d.material_number}`
    const node: TreeNode = {
      key,
      material_number: d.material_number,
      material_name: d.material_name,
      material_type: d.material_type,
      standard_quantity: d.standard_quantity,
      unit: d.unit,
      wastage_rate: d.wastage_rate,
      actual_quantity: d.actual_quantity,
      has_child_bom: d.has_child_bom,
      matched_bom_number: d.matched_bom_number,
      sub_bom_info: null,
      is_circular: false,
      circular_bom_number: null,
      level
    }
    if (d.children) {
      if (d.children.circular) {
        node.is_circular = true
        node.circular_bom_number = d.children.bom_number
      } else {
        node.sub_bom_info = {
          bom_number: d.children.bom_number,
          bom_name: d.children.bom_name,
          bom_version: d.children.bom_version
        }
        const childNodes = transformBomTreeToTableData(d.children, key, level + 1)
        if (childNodes.length > 0) {
          node.children = childNodes
        }
      }
    }
    nodes.push(node)
  })
  return nodes
}

function collectAllExpandableKeys(nodes: TreeNode[]): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      keys.push(node.key)
      keys.push(...collectAllExpandableKeys(node.children))
    }
  }
  return keys
}

// ==================== ECharts Transform ====================
function transformToEChartsData(tree: any): any {
  if (!tree) return null
  const root: any = {
    name: `${tree.item_number}\n${tree.item_name || tree.bom_name}`,
    value: `${tree.bom_number} (${tree.bom_version})`,
    children: []
  }
  if (tree.details) {
    root.children = tree.details.map((d: any) => buildEChartsNode(d))
  }
  return root
}

function buildEChartsNode(detail: any): any {
  const node: any = {
    name: `${detail.material_number}\n${detail.material_name}\n用量: ${detail.standard_quantity} ${detail.unit}`,
    value: `${detail.material_number}\n${detail.actual_quantity} ${detail.unit}`,
    lineStyle: { color: '#91caff' }
  }
  if (detail.children) {
    if (detail.children.circular) {
      node.children = [{
        name: '循环引用',
        value: detail.children.bom_number,
        itemStyle: { color: '#ff4d4f' },
        label: { color: '#ff4d4f' }
      }]
    } else if (detail.children.details) {
      node.children = detail.children.details.map((d: any) => buildEChartsNode(d))
    }
  }
  return node
}

const echartsOption = computed(() => {
  const data = transformToEChartsData(bomTreeRaw.value)
  if (!data) return {}
  return {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      formatter: (params: any) => params.data?.value || ''
    },
    series: [{
      type: 'tree',
      data: [data],
      orient: 'LR',
      layout: 'orthogonal',
      symbol: 'roundRect',
      symbolSize: [150, 56],
      roam: true,
      initialTreeDepth: 3,
      label: {
        position: 'inside',
        fontSize: 10,
        color: '#333'
      },
      leaves: {
        label: {
          position: 'inside',
          fontSize: 11
        }
      },
      emphasis: {
        focus: 'descendant'
      },
      expandAndCollapse: true,
      animationDuration: 300,
      animationDurationUpdate: 300
    }]
  }
})

// ==================== Actions ====================
const handleLoadTree = async () => {
  if (!selectedBomNumber.value) { message.warning('请选择一个BOM'); return }
  treeLoading.value = true
  bomTreeRaw.value = null
  tableTreeData.value = []
  expandedRowKeys.value = []
  allRowKeys.value = []
  try {
    const res = await getBomTree(selectedBomNumber.value)
    bomTreeRaw.value = res.data
    const nodes = transformBomTreeToTableData(res.data, 'root', 0)
    tableTreeData.value = nodes
    const keys = collectAllExpandableKeys(nodes)
    allRowKeys.value = keys
    // 默认全部展开
    await nextTick()
    expandedRowKeys.value = [...keys]
  } catch { message.error('加载BOM树形结构失败') }
  finally { treeLoading.value = false }
}

const handleExpandAll = () => { expandedRowKeys.value = [...allRowKeys.value] }
const handleCollapseAll = () => { expandedRowKeys.value = [] }
const handleGoBack = () => { router.push('/boms') }

const handleSubBomClick = (bomNumber: string) => {
  selectedBomNumber.value = bomNumber
  handleLoadTree()
}

// ==================== Table Columns ====================
const treeColumns = [
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 180 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 160 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 100 },
  { title: '标准用量', dataIndex: 'standard_quantity', key: 'standard_quantity', width: 100 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 70 },
  { title: '损耗率(%)', dataIndex: 'wastage_rate', key: 'wastage_rate', width: 100 },
  { title: '实际用量', dataIndex: 'actual_quantity', key: 'actual_quantity', width: 100 },
  { title: '子BOM', dataIndex: 'matched_bom_number', key: 'matched_bom_number', width: 160 }
]

const materialTypeColorMap: Record<string, string> = {
  '成品': 'blue',
  '半成品': 'cyan',
  '原材料': 'green',
  '包材': 'orange',
  '骨架': 'purple',
  '预成型件': 'magenta'
}

const rowClassName = (record: TreeNode) => {
  return record.is_circular ? 'circular-row' : ''
}

// ==================== Lifecycle ====================
onMounted(async () => {
  await fetchBomOptions()
  const bomNumber = route.query.bomNumber as string
  if (bomNumber) {
    selectedBomNumber.value = bomNumber
    handleLoadTree()
  }
})
</script>

<template>
  <div class="bom-tree-page">
    <!-- 顶部操作栏 -->
    <a-card :bordered="false" size="small">
      <a-row justify="space-between" align="middle">
        <a-space>
          <a-button @click="handleGoBack"><ArrowLeftOutlined /> 返回列表</a-button>
          <a-select
            v-model:value="selectedBomNumber"
            show-search
            allow-clear
            placeholder="请选择或搜索BOM编号"
            :options="bomOptions"
            :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
            style="width: 360px"
          />
          <a-button type="primary" :loading="treeLoading" @click="handleLoadTree">
            <SearchOutlined /> 查看树形结构
          </a-button>
        </a-space>
        <a-space v-if="tableTreeData.length > 0">
          <a-button @click="handleExpandAll"><ExpandAltOutlined /> 全部展开</a-button>
          <a-button @click="handleCollapseAll"><ShrinkOutlined /> 全部折叠</a-button>
        </a-space>
      </a-row>
    </a-card>

    <!-- BOM 头信息 -->
    <a-card v-if="bomTreeRaw" :bordered="false" size="small">
      <a-descriptions :column="4" size="small" :labelStyle="{ fontWeight: 'bold' }">
        <a-descriptions-item label="BOM编号">{{ bomTreeRaw.bom_number }}</a-descriptions-item>
        <a-descriptions-item label="BOM名称">{{ bomTreeRaw.bom_name }}</a-descriptions-item>
        <a-descriptions-item label="产品编号">{{ bomTreeRaw.item_number }}</a-descriptions-item>
        <a-descriptions-item label="产品名称">{{ bomTreeRaw.item_name }}</a-descriptions-item>
        <a-descriptions-item label="版本">
          <a-tag color="blue">{{ bomTreeRaw.bom_version }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="基准数量">{{ bomTreeRaw.base_quantity }} {{ bomTreeRaw.base_unit }}</a-descriptions-item>
        <a-descriptions-item label="状态">
          <a-tag :color="bomTreeRaw.condition === '启用' ? 'green' : 'red'">{{ bomTreeRaw.condition }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="审批状态">
          <a-tag :color="bomTreeRaw.approval_status === '已审批' ? 'green' : bomTreeRaw.approval_status === '草稿' ? 'default' : 'orange'">{{ bomTreeRaw.approval_status }}</a-tag>
        </a-descriptions-item>
      </a-descriptions>
    </a-card>

    <!-- 主内容区 -->
    <a-card v-if="bomTreeRaw" :bordered="false" class="tree-content-card">
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="table" tab="树形表格">
          <a-table
            :columns="treeColumns"
            :data-source="tableTreeData"
            :loading="treeLoading"
            childrenColumnName="children"
            v-model:expandedRowKeys="expandedRowKeys"
            rowKey="key"
            :pagination="false"
            :scroll="{ x: 1100, y: 'calc(100vh - 420px)' }"
            size="small"
            bordered
            :row-class-name="rowClassName"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'material_number'">
                <span>{{ record.material_number }}</span>
                <a-tooltip v-if="record.is_circular" title="检测到循环引用，已停止展开">
                  <a-tag color="warning" style="margin-left: 6px;">
                    <WarningOutlined /> 循环引用
                  </a-tag>
                </a-tooltip>
              </template>
              <template v-else-if="column.key === 'material_type'">
                <a-tag :color="materialTypeColorMap[record.material_type] || 'default'">{{ record.material_type }}</a-tag>
              </template>
              <template v-else-if="column.key === 'matched_bom_number'">
                <template v-if="record.is_circular">
                  <a-tag color="error" style="cursor: pointer;" @click="handleSubBomClick(record.circular_bom_number)">
                    <WarningOutlined /> {{ record.circular_bom_number }}
                  </a-tag>
                </template>
                <template v-else-if="record.matched_bom_number">
                  <a style="color: #1890ff;" @click="handleSubBomClick(record.matched_bom_number)">
                    <ApartmentOutlined /> {{ record.matched_bom_number }}
                  </a>
                  <span v-if="record.sub_bom_info" style="margin-left: 4px; color: #999; font-size: 12px;">
                    ({{ record.sub_bom_info.bom_version }})
                  </span>
                </template>
                <span v-else style="color: #ccc;">-</span>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="chart" tab="可视化图表">
          <div v-if="echartsOption.series" class="chart-container">
            <v-chart :option="echartsOption" autoresize style="width: 100%; height: 100%;" />
          </div>
          <a-empty v-else description="暂无图表数据" />
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- 空状态 -->
    <a-card v-if="!bomTreeRaw && !treeLoading" :bordered="false" class="tree-content-card">
      <a-empty description="请选择一个BOM查看其树形结构">
        <template #image>
          <ApartmentOutlined style="font-size: 64px; color: #d9d9d9;" />
        </template>
      </a-empty>
    </a-card>
  </div>
</template>

<style scoped>
.bom-tree-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}
.tree-content-card {
  flex: 1;
}
.chart-container {
  width: 100%;
  height: calc(100vh - 420px);
  min-height: 400px;
}
:deep(.circular-row) td {
  background: #fffbe6 !important;
}
:deep(.ant-card-extra) { padding: 0; }
</style>
