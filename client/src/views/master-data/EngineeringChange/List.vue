<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, EyeOutlined,
  ExclamationCircleOutlined, SettingOutlined, DownOutlined,
} from '@ant-design/icons-vue'
import {
  getLifecycles, createLifecycle, deleteLifecycle, updateLifecycleStatus,
} from '@/api/master-data/engineeringChange'
import { getItems } from '@/api/master-data/itemMaster'
import { getCustomers } from '@/api/master-data/customer'
import { getSampleRequests } from '@/api/sales/sampleRequest'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'

defineOptions({ name: 'EngineeringChangeList' })

const router = useRouter()

const LIFECYCLE_STATUS_OPTIONS = ['进行中', '已完成', '已关闭']

interface Lifecycle {
  id?: number
  product_number: string
  product_name?: string
  customer_number?: string
  customer_name?: string
  origin_sample_request_no?: string
  sample_pass_date?: string
  lifecycle_status?: string
  latest_change_type?: string
  latest_change_at?: string
  change_count?: number
  remark?: string
}

const filterStatus = ref<string | undefined>(undefined)
const filterCustomer = ref<string | undefined>(undefined)

const fetchListWrapper = (params: any) => {
  const merged: any = { ...params }
  if (filterStatus.value) merged.status = filterStatus.value
  if (filterCustomer.value) merged.customer_number = filterCustomer.value
  return getLifecycles(merged)
}

const {
  loading, dataSource, searchText, pagination, fetchData,
  handleTableChange, handleSearch, handleReset,
} = useTableList<Lifecycle>(fetchListWrapper)

// 下拉选项
const productOptions = ref<{ label: string; value: string; name?: string }[]>([])
const customerOptions = ref<{ label: string; value: string; name?: string }[]>([])
const sampleRequestOptions = ref<{ label: string; value: string; customer?: string }[]>([])

const fetchProducts = async () => {
  try {
    const res: any = await getItems({ page: 1, limit: 9999 })
    const list = res?.data?.items || []
    productOptions.value = list
      .filter((x: any) => x.item_number)
      .map((x: any) => ({
        label: `${x.item_number}${x.item_name ? ' - ' + x.item_name : ''}`,
        value: x.item_number,
        name: x.item_name || '',
      }))
  } catch {}
}

const fetchCustomers = async () => {
  try {
    const res: any = await getCustomers({ page: 1, limit: 9999 })
    const list = res?.data?.items || []
    customerOptions.value = list
      .filter((x: any) => x.customer_number)
      .map((x: any) => ({
        label: `${x.customer_number}${x.customer_name ? ' - ' + x.customer_name : ''}`,
        value: x.customer_number,
        name: x.customer_name || '',
      }))
  } catch {}
}

const fetchSampleRequests = async () => {
  try {
    const res: any = await getSampleRequests({ page: 1, limit: 9999 })
    const list = res?.data?.items || []
    sampleRequestOptions.value = list.map((x: any) => ({
      label: `${x.request_number}${x.customer_name ? ' - ' + x.customer_name : ''}`,
      value: x.request_number,
      customer: x.customer_name || '',
    }))
  } catch {}
}

// 列定义
const defaultDataColumns: any[] = [
  { title: '产品编号', dataIndex: 'product_number', key: 'product_number', width: 140, resizable: true },
  { title: '产品名称', dataIndex: 'product_name', key: 'product_name', width: 200, resizable: true },
  { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 180, resizable: true },
  { title: '起源样品单号', dataIndex: 'origin_sample_request_no', key: 'origin_sample_request_no', width: 160, resizable: true },
  { title: '样件通过日期', dataIndex: 'sample_pass_date', key: 'sample_pass_date', width: 130, resizable: true },
  { title: '当前状态', dataIndex: 'lifecycle_status', key: 'lifecycle_status', width: 110, resizable: true },
  { title: '最近变更类型', dataIndex: 'latest_change_type', key: 'latest_change_type', width: 140, resizable: true },
  { title: '最近变更时间', dataIndex: 'latest_change_at', key: 'latest_change_at', width: 170, resizable: true },
  { title: '变更次数', dataIndex: 'change_count', key: 'change_count', width: 90, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 200, resizable: true },
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting,
  resetColumnSetting, loadColumnPreference, handleResizeColumn,
} = useColumnPreference('engineering_change_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 200, fixed: 'right' as const }],
})

// 新建弹窗
const createModalVisible = ref(false)
const createForm = reactive({
  product_number: '',
  product_name: '',
  customer_number: '',
  customer_name: '',
  origin_sample_request_no: '',
  sample_pass_date: '',
  remark: '',
})

const resetCreateForm = () => {
  Object.assign(createForm, {
    product_number: '', product_name: '', customer_number: '', customer_name: '',
    origin_sample_request_no: '', sample_pass_date: '', remark: '',
  })
}

const handleProductChange = (val: string) => {
  createForm.product_number = val
  const found = productOptions.value.find((x) => x.value === val)
  createForm.product_name = found?.name || ''
}

const handleCustomerChange = (val: string) => {
  createForm.customer_number = val
  const found = customerOptions.value.find((x) => x.value === val)
  createForm.customer_name = found?.name || ''
}

const handleSampleRequestChange = (val: string) => {
  createForm.origin_sample_request_no = val
  const found = sampleRequestOptions.value.find((x) => x.value === val)
  if (found?.customer && !createForm.customer_name) {
    createForm.customer_name = found.customer
  }
}

const handleCreateOk = async () => {
  if (!createForm.product_number) { message.error('请选择产品'); return }
  try {
    const res: any = await createLifecycle({ ...createForm })
    if (res?.success) {
      if (res.data?.existed) {
        message.warning(res.message || '该产品已存在生命周期记录')
      } else {
        message.success('创建成功')
      }
      createModalVisible.value = false
      resetCreateForm()
      // 跳转到详情页
      if (res.data?.id) {
        try { await router.push(`/engineering-changes/${res.data.id}`) } catch { fetchData() }
      } else {
        fetchData()
      }
    } else {
      message.error(res?.message || '创建失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '创建失败')
  }
}

const handleView = (record: Lifecycle) => {
  router.push(`/engineering-changes/${record.id}`)
}

const handleStatusChange = (record: Lifecycle, target: string) => {
  if (record.lifecycle_status === target) return
  Modal.confirm({
    title: '确认变更状态',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定将"${record.product_number}"状态更新为「${target}」？`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await updateLifecycleStatus(record.id!, target)
        if (res?.success) { message.success('状态更新成功'); fetchData() }
        else { message.error(res?.message || '更新失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '更新失败')
      }
    },
  })
}

const handleDelete = (record: Lifecycle) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除产品"${record.product_number}"的生命周期记录吗？仅当无变更日志时可删除。`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await deleteLifecycle(record.id!)
        if (res?.success) { message.success('删除成功'); fetchData() }
        else { message.error(res?.message || '删除失败') }
      } catch (err: any) {
        message.error(err?.response?.data?.message || '删除失败')
      }
    },
  })
}

const statusColor = (s?: string) => {
  if (s === '进行中') return 'processing'
  if (s === '已完成') return 'success'
  if (s === '已关闭') return 'default'
  return 'default'
}

onMounted(() => {
  loadColumnPreference()
  fetchData()
  fetchProducts()
  fetchCustomers()
  fetchSampleRequests()
})
</script>

<template>
  <div>
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">工程更改</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-input
            v-model:value="searchText" placeholder="产品编号/名称/客户" allow-clear
            style="width: 220px" @pressEnter="handleSearch"
          />
          <a-select
            v-model:value="filterStatus" placeholder="状态" allow-clear
            style="width: 130px" @change="handleSearch"
          >
            <a-select-option v-for="s in LIFECYCLE_STATUS_OPTIONS" :key="s" :value="s">{{ s }}</a-select-option>
          </a-select>
          <a-select
            v-model:value="filterCustomer" placeholder="客户" allow-clear show-search
            style="width: 200px" :options="customerOptions"
            :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
            @change="handleSearch"
          />
          <a-button type="primary" @click="handleSearch">
            <template #icon><SearchOutlined /></template>搜索
          </a-button>
          <a-button @click="handleReset">
            <template #icon><ReloadOutlined /></template>重置
          </a-button>
          <a-button @click="openColumnSetting">
            <template #icon><SettingOutlined /></template>列设置
          </a-button>
          <a-button type="primary" @click="createModalVisible = true">
            <template #icon><PlusOutlined /></template>新建
          </a-button>
        </div>
      </div>

      <a-table
        :columns="columns" :data-source="dataSource" :loading="loading"
        :row-key="(record: Lifecycle) => record.id!"
        :pagination="pagination" :scroll="{ x: 'max-content' }"
        @change="handleTableChange" @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'lifecycle_status'">
            <a-tag :color="statusColor(record.lifecycle_status)">{{ record.lifecycle_status || '-' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'latest_change_at'">
            {{ record.latest_change_at ? String(record.latest_change_at).slice(0, 19).replace('T', ' ') : '-' }}
          </template>
          <template v-else-if="column.key === 'sample_pass_date'">
            {{ record.sample_pass_date ? String(record.sample_pass_date).slice(0, 10) : '-' }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleView(record)">
                <template #icon><EyeOutlined /></template>查看
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="record.lifecycle_status !== '进行中'" @click="handleStatusChange(record, '进行中')">置为：进行中</a-menu-item>
                    <a-menu-item v-if="record.lifecycle_status !== '已完成'" @click="handleStatusChange(record, '已完成')">置为：已完成</a-menu-item>
                    <a-menu-item v-if="record.lifecycle_status !== '已关闭'" @click="handleStatusChange(record, '已关闭')">置为：已关闭</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item @click="handleDelete(record)" danger>删除</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建弹窗 -->
    <a-modal
      v-model:open="createModalVisible" title="新建工程更改记录"
      width="700px" @ok="handleCreateOk" okText="创建" cancelText="取消"
      @cancel="resetCreateForm"
    >
      <a-form :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品" required>
              <a-select
                v-model:value="createForm.product_number" show-search allow-clear placeholder="请选择产品"
                :options="productOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="handleProductChange"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="产品名称">
              <a-input v-model:value="createForm.product_name" disabled />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="客户">
              <a-select
                v-model:value="createForm.customer_number" show-search allow-clear placeholder="请选择客户"
                :options="customerOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="handleCustomerChange"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="客户名称">
              <a-input v-model:value="createForm.customer_name" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="起源样品单号">
              <a-select
                v-model:value="createForm.origin_sample_request_no" show-search allow-clear placeholder="可选"
                :options="sampleRequestOptions"
                :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="handleSampleRequestChange"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="样件通过日期">
              <a-date-picker v-model:value="createForm.sample_pass_date" value-format="YYYY-MM-DD" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24">
            <a-form-item label="备注" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }">
              <a-textarea v-model:value="createForm.remark" :rows="3" placeholder="可选" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
</style>
