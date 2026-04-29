<script setup lang="ts">
import { computed } from 'vue'
import {
  CheckCircleOutlined,
  EditOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
  SwapOutlined
} from '@ant-design/icons-vue'

interface ComparisonItem {
  material_number: string
  material_name: string
  diff_type: 'unchanged' | 'quantity_changed' | 'new_added' | 'removed' | 'material_changed'
  old_quantity: number
  new_quantity: number
  old_order_number: string | null
  unit: string
  new_material?: string | null
}

interface ComparisonData {
  mouldBomNumber: string | null
  standardBomNumber: string | null
  comparison: ComparisonItem[]
  summary: {
    total: number
    unchanged: number
    quantity_changed: number
    new_added: number
    removed: number
    material_changed: number
  }
}

const props = defineProps<{
  open: boolean
  data: ComparisonData | null
  orderNo: string
  mouldNumber: string
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'confirm', comparison: ComparisonItem[]): void
}>()

const diffTypeMap: Record<string, { label: string; color: string; icon: any }> = {
  unchanged: { label: '无变化', color: 'green', icon: CheckCircleOutlined },
  quantity_changed: { label: '数量变更', color: 'blue', icon: EditOutlined },
  new_added: { label: '新增', color: 'cyan', icon: PlusCircleOutlined },
  removed: { label: '取消', color: 'red', icon: MinusCircleOutlined },
  material_changed: { label: '物料替换', color: 'orange', icon: SwapOutlined }
}

const columns = [
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 140 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', ellipsis: true },
  { title: '差异类型', dataIndex: 'diff_type', key: 'diff_type', width: 110 },
  { title: '原数量', dataIndex: 'old_quantity', key: 'old_quantity', width: 100, align: 'right' },
  { title: '新数量', dataIndex: 'new_quantity', key: 'new_quantity', width: 100, align: 'right' },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 70 },
  { title: '原生产单', dataIndex: 'old_order_number', key: 'old_order_number', width: 150 }
]

const hasChanges = computed(() => {
  if (!props.data) return false
  const s = props.data.summary
  return s.quantity_changed > 0 || s.new_added > 0 || s.removed > 0 || s.material_changed > 0
})

const handleConfirm = () => {
  if (!props.data) return
  emit('confirm', props.data.comparison)
  emit('update:open', false)
}

const handleCancel = () => {
  emit('update:open', false)
}
</script>

<template>
  <a-modal
    :open="props.open"
    title="模具级MRP差异对比确认"
    width="780px"
    :maskClosable="false"
    :footer="null"
    @cancel="handleCancel"
  >
    <div v-if="data">
      <div style="margin-bottom: 12px; display: flex; gap: 16px; flex-wrap: wrap;">
        <a-tag color="blue">生产单: {{ orderNo }}</a-tag>
        <a-tag color="purple">模具: {{ mouldNumber }}</a-tag>
        <a-tag v-if="data.mouldBomNumber" color="cyan">模具BOM: {{ data.mouldBomNumber }}</a-tag>
        <a-tag v-if="data.standardBomNumber" color="green">标准BOM: {{ data.standardBomNumber }}</a-tag>
      </div>

      <a-descriptions size="small" :column="5" style="margin-bottom: 12px; background: #f6ffed; padding: 8px 12px; border-radius: 4px;">
        <a-descriptions-item label="总计">{{ data.summary.total }} 项</a-descriptions-item>
        <a-descriptions-item label="无变化">{{ data.summary.unchanged }} 项</a-descriptions-item>
        <a-descriptions-item label="数量变更">{{ data.summary.quantity_changed }} 项</a-descriptions-item>
        <a-descriptions-item label="新增">{{ data.summary.new_added }} 项</a-descriptions-item>
        <a-descriptions-item label="取消">{{ data.summary.removed }} 项</a-descriptions-item>
        <a-descriptions-item label="物料替换">{{ data.summary.material_changed }} 项</a-descriptions-item>
      </a-descriptions>

      <a-table
        :columns="columns"
        :data-source="data.comparison"
        :pagination="false"
        size="small"
        :scroll="{ y: 320 }"
        row-key="material_number"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'diff_type'">
            <a-tag :color="diffTypeMap[record.diff_type]?.color">
              <component :is="diffTypeMap[record.diff_type]?.icon" style="margin-right: 4px;" />
              {{ diffTypeMap[record.diff_type]?.label }}
            </a-tag>
          </template>
          <template v-if="column.key === 'old_quantity'">
            <span :style="record.diff_type === 'new_added' ? { color: '#999' } : {}">
              {{ record.diff_type === 'new_added' ? '-' : record.old_quantity }}
            </span>
          </template>
          <template v-if="column.key === 'new_quantity'">
            <span :style="record.diff_type === 'removed' ? { color: '#999' } : {}">
              {{ record.diff_type === 'removed' ? '-' : record.new_quantity }}
            </span>
          </template>
          <template v-if="column.key === 'old_order_number'">
            <span v-if="record.old_order_number" style="font-size: 12px; color: #666;">{{ record.old_order_number }}</span>
            <span v-else style="color: #999;">-</span>
          </template>
        </template>
      </a-table>

      <div style="margin-top: 16px; text-align: right;">
        <a-button style="margin-right: 8px;" @click="handleCancel">取消</a-button>
        <a-button v-if="hasChanges" type="primary" @click="handleConfirm">
          确认应用差异并派发
        </a-button>
        <a-button v-else type="primary" @click="handleConfirm">
          确认派发（无差异）
        </a-button>
      </div>
    </div>
    <a-empty v-else description="暂无差异数据" />
  </a-modal>
</template>
