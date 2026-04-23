<template>
  <div class="workflow-list">
    <a-card title="流程定义管理" :bordered="false">
      <!-- Search & Actions -->
      <div class="toolbar">
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索流程名称"
            style="width: 200px"
            @search="handleSearch"
            allow-clear
          />
          <a-select
            v-model:value="filterModule"
            placeholder="选择模块"
            style="width: 150px"
            allow-clear
            @change="handleSearch"
          >
            <a-select-option v-for="m in modules" :key="m.module" :value="m.module">
              {{ m.displayName }}
            </a-select-option>
          </a-select>
          <a-select
            v-model:value="filterStatus"
            placeholder="选择状态"
            style="width: 120px"
            allow-clear
            @change="handleSearch"
          >
            <a-select-option value="draft">草稿</a-select-option>
            <a-select-option value="published">已发布</a-select-option>
            <a-select-option value="deprecated">已停用</a-select-option>
          </a-select>
        </a-space>
        <a-button type="primary" @click="showCreateModal">
          <PlusOutlined /> 新建流程
        </a-button>
      </div>

      <!-- Table -->
      <a-table
        :columns="columns"
        :data-source="definitions"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'module'">
            {{ getModuleName(record.module) }}
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusColors[record.status]">
              {{ statusLabels[record.status] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'created_at'">
            {{ formatDate(record.created_at) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button type="link" size="small" @click="goToDesigner(record.id)">
                <EditOutlined /> 设计
              </a-button>
              <a-button
                v-if="record.status === 'draft'"
                type="link"
                size="small"
                @click="handlePublish(record)"
              >
                <CheckOutlined /> 发布
              </a-button>
              <a-button type="link" size="small" @click="handleCopy(record)">
                <CopyOutlined /> 复制
              </a-button>
              <a-popconfirm
                v-if="record.status === 'draft'"
                title="确定要删除此流程定义吗？"
                @confirm="handleDelete(record.id)"
              >
                <a-button type="link" size="small" danger>
                  <DeleteOutlined /> 删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- Create Modal -->
    <a-modal
      v-model:open="createModalVisible"
      title="新建流程定义"
      @ok="handleCreate"
      :confirm-loading="creating"
    >
      <a-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        layout="vertical"
      >
        <a-form-item label="流程名称" name="name">
          <a-input v-model:value="createForm.name" placeholder="请输入流程名称" />
        </a-form-item>
        <a-form-item label="业务模块" name="module">
          <a-select v-model:value="createForm.module" placeholder="请选择业务模块">
            <a-select-option v-for="m in modules" :key="m.module" :value="m.module">
              {{ m.displayName }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="createForm.description" :rows="3" placeholder="请输入描述（可选）" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import type { FormInstance } from 'ant-design-vue'
import {
  PlusOutlined,
  EditOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined
} from '@ant-design/icons-vue'
import {
  getModules,
  getDefinitions,
  createDefinition,
  publishDefinition,
  copyDefinition,
  deleteDefinition,
  type WorkflowModule,
  type WorkflowDefinition
} from '@/api/system/workflow'

const router = useRouter()

// State

const creating = ref(false)
const definitions = ref<WorkflowDefinition[]>([])
const modules = ref<WorkflowModule[]>([])

const filterModule = ref<string | undefined>(undefined)
const loading = ref(false)
const searchText = ref('')
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
})

const filterStatus = ref<string | undefined>('published')
const createModalVisible = ref(false)
const createFormRef = ref<FormInstance>()

const createForm = reactive({
  name: '',
  module: undefined as string | undefined,
  description: ''
})

const createRules = {
  name: [{ required: true, message: '请输入流程名称' }],
  module: [{ required: true, message: '请选择业务模块' }]
}



// Table columns
const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
  { title: '流程名称', dataIndex: 'name', key: 'name' },
  { title: '业务模块', dataIndex: 'module', key: 'module', width: 150 },
  { title: '版本', dataIndex: 'version', key: 'version', width: 80 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180 },
  { title: '操作', key: 'actions', width: 220 }
]

const statusLabels: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  deprecated: '已停用'
}

const statusColors: Record<string, string> = {
  draft: 'default',
  published: 'green',
  deprecated: 'orange'
}

// Methods
const loadModules = async () => {
  try {
    const res = await getModules()
    console.log('getModules response:', res)
    if (res.success) {
      modules.value = res.data
    } else {
      message.error(res.message || '获取业务模块失败')
    }
  } catch (err: any) {
    console.error('Failed to load modules:', err)
    message.error('获取业务模块失败: ' + (err.message || '网络错误'))
  }
}

const loadData = async () => {
  loading.value = true
  try {
    const res = await getDefinitions({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined,
      module: filterModule.value,
      status: filterStatus.value
    })
    if (res.success) {
      definitions.value = res.data.items
      pagination.total = res.data.total
    }
  } catch (err) {
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}




const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  loadData()
}

const handleSearch = () => {
  pagination.current = 1
  loadData()
}

const getModuleName = (module: string) => {
  const m = modules.value.find(x => x.module === module)
  return m?.displayName || module
}

const formatDate = (date: string) => {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN')
}

const showCreateModal = () => {
  createForm.name = ''
  createForm.module = undefined
  createForm.description = ''
  createModalVisible.value = true
}

const handleCreate = async () => {
  try {
    await createFormRef.value?.validate()
    creating.value = true
    const res = await createDefinition({
      name: createForm.name,
      module: createForm.module!,
      description: createForm.description
    })
    if (res.success) {
      message.success('创建成功')
      createModalVisible.value = false
      // Go to designer
      router.push(`/workflow/designer/${res.data.id}`)
    } else {
      message.error(res.message || '创建失败')
    }
  } catch (err: any) {
    if (err?.errorFields) return // Validation error
    message.error('创建失败')
  } finally {
    creating.value = false
  }
}

const goToDesigner = (id: number) => {
  router.push(`/workflow/designer/${id}`)
}

const handlePublish = async (record: WorkflowDefinition) => {
  try {
    const res = await publishDefinition(record.id!)
    if (res.success) {
      message.success('发布成功')
      loadData()
    } else {
      message.error(res.message || '发布失败')
    }
  } catch (err) {
    message.error('发布失败')
  }
}

const handleCopy = async (record: WorkflowDefinition) => {
  try {
    const res = await copyDefinition(record.id!)
    if (res.success) {
      message.success('复制成功')
      // Go to designer of the new copy
      router.push(`/workflow/designer/${res.data.id}`)
    } else {
      message.error(res.message || '复制失败')
    }
  } catch (err) {
    message.error('复制失败')
  }
}

const handleDelete = async (id: number) => {
  try {
    const res = await deleteDefinition(id)
    if (res.success) {
      message.success('删除成功')
      loadData()
    } else {
      message.error(res.message || '删除失败')
    }
  } catch (err) {
    message.error('删除失败')
  }
}

onMounted(() => {
  loadModules()
  loadData()
})
</script>

<style scoped>
.workflow-list {
  padding: 16px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}
</style>
