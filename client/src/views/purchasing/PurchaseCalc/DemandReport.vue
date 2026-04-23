<script setup lang="ts">
import { ref, reactive, createVNode, h } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, ShoppingCartOutlined,
  ExclamationCircleOutlined, FileExcelOutlined
} from '@ant-design/icons-vue'
import { demandReport, generatePurchaseReq } from '@/api/purchasing/purchaseCalc'
import { getMfgBomHeaders } from '@/api/master-data/mfgBom'

defineOptions({ name: 'PurchaseCalcDemandReport' })

const loading = ref(false)
const generateLoading = ref(false)

// BOM selector
const bomSearch = ref('')
const bomOptions = ref<any[]>([])
const bomSearchLoading = ref(false)
const selectedBomId = ref('')
const plannedQuantity = ref<number>(1)

// Result data
const demandData = ref<any[]>([])
const hasResult = ref(false)

// Selected rows for purchase req generation
const selectedRowKeys = ref<number[]>([])

let bomSearchTimer: any = null
const onBomSearch = (val: string) => {
  if (bomSearchTimer) clearTimeout(bomSearchTimer)
  bomSearchTimer = setTimeout(async () => {
    if (!val || val.length < 1) { bomOptions.value = []; return }
    bomSearchLoading.value = true
    try {
      const res = await getMfgBomHeaders({ search: val, page: 1, pageSize: 20 })
      bomOptions.value = (res.data?.data?.list || []).map((b: any) => ({
        value: b.mfg_bom_number,
        label: `${b.mfg_bom_number} - ${b.item_name || b.item_number} (v${b.bom_version})`,
        item_number: b.item_number,
        item_name: b.item_name,
        bom_version: b.bom_version
      }))
    } catch { bomOptions.value = [] }
    bomSearchLoading.value = false
  }, 300)
}

const onRunReport = async () => {
  if (!selectedBomId.value) {
    message.warning('请先选择设计BOM')
    return
  }
  if (!plannedQuantity.value || plannedQuantity.value <= 0) {
    message.warning('请输入有效的计划生产数量')
    return
  }
  loading.value = true
  hasResult.value = false
  selectedRowKeys.value = []
  try {
    const res = await demandReport({
      mfg_bom_number: selectedBomId.value,
      planned_quantity: plannedQuantity.value
    })
    demandData.value = (res.data?.data?.items || []).map((item: any, idx: number) => ({
      ...item,
      key: idx,
      shortage: Math.max(0, (parseFloat(item.required_quantity) || 0) - (parseFloat(item.available_stock) || 0))
    }))
    hasResult.value = true
    message.success(`查询完成，共 ${demandData.value.length} 条物料需求`)
  } catch (err: any) {
    message.error(err.response?.data?.message || '查询失败')
  }
  loading.value = false
}

const onSelectChange = (keys: number[]) => {
  selectedRowKeys.value = keys
}

const onGeneratePurchaseReq = () => {
  const shortageItems = demandData.value.filter(
    (_, idx) => selectedRowKeys.value.includes(idx)
  ).filter(item => item.shortage > 0)

  if (shortageItems.length === 0) {
    message.warning('请选择存在缺口的物料')
    return
  }

  Modal.confirm({
    title: '确认生成采购申请',
    icon: createVNode(ExclamationCircleOutlined),
    content: `将为 ${shortageItems.length} 种缺口物料生成采购申请单，确认继续？`,
    async onOk() {
      generateLoading.value = true
      try {
        const res = await generatePurchaseReq({
          mfg_bom_number: selectedBomId.value,
          planned_quantity: plannedQuantity.value,
          items: shortageItems.map(item => ({
            material_number: item.material_number,
            material_name: item.material_name,
            unit: item.unit,
            shortage_quantity: item.shortage
          }))
        })
        message.success(res.data?.message || '采购申请单已生成')
        selectedRowKeys.value = []
      } catch (err: any) {
        message.error(err.response?.data?.message || '生成失败')
      }
      generateLoading.value = false
    }
  })
}

const columns = [
  { title: '物料编号', dataIndex: 'material_number', width: 140 },
  { title: '物料名称', dataIndex: 'material_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'unit', width: 70 },
  { title: 'BOM用量', dataIndex: 'bom_quantity', width: 100, align: 'right' as const },
  { title: '需求数量', dataIndex: 'required_quantity', width: 110, align: 'right' as const },
  { title: '可用库存', dataIndex: 'available_stock', width: 110, align: 'right' as const },
  { title: '缺口数量', dataIndex: 'shortage', width: 110, align: 'right' as const },
  { title: 'BOM路径', dataIndex: 'bom_path', ellipsis: true }
]
</script>

<template>
  <div style="padding: 16px;">
    <a-card title="采购需求报表" size="small">
      <template #extra>
        <a-space>
          <a-button
            type="primary"
            :icon="h(ShoppingCartOutlined)"
            :loading="generateLoading"
            :disabled="selectedRowKeys.length === 0"
            @click="onGeneratePurchaseReq"
          >
            一键生成采购申请
          </a-button>
        </a-space>
      </template>

      <a-row :gutter="16" style="margin-bottom: 16px;">
        <a-col :span="8">
          <a-form-item label="设计BOM" :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
            <a-select
              v-model:value="selectedBomId"
              show-search
              placeholder="搜索设计BOM编号或物料名称"
              :filter-option="false"
              :loading="bomSearchLoading"
              :options="bomOptions"
              @search="onBomSearch"
              allow-clear
              style="width: 100%"
            />
          </a-form-item>
        </a-col>
        <a-col :span="6">
          <a-form-item label="计划数量" :label-col="{ span: 8 }" :wrapper-col="{ span: 16 }">
            <a-input-number
              v-model:value="plannedQuantity"
              :min="1"
              :precision="0"
              style="width: 100%"
              placeholder="输入计划生产数量"
            />
          </a-form-item>
        </a-col>
        <a-col :span="4">
          <a-space>
            <a-button type="primary" :icon="h(SearchOutlined)" :loading="loading" @click="onRunReport">
              查询需求
            </a-button>
            <a-button :icon="h(ReloadOutlined)" @click="demandData = []; hasResult = false; selectedRowKeys = []">
              重置
            </a-button>
          </a-space>
        </a-col>
      </a-row>

      <a-alert
        v-if="hasResult"
        type="info"
        show-icon
        style="margin-bottom: 12px;"
      >
        <template #message>
          共 {{ demandData.length }} 种物料，
          <span style="color: #f5222d; font-weight: bold;">
            {{ demandData.filter(d => d.shortage > 0).length }}
          </span> 种存在缺口，
          已选 {{ selectedRowKeys.length }} 项
        </template>
      </a-alert>

      <a-table
        :columns="columns"
        :data-source="demandData"
        :loading="loading"
        :pagination="false"
        :scroll="{ y: 500 }"
        size="small"
        bordered
        :row-selection="{
          selectedRowKeys,
          onChange: onSelectChange
        }"
        :row-class-name="(record: any) => record.shortage > 0 ? 'shortage-row' : ''"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'required_quantity'">
            <span style="font-weight: bold;">{{ record.required_quantity }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'shortage'">
            <span :style="{ color: record.shortage > 0 ? '#f5222d' : '#52c41a', fontWeight: 'bold' }">
              {{ record.shortage }}
            </span>
          </template>
          <template v-else-if="column.dataIndex === 'available_stock'">
            <span :style="{ color: (parseFloat(record.available_stock) || 0) === 0 ? '#faad14' : '' }">
              {{ record.available_stock ?? 0 }}
            </span>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<style scoped>
:deep(.shortage-row) {
  background-color: #fff2f0 !important;
}
</style>
