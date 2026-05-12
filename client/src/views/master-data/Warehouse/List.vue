<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, EyeOutlined, UserAddOutlined, MinusCircleOutlined, DownOutlined
} from '@ant-design/icons-vue'
import { getWarehouses, getWarehouseDetail, createWarehouse, updateWarehouse, deleteWarehouse, exportWarehouses, importWarehouses, addWarehouseManager, removeWarehouseManager, approveWarehouse, withdrawWarehouse } from '@/api/master-data/warehouse'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import dayjs from 'dayjs'
import { APPROVAL_STATUS, CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

defineOptions({ name: 'WarehouseList' })

interface Manager {
  id?: number
  manager_name: string
  created_at?: string
}

interface Warehouse {
  warehouse_number?: string
  warehouse_name: string
  warehouse_type: string
  condition: string
  supplier_number: string
  customer_number: string
  enable_location: string
  default_location: string
  is_system_warehouse: string
  is_in_balance: string
  remark: string
  creation_date: string
  creation_man: string
  last_updater: string
  last_updated_at: string
  managers?: Manager[]
}

const emptyForm = (): Warehouse => ({
  warehouse_number: undefined,
  warehouse_name: '',
  warehouse_type: '',
  condition: CONDITION_STATUS.ENABLED,
  supplier_number: '',
  customer_number: '',
  enable_location: '否',
  default_location: '',
  is_system_warehouse: '否',
  is_in_balance: '是',
  remark: '',
  creation_date: '',
  creation_man: '',
  last_updater: '',
  last_updated_at: '',
  managers: []
})

const { loading, dataSource, searchText, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList<Warehouse>(getWarehouses)

const { modalStyle, onDragStart, resetDrag } = useModalDrag()
const { modalStyle: editModalStyle, onDragStart: editOnDragStart, resetDrag: editResetDrag } = useModalDrag()

const editModalVisible = ref(false)
const createModalVisible = ref(false)
const detailModalVisible = ref(false)
const editForm = reactive<Warehouse>(emptyForm())
const createForm = reactive<Warehouse>(emptyForm())
const detailData = ref<Warehouse>(emptyForm())
const fileInputRef = ref<HTMLInputElement>()

// 新建仓库时的负责人列表
const createManagers = ref<{ manager_name: string }[]>([])
const editManagers = ref<Manager[]>([])
// 添加负责人弹窗
const addManagerVisible = ref(false)
const addManagerName = ref('')
const addManagerWarehouse = ref('')

const columns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '仓库编号', dataIndex: 'warehouse_number', key: 'warehouse_number', width: 100 },
  { title: '仓库名称', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '仓库类型', dataIndex: 'warehouse_type', key: 'warehouse_type', width: 100 },
  { title: '启用状态', dataIndex: 'condition', key: 'condition', width: 90 },
  { title: '供应商编号', dataIndex: 'supplier_number', key: 'supplier_number', width: 100 },
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 100 },
  { title: '启用库位', dataIndex: 'enable_location', key: 'enable_location', width: 90 },
  { title: '默认库位', dataIndex: 'default_location', key: 'default_location', width: 90 },
  { title: '系统仓库', dataIndex: 'is_system_warehouse', key: 'is_system_warehouse', width: 90 },
  { title: '参与结存', dataIndex: 'is_in_balance', key: 'is_in_balance', width: 90 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90 },
  { title: '创建时间', dataIndex: 'creation_date', key: 'creation_date', width: 160 },
  { title: '最后更新人', dataIndex: 'last_updater', key: 'last_updater', width: 100 },
  { title: '最后更新时间', dataIndex: 'last_updated_at', key: 'last_updated_at', width: 160 },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const }
]

const managerColumns = [
  { title: '序号', key: 'rowIndex', width: 60 },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
  { title: '仓库负责人', dataIndex: 'manager_name', key: 'manager_name', width: 150 },
  { title: '操作', key: 'action', width: 100 }
]

const formatDateTime = (val: string) => {
  if (!val) return '-'
  return dayjs(val).format('YYYY-MM-DD HH:mm:ss')
}

const handleDetail = async (record: Warehouse) => {
  try {
    const res = await getWarehouseDetail(record.warehouse_number!)
    detailData.value = res.data
    resetDrag()
    detailModalVisible.value = true
  } catch { message.error('获取详情失败') }
}

const handleEdit = async (record: Warehouse) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许编辑，请先撤消审核')
    return
  }
  try {
    const res = await getWarehouseDetail(record.warehouse_number!)
    Object.assign(editForm, { ...emptyForm(), ...res.data })
    editManagers.value = res.data.managers || []
    editResetDrag()
    editModalVisible.value = true
  } catch { message.error('获取数据失败') }
}

const handleDelete = (record: Warehouse) => {
  if (((record as any).approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
    message.warning('已审核的记录不允许删除，请先撤消审核')
    return
  }
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除仓库"${record.warehouse_name || record.warehouse_number}"吗？`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteWarehouse(record.warehouse_number!); message.success('删除成功'); fetchData() }
      catch { message.error('删除失败') }
    }
  })
}

const handleEditOk = async () => {
  if (!editForm.warehouse_number) { message.warning('仓库编号不能为空'); return }
  try {
    await updateWarehouse(editForm.warehouse_number!, { ...editForm, managers: editManagers.value })
    message.success('更新成功'); editModalVisible.value = false; fetchData()
  } catch { message.error('更新失败') }
}

const handleCreateOk = async () => {
  if (!createForm.warehouse_number) { message.warning('仓库编号不能为空'); return }
  try {
    await createWarehouse({ ...createForm, managers: createManagers.value })
    message.success('创建成功'); createModalVisible.value = false
    Object.assign(createForm, emptyForm()); createManagers.value = []; fetchData()
  } catch { message.error('创建失败') }
}

// 新建表单中的负责人操作
const addCreateManager = () => { createManagers.value.push({ manager_name: '' }) }
const removeCreateManager = (idx: number) => { createManagers.value.splice(idx, 1) }

// 编辑表单中的负责人操作
const addEditManager = () => { editManagers.value.push({ manager_name: '' }) }
const removeEditManager = (idx: number) => { editManagers.value.splice(idx, 1) }

// 详情页添加负责人
const handleAddManagerToDetail = () => {
  addManagerWarehouse.value = detailData.value.warehouse_number || ''
  addManagerName.value = ''
  addManagerVisible.value = true
}
const confirmAddManager = async () => {
  if (!addManagerName.value) { message.warning('请输入负责人姓名'); return }
  try {
    await addWarehouseManager(addManagerWarehouse.value, { manager_name: addManagerName.value })
    message.success('添加成功'); addManagerVisible.value = false
    // 刷新详情
    const res = await getWarehouseDetail(addManagerWarehouse.value)
    detailData.value = res.data
  } catch { message.error('添加失败') }
}
const handleRemoveManager = (manager: Manager) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要移除负责人"${manager.manager_name}"吗？`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await removeWarehouseManager(manager.id!)
        message.success('移除成功')
        const res = await getWarehouseDetail(detailData.value.warehouse_number!)
        detailData.value = res.data
      } catch { message.error('移除失败') }
    }
  })
}

const handleExport = async (format: string = 'xlsx') => {
  try {
    const res = await exportWarehouses(format)
    const ext = format === 'xls' ? 'xls' : 'xlsx'
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('warehouses', ext); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try { const formData = new FormData(); formData.append('file', file); await importWarehouses(formData); message.success('导入成功'); fetchData() }
  catch { message.error('导入失败') } finally { target.value = '' }
}

// 审核
const handleApprove = async (record: any) => {
  try {
    const res: any = await approveWarehouse(record.warehouse_number!)
    if (res.success) { message.success('审核成功'); fetchData() }
    else { message.error(res.message || '审核失败') }
  } catch { message.error('审核失败') }
}

// 撤消审核
const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消仓库「${(record.warehouse_name || '').trim()}」的审核吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawWarehouse(record.warehouse_number!)
        if (res.success) { message.success('已撤消审核'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch { message.error('撤消失败') }
    }
  })
}

onMounted(() => { fetchData() })
</script>

<template>
  <div>
    <a-card title="仓库管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索仓库编号/名称" style="width: 220px" @search="handleSearch" />
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-dropdown>
            <a-button><template #icon><DownloadOutlined /></template>导出</a-button>
            <template #overlay>
              <a-menu @click="({ key }: any) => handleExport(key)">
                <a-menu-item key="xlsx">导出为 xlsx</a-menu-item>
                <a-menu-item key="xls">导出为 xls</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button type="primary" @click="createModalVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>
      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :row-key="(record: Warehouse) => record.warehouse_number!" :pagination="pagination" :scroll="{ x: 2000, y: 'calc(100vh - 280px)' }" @change="handleTableChange" size="small">
        <template #bodyCell="{ column, index, record }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'condition'">
            <a-tag :color="(record.condition || '').trim() === CONDITION_STATUS.ENABLED ? 'green' : 'red'">{{ (record.condition || '').trim() || '-' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'last_updated_at'">{{ formatDateTime(record.last_updated_at) }}</template>
          <template v-else-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === APPROVAL_STATUS.APPROVED ? 'blue' : 'default'">{{ (record.approval_status || '').trim() || APPROVAL_STATUS.UNAPPROVED }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleDetail(record)">
                查看
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== APPROVAL_STATUS.APPROVED" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-item @click="handleEdit(record)">编辑</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item @click="handleDelete(record)">
                      <span style="color: #ff4d4f">删除</span>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 详情弹窗 -->
    <a-modal v-model:open="detailModalVisible" :footer="null" width="800px" :style="modalStyle">
      <template #title>
        <div class="drag-handle" @mousedown="onDragStart">仓库详情</div>
      </template>
      <a-descriptions bordered :column="3" size="small" style="margin-bottom: 16px;">
        <a-descriptions-item label="仓库编号">{{ detailData.warehouse_number }}</a-descriptions-item>
        <a-descriptions-item label="仓库名称">{{ detailData.warehouse_name }}</a-descriptions-item>
        <a-descriptions-item label="备注">{{ detailData.remark || '-' }}</a-descriptions-item>
        <a-descriptions-item label="仓库类型">
          <a-tag v-if="detailData.warehouse_type" color="blue">{{ detailData.warehouse_type }}</a-tag>
          <span v-else>-</span>
        </a-descriptions-item>
        <a-descriptions-item label="启用状态">
          <a-tag :color="(detailData.condition || '').trim() === CONDITION_STATUS.ENABLED ? 'green' : 'red'">{{ (detailData.condition || '').trim() || '-' }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="">-</a-descriptions-item>
        <a-descriptions-item label="供应商编号">{{ detailData.supplier_number || '-' }}</a-descriptions-item>
        <a-descriptions-item label="启用库位">{{ detailData.enable_location || '否' }}</a-descriptions-item>
        <a-descriptions-item label="客户编号">{{ detailData.customer_number || '-' }}</a-descriptions-item>
        <a-descriptions-item label="是否系统仓库">{{ detailData.is_system_warehouse || '否' }}</a-descriptions-item>
        <a-descriptions-item label="是否参与结存">{{ detailData.is_in_balance || '是' }}</a-descriptions-item>
        <a-descriptions-item label="默认库位">{{ detailData.default_location || '-' }}</a-descriptions-item>
        <a-descriptions-item label="创建人">{{ detailData.creation_man || '-' }}</a-descriptions-item>
        <a-descriptions-item label="创建时间">{{ detailData.creation_date || '-' }}</a-descriptions-item>
        <a-descriptions-item label="">-</a-descriptions-item>
        <a-descriptions-item label="最后更新人">{{ detailData.last_updater || '-' }}</a-descriptions-item>
        <a-descriptions-item label="最后更新时间">{{ formatDateTime(detailData.last_updated_at) }}</a-descriptions-item>
        <a-descriptions-item label="">-</a-descriptions-item>
      </a-descriptions>

      <a-divider orientation="left">仓库负责人</a-divider>
      <div style="margin-bottom: 12px;">
        <a-button type="primary" size="small" @click="handleAddManagerToDetail"><template #icon><UserAddOutlined /></template>添加负责人</a-button>
      </div>
      <a-table :columns="managerColumns" :data-source="detailData.managers || []" :row-key="(r: Manager) => r.id!" :pagination="false" size="small">
        <template #bodyCell="{ column, index, record }">
          <template v-if="column.key === 'rowIndex'">{{ index + 1 }}</template>
          <template v-else-if="column.key === 'created_at'">{{ formatDateTime(record.created_at) }}</template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" danger size="small" @click="handleRemoveManager(record)"><template #icon><DeleteOutlined /></template>删除</a-button>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 添加负责人弹窗 -->
    <a-modal v-model:open="addManagerVisible" title="添加仓库负责人" @ok="confirmAddManager" okText="确认" cancelText="取消" width="400px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="负责人姓名" required><a-input v-model:value="addManagerName" placeholder="请输入负责人姓名" /></a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" @ok="handleEditOk" okText="确认" cancelText="取消" width="700px" :style="editModalStyle">
      <template #title>
        <div class="drag-handle" @mousedown="editOnDragStart">编辑仓库</div>
      </template>
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="仓库编号"><a-input v-model:value="editForm.warehouse_number" disabled /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="仓库名称"><a-input v-model:value="editForm.warehouse_name" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="仓库类型">
              <a-select v-model:value="editForm.warehouse_type" allow-clear placeholder="请选择">
                <a-select-option value="普通仓库">普通仓库</a-select-option>
                <a-select-option value="线边仓库">线边仓库</a-select-option>
                <a-select-option value="报废仓库">报废仓库</a-select-option>
                <a-select-option value="待检仓库">待检仓库</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="启用状态" required>
              <a-select v-model:value="editForm.condition" placeholder="请选择">
                <a-select-option :value="CONDITION_STATUS.ENABLED">启用</a-select-option>
                <a-select-option :value="CONDITION_STATUS.DISABLED">禁用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="供应商编号"><a-input v-model:value="editForm.supplier_number" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="客户编号"><a-input v-model:value="editForm.customer_number" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="启用库位">
              <a-select v-model:value="editForm.enable_location"><a-select-option value="是">是</a-select-option><a-select-option value="否">否</a-select-option></a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="默认库位"><a-input v-model:value="editForm.default_location" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="系统仓库">
              <a-select v-model:value="editForm.is_system_warehouse"><a-select-option value="是">是</a-select-option><a-select-option value="否">否</a-select-option></a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="参与结存">
              <a-select v-model:value="editForm.is_in_balance"><a-select-option value="是">是</a-select-option><a-select-option value="否">否</a-select-option></a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }"><a-textarea v-model:value="editForm.remark" :rows="2" /></a-form-item>
        <a-divider orientation="left" style="font-size: 13px;">仓库负责人</a-divider>
        <div v-for="(m, idx) in editManagers" :key="idx" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center; padding-left: 40px;">
          <a-input v-model:value="m.manager_name" placeholder="负责人姓名" style="flex: 1;" />
          <a-button type="link" danger size="small" @click="removeEditManager(idx)"><MinusCircleOutlined /></a-button>
        </div>
        <div style="padding-left: 40px; margin-bottom: 8px;">
          <a-button type="dashed" size="small" @click="addEditManager"><template #icon><PlusOutlined /></template>添加负责人</a-button>
        </div>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建仓库" @ok="handleCreateOk" okText="确认" cancelText="取消" width="700px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="仓库编号" required><a-input v-model:value="createForm.warehouse_number" placeholder="请输入仓库编号" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="仓库名称"><a-input v-model:value="createForm.warehouse_name" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="仓库类型">
              <a-select v-model:value="createForm.warehouse_type" allow-clear placeholder="请选择">
                <a-select-option value="普通仓库">普通仓库</a-select-option>
                <a-select-option value="线边仓库">线边仓库</a-select-option>
                <a-select-option value="报废仓库">报废仓库</a-select-option>
                <a-select-option value="待检仓库">待检仓库</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="启用状态" required>
              <a-select v-model:value="createForm.condition" placeholder="请选择">
                <a-select-option :value="CONDITION_STATUS.ENABLED">启用</a-select-option>
                <a-select-option :value="CONDITION_STATUS.DISABLED">禁用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="供应商编号"><a-input v-model:value="createForm.supplier_number" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="客户编号"><a-input v-model:value="createForm.customer_number" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="启用库位">
              <a-select v-model:value="createForm.enable_location"><a-select-option value="是">是</a-select-option><a-select-option value="否">否</a-select-option></a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="默认库位"><a-input v-model:value="createForm.default_location" /></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="系统仓库">
              <a-select v-model:value="createForm.is_system_warehouse"><a-select-option value="是">是</a-select-option><a-select-option value="否">否</a-select-option></a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="参与结存">
              <a-select v-model:value="createForm.is_in_balance"><a-select-option value="是">是</a-select-option><a-select-option value="否">否</a-select-option></a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }"><a-textarea v-model:value="createForm.remark" :rows="2" /></a-form-item>
        <a-divider orientation="left" style="font-size: 13px;">仓库负责人</a-divider>
        <div v-for="(m, idx) in createManagers" :key="idx" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center; padding-left: 40px;">
          <a-input v-model:value="m.manager_name" placeholder="负责人姓名" style="flex: 1;" />
          <a-button type="link" danger size="small" @click="removeCreateManager(idx)"><MinusCircleOutlined /></a-button>
        </div>
        <div style="padding-left: 40px; margin-bottom: 8px;">
          <a-button type="dashed" size="small" @click="addCreateManager"><template #icon><PlusOutlined /></template>添加负责人</a-button>
        </div>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
:deep(.ant-card-extra) { padding: 0; }
:deep(.ant-descriptions-item-label) { font-weight: 500; white-space: nowrap; }
.drag-handle { cursor: move; user-select: none; }
</style>
