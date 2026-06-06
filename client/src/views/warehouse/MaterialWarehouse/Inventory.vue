<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="物料库存总览" style="padding: 0; margin: 0 0 8px 0;" />

    <!-- 统计卡片 -->
    <a-row :gutter="12" style="margin-bottom:8px;">
      <a-col :span="6"><a-card size="small"><a-statistic title="物料总数" :value="summary.total_items || 0" /></a-card></a-col>
      <a-col :span="6"><a-card size="small"><a-statistic title="仓库数" :value="summary.total_warehouses || 0" /></a-card></a-col>
      <a-col :span="6"><a-card size="small"><a-statistic title="总库存量" :value="summary.total_quantity || 0" :precision="2" /></a-card></a-col>
      <a-col :span="6"><a-card size="small"><a-statistic title="低于安全库存" :value="summary.below_safety_count || 0" :value-style="{ color: (summary.below_safety_count || 0) > 0 ? '#cf1322' : undefined }" /></a-card></a-col>
    </a-row>

    <!-- 筛选 -->
    <a-card :bordered="false" size="small" style="margin-bottom:8px;">
      <a-row :gutter="12" align="middle">
        <a-col :span="4">
          <a-radio-group v-model:value="filterType" button-style="solid" size="small" @change="handleSearch">
            <a-radio-button value="">全部</a-radio-button>
            <a-radio-button value="原材料">原材料</a-radio-button>
            <a-radio-button value="半成品">半成品</a-radio-button>
          </a-radio-group>
        </a-col>
        <a-col :span="4">
          <a-select v-model:value="filterWarehouse" placeholder="全部仓库" allow-clear size="small" style="width:100%;" @change="handleSearch">
            <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">{{ w.warehouse_name }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="6">
          <a-input-search v-model:value="searchText" placeholder="搜索物料编号/名称/规格" enter-button size="small" @search="handleSearch" />
        </a-col>
      </a-row>
    </a-card>

    <!-- 数据表格 -->
    <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" size="small" bordered row-key="id" @change="handleTableChange">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'quantity'">
          <span :style="{ color: record.is_below_safety === 1 ? '#cf1322' : undefined, fontWeight: record.is_below_safety === 1 ? 700 : 400 }">
            {{ record.quantity }}
            <WarningOutlined v-if="record.is_below_safety === 1" style="color:#cf1322;margin-left:4px;" />
          </span>
        </template>
        <template v-if="column.key === 'item_type'">
          <a-tag :color="record.item_type === '原材料' ? 'blue' : 'green'">{{ record.item_type }}</a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="openSafetyModal(record)">安全库存</a-button>
            <a-button type="link" size="small" @click="openAdjustModal(record)">调整</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 安全库存设置弹窗 -->
    <a-modal v-model:open="safetyModalVisible" title="设置安全库存" :width="400" @ok="handleSafetySave" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="物料">{{ safetyForm.item_number }} - {{ safetyForm.item_name }}</a-form-item>
        <a-form-item label="仓库">{{ safetyForm.warehouse_name }}</a-form-item>
        <a-form-item label="当前库存">{{ safetyForm.quantity }}</a-form-item>
        <a-form-item label="安全库存量">
          <a-input-number v-model:value="safetyForm.safety_stock_quantity" :min="0" style="width:100%;" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 库存调整弹窗 -->
    <a-modal v-model:open="adjustModalVisible" title="库存调整" :width="400" @ok="handleAdjustSave" :confirm-loading="saving">
      <a-form layout="vertical">
        <a-form-item label="物料">{{ adjustForm.item_number }} - {{ adjustForm.item_name }}</a-form-item>
        <a-form-item label="仓库">{{ adjustForm.warehouse_name }}</a-form-item>
        <a-form-item label="当前库存">{{ adjustForm.quantity }}</a-form-item>
        <a-form-item label="调整数量 (正数增加, 负数减少)">
          <a-input-number v-model:value="adjustForm.adjust_quantity" style="width:100%;" />
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="adjustForm.remark" placeholder="调整原因" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { WarningOutlined } from '@ant-design/icons-vue'
import { getInventoryList, getWarehouseOptions, updateSafetyStock, adjustInventory } from '@/api/warehouse/materialWarehouse'

const loading = ref(false)
const saving = ref(false)
const dataSource = ref<any[]>([])
const summary = ref<any>({})
const searchText = ref('')
const filterType = ref('')
const filterWarehouse = ref<string | undefined>(undefined)
const warehouseOptions = ref<any[]>([])

const pagination = reactive({ current: 1, pageSize: 10, total: 0, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` })

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150 },
  { title: '类型', key: 'item_type', width: 80 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '库存量', dataIndex: 'quantity', key: 'quantity', width: 100 },
  { title: '安全库存', dataIndex: 'safety_stock_quantity', key: 'safety_stock_quantity', width: 90 },
  { title: '最后更新', dataIndex: 'last_updated', key: 'last_updated', width: 150 },
  { title: '操作', key: 'action', width: 140, fixed: 'right' }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getInventoryList({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, warehouse_number: filterWarehouse.value || '',
      item_type: filterType.value
    })
    dataSource.value = res?.data?.items || []
    pagination.total = res?.data?.total || 0
    summary.value = res?.data?.summary || {}
  } catch { message.error('查询失败') }
  finally { loading.value = false }
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleTableChange = (p: any) => { pagination.current = p.current; pagination.pageSize = p.pageSize; fetchData() }

// 安全库存
const safetyModalVisible = ref(false)
const safetyForm = reactive<any>({ item_number: '', item_name: '', warehouse_number: '', warehouse_name: '', quantity: 0, safety_stock_quantity: 0 })

const openSafetyModal = (record: any) => {
  Object.assign(safetyForm, { item_number: record.item_number, item_name: record.item_name, warehouse_number: record.warehouse_number, warehouse_name: record.warehouse_name, quantity: record.quantity, safety_stock_quantity: record.safety_stock_quantity || 0 })
  safetyModalVisible.value = true
}

const handleSafetySave = async () => {
  saving.value = true
  try {
    await updateSafetyStock({ item_number: safetyForm.item_number, warehouse_number: safetyForm.warehouse_number, safety_stock_quantity: safetyForm.safety_stock_quantity })
    message.success('安全库存设置成功')
    safetyModalVisible.value = false
    fetchData()
  } catch { message.error('设置失败') }
  finally { saving.value = false }
}

// 库存调整
const adjustModalVisible = ref(false)
const adjustForm = reactive<any>({ item_number: '', item_name: '', item_type: '', specifications: '', basic_unit: '', warehouse_number: '', warehouse_name: '', quantity: 0, adjust_quantity: 0, remark: '' })

const openAdjustModal = (record: any) => {
  Object.assign(adjustForm, { item_number: record.item_number, item_name: record.item_name, item_type: record.item_type, specifications: record.specifications, basic_unit: record.basic_unit, warehouse_number: record.warehouse_number, warehouse_name: record.warehouse_name, quantity: record.quantity, adjust_quantity: 0, remark: '' })
  adjustModalVisible.value = true
}

const handleAdjustSave = async () => {
  if (!adjustForm.adjust_quantity || adjustForm.adjust_quantity === 0) { message.warning('调整数量不能为0'); return }
  saving.value = true
  try {
    await adjustInventory(adjustForm)
    message.success('库存调整成功')
    adjustModalVisible.value = false
    fetchData()
  } catch (err: any) { message.error(err?.response?.data?.message || '调整失败') }
  finally { saving.value = false }
}

onMounted(async () => {
  try {
    const res: any = await getWarehouseOptions()
    warehouseOptions.value = res?.data || []
  } catch { /* ignore */ }
  fetchData()
})
</script>
