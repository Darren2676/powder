<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons-vue'
import {
  getMouldBomMappings, createMouldBomMapping, updateMouldBomMapping, deleteMouldBomMapping,
  approveMouldBomMapping, withdrawMouldBomMapping
} from '@/api/master-data/mfgBom'
import { getItems } from '@/api/master-data/itemMaster'
import { getMoulds } from '@/api/equipment/mould'
import { getMfgBomHeaders } from '@/api/master-data/mfgBom'

interface MouldMapping {
  id?: number
  item_number: string
  item_name: string
  mould_number: string
  mould_name: string
  mfg_bom_number: string
  mfg_bom_name: string
  is_default: number
  approval_status?: string
  creation_date?: string
}

const loading = ref(false)
const dataSource = ref<MouldMapping[]>([])
const pagination = reactive({ current: 1, pageSize: 10, total: 0 })
const searchText = ref('')

const modalVisible = ref(false)
const modalLoading = ref(false)
const isEdit = ref(false)
const editId = ref<number | undefined>(undefined)
const form = reactive<MouldMapping>({
  item_number: '',
  item_name: '',
  mould_number: '',
  mould_name: '',
  mfg_bom_number: '',
  mfg_bom_name: '',
  is_default: 0
})

// 产品搜索
const productOptions = ref<any[]>([])
const productSearchLoading = ref(false)
let productSearchTimer: any = null
const handleProductSearch = (searchValue: string) => {
  if (productSearchTimer) clearTimeout(productSearchTimer)
  if (!searchValue) { productOptions.value = []; return }
  productSearchLoading.value = true
  productSearchTimer = setTimeout(async () => {
    try {
      const res = await getItems({ search: searchValue, limit: 20 })
      if (res.success) {
        productOptions.value = (res.data.items || []).map((item: any) => ({
          value: item.item_number,
          label: item.item_number + ' - ' + (item.item_name || ''),
          item
        }))
      }
    } catch { productOptions.value = [] }
    finally { productSearchLoading.value = false }
  }, 300)
}
const handleProductSelect = (value: string, option: any) => {
  const item = option?.item
  if (item) {
    form.item_number = item.item_number
    form.item_name = item.item_name || ''
  }
}
const handleProductChange = (value: string) => {
  if (!value) {
    form.item_number = ''
    form.item_name = ''
  }
}

// 模具搜索
const mouldOptions = ref<any[]>([])
const mouldSearchLoading = ref(false)
let mouldSearchTimer: any = null
const handleMouldSearch = (searchValue: string) => {
  if (mouldSearchTimer) clearTimeout(mouldSearchTimer)
  if (!searchValue) { mouldOptions.value = []; return }
  mouldSearchLoading.value = true
  mouldSearchTimer = setTimeout(async () => {
    try {
      const res = await getMoulds({ search: searchValue, limit: 20 })
      if (res.success) {
        mouldOptions.value = (res.data.items || []).map((m: any) => ({
          value: m.item_number,
          label: m.item_number + ' - ' + (m.item_name || ''),
          item: m
        }))
      }
    } catch { mouldOptions.value = [] }
    finally { mouldSearchLoading.value = false }
  }, 300)
}
const handleMouldSelect = (value: string, option: any) => {
  const md = option?.item
  if (md) {
    form.mould_number = md.item_number
    form.mould_name = md.item_name || ''
  }
}
const handleMouldChange = (value: string) => {
  if (!value) {
    form.mould_number = ''
    form.mould_name = ''
  }
}

// 制造BOM搜索
const bomOptions = ref<any[]>([])
const bomSearchLoading = ref(false)
let bomSearchTimer: any = null
const handleBomSearch = (searchValue: string) => {
  if (bomSearchTimer) clearTimeout(bomSearchTimer)
  if (!searchValue) { bomOptions.value = []; return }
  bomSearchLoading.value = true
  bomSearchTimer = setTimeout(async () => {
    try {
      const res = await getMfgBomHeaders({ search: searchValue, limit: 20 })
      if (res.success) {
        bomOptions.value = (res.data.items || []).map((bom: any) => ({
          value: bom.mfg_bom_number,
          label: bom.mfg_bom_number + ' - ' + (bom.mfg_bom_name || ''),
          item: bom
        }))
      }
    } catch { bomOptions.value = [] }
    finally { bomSearchLoading.value = false }
  }, 300)
}
const handleBomSelect = (value: string, option: any) => {
  const bom = option?.item
  if (bom) {
    form.mfg_bom_number = bom.mfg_bom_number
    form.mfg_bom_name = bom.mfg_bom_name || ''
  }
}
const handleBomChange = (value: string) => {
  if (!value) {
    form.mfg_bom_number = ''
    form.mfg_bom_name = ''
  }
}

const columns = [
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 140 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '模具编号', dataIndex: 'mould_number', key: 'mould_number', width: 140 },
  { title: '模具名称', dataIndex: 'mould_name', key: 'mould_name', width: 160 },
  { title: '制造BOM编号', dataIndex: 'mfg_bom_number', key: 'mfg_bom_number', width: 160 },
  { title: '制造BOM名称', dataIndex: 'mfg_bom_name', key: 'mfg_bom_name', width: 180 },
  { title: '是否默认', dataIndex: 'is_default', key: 'is_default', width: 90 },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getMouldBomMappings({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.pagination?.total || 0
    }
  } catch {
    message.error('获取模具BOM映射失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => { pagination.current = 1; fetchData() }

const resetForm = () => {
  form.item_number = ''
  form.item_name = ''
  form.mould_number = ''
  form.mould_name = ''
  form.mfg_bom_number = ''
  form.mfg_bom_name = ''
  form.is_default = 0
  editId.value = undefined
}

const handleOpenCreate = () => {
  isEdit.value = false
  resetForm()
  modalVisible.value = true
}

const handleOpenEdit = async (record: MouldMapping) => {
  isEdit.value = true
  editId.value = record.id
  form.item_number = record.item_number
  form.item_name = record.item_name || ''
  form.mould_number = record.mould_number
  form.mould_name = record.mould_name || ''
  form.mfg_bom_number = record.mfg_bom_number
  form.mfg_bom_name = record.mfg_bom_name || ''
  form.is_default = record.is_default || 0

  // 预加载选项用于回显
  if (record.item_number) {
    try {
      const res = await getItems({ search: record.item_number, limit: 5 })
      if (res.success) {
        productOptions.value = (res.data.items || []).map((item: any) => ({
          value: item.item_number,
          label: item.item_number + ' - ' + (item.item_name || ''),
          item
        }))
      }
    } catch { productOptions.value = [] }
  }
  if (record.mould_number) {
    try {
      const res = await getMoulds({ search: record.mould_number, limit: 5 })
      if (res.success) {
        mouldOptions.value = (res.data.items || []).map((m: any) => ({
          value: m.item_number,
          label: m.item_number + ' - ' + (m.item_name || ''),
          item: m
        }))
      }
    } catch { mouldOptions.value = [] }
  }
  if (record.mfg_bom_number) {
    try {
      const res = await getMfgBomHeaders({ search: record.mfg_bom_number, limit: 5 })
      if (res.success) {
        bomOptions.value = (res.data.items || []).map((bom: any) => ({
          value: bom.mfg_bom_number,
          label: bom.mfg_bom_number + ' - ' + (bom.mfg_bom_name || ''),
          item: bom
        }))
      }
    } catch { bomOptions.value = [] }
  }

  modalVisible.value = true
}

const handleSubmit = async () => {
  if (!form.item_number || !form.mould_number || !form.mfg_bom_number) {
    message.warning('请填写产品编号、模具编号和制造BOM编号')
    return
  }
  modalLoading.value = true
  try {
    const payload = {
      item_number: form.item_number,
      item_name: form.item_name,
      mould_number: form.mould_number,
      mould_name: form.mould_name,
      mfg_bom_number: form.mfg_bom_number,
      mfg_bom_name: form.mfg_bom_name,
      is_default: form.is_default
    }
    if (isEdit.value && editId.value) {
      const res = await updateMouldBomMapping(editId.value, payload)
      if (res.success) { message.success('更新成功'); modalVisible.value = false; fetchData() }
      else message.error(res.message || '更新失败')
    } else {
      const res = await createMouldBomMapping(payload)
      if (res.success) { message.success('创建成功'); modalVisible.value = false; fetchData() }
      else message.error(res.message || '创建失败')
    }
  } catch {
    message.error('操作失败')
  } finally {
    modalLoading.value = false
  }
}

const handleDelete = (record: MouldMapping) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定删除该模具BOM映射吗？`,
    onOk: async () => {
      if (!record.id) return
      try {
        const res = await deleteMouldBomMapping(record.id)
        if (res.success) { message.success('删除成功'); fetchData() }
        else message.error(res.message || '删除失败')
      } catch { message.error('删除失败') }
    }
  })
}

const handleApprove = async (record: MouldMapping) => {
  if (!record.id) return
  try {
    const res = await approveMouldBomMapping(record.id)
    if (res.success) { message.success('审核成功'); fetchData() }
    else message.error(res.message || '审核失败')
  } catch { message.error('审核失败') }
}

const handleWithdraw = async (record: MouldMapping) => {
  if (!record.id) return
  try {
    const res = await withdrawMouldBomMapping(record.id)
    if (res.success) { message.success('撤销审核成功'); fetchData() }
    else message.error(res.message || '撤销失败')
  } catch { message.error('撤销失败') }
}

const formatDate = (val: string) => {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(fetchData)
</script>

<template>
  <div class="mould-mapping-page">
    <a-card title="模具BOM映射管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索产品/模具/BOM编号"
            style="width: 280px"
            allow-clear
            @search="handleSearch"
          />
          <a-button type="primary" @click="handleOpenCreate">
            <template #icon><PlusOutlined /></template>
            新增映射
          </a-button>
          <a-button @click="fetchData">
            <template #icon><ReloadOutlined /></template>
            刷新
          </a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }"
        @change="handleTableChange"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'is_default'">
            <a-tag v-if="record.is_default" color="blue">默认</a-tag>
            <a-tag v-else color="default">否</a-tag>
          </template>
          <template v-if="column.key === 'approval_status'">
            <a-tag v-if="record.approval_status === '已审核'" color="green">已审核</a-tag>
            <a-tag v-else color="orange">未审核</a-tag>
          </template>
          <template v-if="column.key === 'creation_date'">
            {{ record.creation_date ? formatDate(record.creation_date) : '' }}
          </template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a-button
                v-if="record.approval_status !== '已审核'"
                type="link"
                size="small"
                @click="handleOpenEdit(record)"
              >
                <template #icon><EditOutlined /></template>
                编辑
              </a-button>
              <a-button
                v-if="record.approval_status === '已审核'"
                type="link"
                size="small"
                @click="handleWithdraw(record)"
              >
                撤销
              </a-button>
              <a-button
                v-else
                type="link"
                size="small"
                @click="handleApprove(record)"
              >
                审核
              </a-button>
              <a-button
                v-if="record.approval_status !== '已审核'"
                type="link"
                size="small"
                danger
                @click="handleDelete(record)"
              >
                <template #icon><DeleteOutlined /></template>
                删除
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新增/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑模具BOM映射' : '新增模具BOM映射'"
      :confirm-loading="modalLoading"
      @ok="handleSubmit"
      @cancel="modalVisible = false"
      width="600px"
    >
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" style="margin-top: 16px;">
        <a-form-item label="产品编号" required>
          <a-auto-complete
            v-model:value="form.item_number"
            :options="productOptions"
            placeholder="输入产品编号或名称模糊搜索"
            allow-clear
            @search="handleProductSearch"
            @select="handleProductSelect"
            @change="handleProductChange"
          >
            <template v-if="productSearchLoading" #notFoundContent>
              <a-spin size="small" />
            </template>
          </a-auto-complete>
        </a-form-item>
        <a-form-item label="模具编号" required>
          <a-auto-complete
            v-model:value="form.mould_number"
            :options="mouldOptions"
            placeholder="输入模具编号或名称模糊搜索"
            allow-clear
            @search="handleMouldSearch"
            @select="handleMouldSelect"
            @change="handleMouldChange"
          >
            <template v-if="mouldSearchLoading" #notFoundContent>
              <a-spin size="small" />
            </template>
          </a-auto-complete>
        </a-form-item>
        <a-form-item label="模具名称">
          <a-input v-model:value="form.mould_name" placeholder="选择模具编号后自动带入" disabled />
        </a-form-item>
        <a-form-item label="制造BOM编号" required>
          <a-auto-complete
            v-model:value="form.mfg_bom_number"
            :options="bomOptions"
            placeholder="输入BOM编号或名称模糊搜索"
            allow-clear
            @search="handleBomSearch"
            @select="handleBomSelect"
            @change="handleBomChange"
          >
            <template v-if="bomSearchLoading" #notFoundContent>
              <a-spin size="small" />
            </template>
          </a-auto-complete>
        </a-form-item>
        <a-form-item label="是否默认">
          <a-radio-group v-model:value="form.is_default">
            <a-radio :value="1">是</a-radio>
            <a-radio :value="0">否</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.mould-mapping-page {
  padding: 16px;
}
</style>
