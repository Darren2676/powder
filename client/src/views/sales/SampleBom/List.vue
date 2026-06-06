<template>
  <a-card :bordered="false" style="margin:12px 24px">
    <!-- 标题栏 -->
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;overflow-x:auto">
      <span style="font-size:18px;font-weight:600;white-space:nowrap;flex-shrink:0">样件BOM</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap">
        <a-input v-model:value="searchText" placeholder="BOM编号/名称/产品编号" allow-clear style="width:200px" @pressEnter="fetchData" />
        <a-select v-model:value="filterStatus" placeholder="状态" allow-clear style="width:120px" @change="fetchData">
          <a-select-option value="试制中">试制中</a-select-option>
          <a-select-option value="已确定">已确定</a-select-option>
          <a-select-option value="已导入">已导入</a-select-option>
        </a-select>
        <a-button type="primary" @click="fetchData">查询</a-button>
        <a-button @click="handleReset">重置</a-button>
        <a-button type="primary" @click="createVisible = true">创建样件BOM</a-button>
        <a-button @click="designBomModalVisible = true">从设计BOM导入</a-button>
      </div>
    </div>

    <!-- 表格 -->
    <a-table :columns="columns" :data-source="tableData" :loading="loading" row-key="id"
      :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t:number) => `共 ${t} 条` }"
      @change="handleTableChange" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'status'">
          <a-tag :color="record.status === '已导入' ? 'green' : record.status === '已确定' ? 'blue' : 'orange'">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="(record.status || '').trim() !== '已导入'" @click="handleEdit(record)">编辑</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item v-if="(record.status || '').trim() === '试制中'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f">删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 从设计BOM导入弹窗 -->
    <DesignBomSelectModal v-model:open="designBomModalVisible" @select="handleDesignBomSelect" />

    <!-- 从设计BOM导入确认弹窗 -->
    <a-modal v-model:open="importConfirmVisible" title="确认从设计BOM导入" @ok="handleImportFromDesignBom" :confirm-loading="importLoading" width="460px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="设计BOM">{{ selectedDesignBom?.bom_number }}</a-form-item>
        <a-form-item label="样品申请编号" required>
          <a-select v-model:value="importForm.sample_request_number" show-search :filter-option="false" :options="sampleRequestOptions" placeholder="输入编号模糊搜索" :not-found-content="sampleRequestFetching ? undefined : null" @search="handleSampleRequestSearch" style="width:100%">
            <template v-if="sampleRequestFetching" #notFoundContent><a-spin size="small" /></template>
          </a-select>
        </a-form-item>
        <a-form-item label="BOM名称">
          <a-input v-model:value="importForm.bom_name" placeholder="默认取设计BOM名称" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 创建弹窗 -->
    <a-modal v-model:open="createVisible" title="创建样件BOM" @ok="handleCreate" :confirm-loading="createLoading" width="520px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="样品申请编号" required>
          <a-select v-model:value="createForm.sample_request_number" show-search :filter-option="false" :options="sampleRequestOptions" placeholder="输入编号模糊搜索" :not-found-content="sampleRequestFetching ? undefined : null" @search="handleSampleRequestSearch" style="width:100%">
            <template v-if="sampleRequestFetching" #notFoundContent><a-spin size="small" /></template>
          </a-select>
        </a-form-item>
        <a-form-item label="BOM名称">
          <a-input v-model:value="createForm.bom_name" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-input v-model:value="createForm.item_number" />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="createForm.item_name" />
        </a-form-item>
        <a-form-item label="基准用量">
          <a-input-number v-model:value="createForm.base_quantity" :min="0" :precision="4" style="width:100%" />
        </a-form-item>
        <a-form-item label="基准单位">
          <a-select v-model:value="createForm.base_unit" placeholder="请选择单位" show-search :options="unitOptions" :filter-option="filterUnitOption" allow-clear style="width:100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
    <!-- 修改弹窗 -->
    <a-modal v-model:open="editVisible" title="修改样件BOM" @ok="handleEditSubmit" :confirm-loading="editLoading" width="520px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="样件BOM编号">
          <a-input :value="editForm.sample_bom_number" disabled />
        </a-form-item>
        <a-form-item label="样品申请编号">
          <a-input :value="editForm.sample_request_number" disabled />
        </a-form-item>
        <a-form-item label="BOM名称">
          <a-input v-model:value="editForm.bom_name" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-input v-model:value="editForm.item_number" />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="editForm.item_name" />
        </a-form-item>
        <a-form-item label="基准用量">
          <a-input-number v-model:value="editForm.base_quantity" :min="0" :precision="4" style="width:100%" />
        </a-form-item>
        <a-form-item label="基准单位">
          <a-select v-model:value="editForm.base_unit" placeholder="请选择单位" show-search :options="unitOptions" :filter-option="filterUnitOption" allow-clear style="width:100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </a-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined, DownOutlined } from '@ant-design/icons-vue'
import { getSampleBoms, createSampleBom, updateSampleBom, deleteSampleBom, importFromDesignBom } from '@/api/sales/sampleBom'
import { getSampleRequests } from '@/api/sales/sampleRequest'
import { getAllUnits } from '@/api/master-data/unit'
import DesignBomSelectModal from './DesignBomSelectModal.vue'

const router = useRouter()
const searchText = ref('')
const filterStatus = ref<string | undefined>(undefined)
const loading = ref(false)
const tableData = ref<any[]>([])
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const columns = [
  { title: '样件BOM编号', dataIndex: 'sample_bom_number', width: 160 },
  { title: '样品申请编号', dataIndex: 'sample_request_number', width: 160 },
  { title: 'BOM名称', dataIndex: 'bom_name', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', width: 110 },
  { title: '产品名称', dataIndex: 'item_name', width: 120 },
  { title: '当前版本', dataIndex: 'current_version', width: 80 },
  { title: '最终版本', dataIndex: 'final_version', width: 80 },
  { title: '状态', dataIndex: 'status', width: 90 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
]

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getSampleBoms({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value || undefined,
      status: filterStatus.value || undefined,
    })
    tableData.value = res.data.items || []
    pagination.total = res.data.total || 0
  } catch { message.error('获取数据失败') }
  finally { loading.value = false }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleReset = () => {
  searchText.value = ''
  filterStatus.value = undefined
  pagination.current = 1
  fetchData()
}

const handleView = (record: any) => {
  router.push(`/sample-boms/${record.id}`)
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除样件BOM「${(record.sample_bom_number || '').trim()}」吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deleteSampleBom(record.id)
        message.success('删除成功')
        fetchData()
      } catch (e: any) { message.error(e?.response?.data?.message || '删除失败') }
    }
  })
}

// 创建
const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({
  sample_request_number: '', bom_name: '', item_number: '', item_name: '',
  base_quantity: 1, base_unit: '', remark: '',
})

const handleCreate = async () => {
  if (!createForm.sample_request_number) { message.warning('请输入样品申请编号'); return }
  createLoading.value = true
  try {
    await createSampleBom({ ...createForm })
    message.success('创建成功')
    createVisible.value = false
    Object.assign(createForm, { sample_request_number: '', bom_name: '', item_number: '', item_name: '', base_quantity: 1, base_unit: '', remark: '' })
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '创建失败') }
  finally { createLoading.value = false }
}

// 修改
const editVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive({
  id: '', sample_bom_number: '', sample_request_number: '', bom_name: '', item_number: '', item_name: '',
  base_quantity: 1, base_unit: '', remark: '',
})

const handleEdit = (record: any) => {
  Object.assign(editForm, {
    id: record.id, sample_bom_number: record.sample_bom_number, sample_request_number: record.sample_request_number,
    bom_name: record.bom_name || '', item_number: record.item_number || '', item_name: record.item_name || '',
    base_quantity: record.base_quantity || 1, base_unit: record.base_unit || '', remark: record.remark || '',
  })
  editVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    await updateSampleBom(editForm.id, {
      bom_name: editForm.bom_name, item_number: editForm.item_number, item_name: editForm.item_name,
      base_quantity: editForm.base_quantity, base_unit: editForm.base_unit, remark: editForm.remark,
    })
    message.success('修改成功')
    editVisible.value = false
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '修改失败') }
  finally { editLoading.value = false }
}

// 从设计BOM导入
const designBomModalVisible = ref(false)
const importConfirmVisible = ref(false)
const importLoading = ref(false)
const selectedDesignBom = ref<any>(null)
const importForm = reactive({ sample_request_number: '', bom_name: '' })

const handleDesignBomSelect = (record: any) => {
  selectedDesignBom.value = record
  importForm.bom_name = record.bom_name || ''
  importForm.sample_request_number = ''
  importConfirmVisible.value = true
}

const handleImportFromDesignBom = async () => {
  if (!importForm.sample_request_number) { message.warning('请输入样品申请编号'); return }
  importLoading.value = true
  try {
    const res = await importFromDesignBom({
      sample_request_number: importForm.sample_request_number,
      design_bom_number: selectedDesignBom.value.bom_number,
      bom_name: importForm.bom_name || undefined,
    })
    message.success(`从设计BOM导入成功，共 ${res.data?.detail_count || 0} 行明细`)
    importConfirmVisible.value = false
    designBomModalVisible.value = false
    fetchData()
  } catch (e: any) { message.error(e?.response?.data?.message || '导入失败') }
  finally { importLoading.value = false }
}

// 单位下拉选项
const unitOptions = ref<{ label: string; value: string }[]>([])
const loadUnitOptions = async () => {
  try {
    const res = await getAllUnits()
    unitOptions.value = (res.data || []).map((u: any) => ({ label: `${u.unit_name}(${u.unit_code})`, value: u.unit_name }))
  } catch { unitOptions.value = [] }
}
const filterUnitOption = (input: string, option: any) => {
  return option.label?.toLowerCase().includes(input.toLowerCase()) ?? false
}

onMounted(() => { fetchData(); loadUnitOptions() })

// 样品申请编号模糊搜索下拉
const sampleRequestOptions = ref<{ label: string; value: string }[]>([])
const sampleRequestFetching = ref(false)
let sampleRequestSearchTimer: any = null

const handleSampleRequestSearch = (value: string) => {
  if (sampleRequestSearchTimer) clearTimeout(sampleRequestSearchTimer)
  if (!value || value.length < 1) { sampleRequestOptions.value = []; return }
  sampleRequestSearchTimer = setTimeout(async () => {
    sampleRequestFetching.value = true
    try {
      const res = await getSampleRequests({ search: value, approval_status: '已审核', limit: 20 })
      const items = res.data?.items || []
      sampleRequestOptions.value = items.map((r: any) => ({
        label: `${r.request_number} - ${r.customer_name || ''} (${r.approval_status || ''})`,
        value: r.request_number,
      }))
    } catch { sampleRequestOptions.value = [] }
    finally { sampleRequestFetching.value = false }
  }, 300)
}
</script>
