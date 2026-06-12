<script setup lang="ts">
import { ref, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, PlusOutlined, ExclamationCircleOutlined, SettingOutlined } from '@ant-design/icons-vue'
import {
  getProductLabelSchemes,
  deleteProductLabelScheme,
} from '@/api/master-data/labelTemplate'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import FormModal from './FormModal.vue'

const { loading, dataSource, searchText, selectedRowKeys, pagination, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getProductLabelSchemes)

const defaultDataColumns: any[] = [
  { title: '方案名称', dataIndex: 'scheme_name', key: 'scheme_name', width: 180, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 180, resizable: true },
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 120, resizable: true,
    customRender: ({ text }: any) => text || '(默认)'
  },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160, resizable: true },
  { title: '标签模板', dataIndex: 'template_name', key: 'template_name', width: 160, resizable: true },
  { title: '默认方案', dataIndex: 'is_default', key: 'is_default', width: 80, resizable: true,
    customRender: ({ text }: any) => text === '是' ? '是' : '-'
  },
  { title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80, resizable: true,
    customRender: ({ text }: any) => text === '是' ? '启用' : '停用'
  },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 160, resizable: true },
  { title: '工厂', dataIndex: 'factory_name', key: 'factory_name', width: 100, resizable: true },
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('product_label_scheme_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 180, fixed: 'right' as const }]
})

// ==================== 新增/编辑弹窗 ====================
const formVisible = ref(false)
const editingId = ref<number | null>(null)

const handleCreate = () => {
  editingId.value = null
  formVisible.value = true
}

const handleEdit = (record: any) => {
  editingId.value = record.id
  formVisible.value = true
}

const handleFormOk = () => {
  formVisible.value = false
  fetchData()
}

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除标签方案「${record.scheme_name}」吗？`,
    okText: '确定',
    cancelText: '取消',
    onOk: async () => {
      try {
        await deleteProductLabelScheme(record.id)
        message.success('删除成功')
        fetchData()
      } catch (e: any) {
        message.error(e?.response?.data?.message || '删除失败')
      }
    }
  })
}

onMounted(() => {
  loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div class="page-wrapper">
    <div class="toolbar-inline">
      <span class="toolbar-title">产品标签方案</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <a-input-search v-model:value="searchText" placeholder="搜索方案名称/产品/客户" @search="handleSearch" style="width:260px" allow-clear @change="(e: any) => !e.target.value && handleReset()" />
        <a-button type="primary" @click="handleCreate"><PlusOutlined />新增</a-button>
        <a-button @click="() => fetchData()"><ReloadOutlined />刷新</a-button>
        <a-button @click="openColumnSetting"><SettingOutlined />列设置</a-button>
      </div>
    </div>

    <a-card :bordered="false" style="margin-top:8px">
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :row-key="(r: any) => r.id"
        :pagination="pagination"
        :row-selection="rowSelection"
        @change="handleTableChange"
        :scroll="{ x: 1600 }"
        size="small"
        bordered
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-if="column.key === 'action'">
            <a @click="handleEdit(record)">编辑</a>
            <a-divider type="vertical" />
            <a-popconfirm title="确定删除？" @confirm="handleDelete(record)">
              <a class="danger-link">删除</a>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <FormModal v-model:open="formVisible" :editing-id="editingId" @ok="handleFormOk" />

    <ColumnSettingDrawer
      v-model:visible="columnSettingVisible"
      :column-list="columnSettingList"
      :saving="columnSettingSaving"
      @move-up="moveColumnUp"
      @move-down="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
.page-wrapper { padding: 0; }
.toolbar-inline { display:flex;justify-content:space-between;align-items:center;padding:0 0 8px 0; }
.toolbar-title { font-size:16px;font-weight:600;color:#1d2129; }
.danger-link { color:#ff4d4f; }
</style>
