<template>
  <div>
    <a-page-header title="部门管理" style="padding: 0; margin-bottom: 16px;">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="handleCreate"><PlusOutlined /> 新建</a-button>
        </a-space>
      </template>
    </a-page-header>

    <div class="dept-layout">
      <!-- 左侧部门树 -->
      <a-card class="dept-tree-card" :bordered="false" title="部门结构" size="small">
        <DeptTree ref="deptTreeRef" :selected-id="selectedDeptId" @select="handleTreeSelect" />
      </a-card>

      <!-- 右侧列表 -->
      <a-card class="dept-list-card" :bordered="false" size="small">
        <template #title>
          <a-space>
            <span>{{ currentDeptName || '全部部门' }}</span>
            <a-breadcrumb v-if="deptPath.length > 0" style="font-size: 12px; font-weight: normal;">
              <a-breadcrumb-item v-for="item in deptPath" :key="item.id">
                {{ item.dept_name }}
              </a-breadcrumb-item>
            </a-breadcrumb>
          </a-space>
        </template>
        <template #extra>
          <a-space>
            <a-input-search
              v-model:value="searchText"
              placeholder="搜索部门编码/名称"
              style="width: 200px"
              allow-clear
              @search="handleSearch"
            />
            <a-select
              v-model:value="statusFilter"
              placeholder="状态"
              style="width: 100px"
              allow-clear
              @change="handleSearch"
            >
              <a-select-option value="active">启用</a-select-option>
              <a-select-option value="inactive">停用</a-select-option>
            </a-select>
            <a-button @click="handleReset"><ReloadOutlined /></a-button>
          </a-space>
        </template>

        <a-table
          :columns="columns"
          :data-source="dataSource"
          :loading="loading"
          :pagination="pagination"
          row-key="id"
          size="small"
          @change="handleTableChange"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'rowIndex'">
              {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
            </template>
            <template v-if="column.key === 'parent_dept'">
              <span v-if="record.parent_id">{{ record.parent_dept_name || getParentDeptName(record.parent_id) }}</span>
              <span v-else style="color: #999;">-</span>
            </template>
            <template v-if="column.key === 'status'">
              <a-tag :color="record.status === 'active' ? 'green' : 'default'">
                {{ record.status === 'active' ? '启用' : '停用' }}
              </a-tag>
            </template>
            <template v-if="column.key === 'action'">
              <a-space :size="4">
                <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
                <a-button type="link" size="small" @click="handleViewUsers(record)">查看人员</a-button>
                <a-button type="link" size="small" @click="handleAddChild(record)">添加子部门</a-button>
                <a-popconfirm
                  v-if="record.status === 'active'"
                  title="确定要停用此部门吗？"
                  @confirm="handleDelete(record)"
                >
                  <a-button type="link" size="small" danger>停用</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-card>
    </div>

    <!-- Create/Edit Modal -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingRecord ? '编辑部门' : '新建部门'"
      :confirm-loading="saving"
      width="520px"
      @ok="handleSave"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 16 }"
      >
        <a-form-item label="部门编码" name="dept_code">
          <a-input v-model:value="formData.dept_code" placeholder="如: PROD, QA, HR" />
        </a-form-item>
        <a-form-item label="部门名称" name="dept_name">
          <a-input v-model:value="formData.dept_name" placeholder="如: 生产部" />
        </a-form-item>
        <a-form-item label="上级部门" name="parent_id">
          <a-tree-select
            v-model:value="formData.parent_id"
            :tree-data="parentTreeOptions"
            :field-names="{ key: 'id', label: 'dept_name', value: 'id', children: 'children' }"
            placeholder="选择上级部门（留空为顶级部门）"
            allow-clear
            tree-default-expand-all
            :disabled-options="disabledParentOptions"
          />
        </a-form-item>
        <a-form-item label="排序号" name="sort_order">
          <a-input-number v-model:value="formData.sort_order" :min="0" :max="9999" style="width: 100%" placeholder="数字越小越靠前" />
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="formData.description" :rows="3" placeholder="部门描述（可选）" />
        </a-form-item>
        <a-form-item v-if="editingRecord" label="状态" name="status">
          <a-select v-model:value="formData.status">
            <a-select-option value="active">启用</a-select-option>
            <a-select-option value="inactive">停用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Users Drawer -->
    <a-drawer
      v-model:open="usersDrawerVisible"
      :title="`${viewingDepartment?.dept_name || ''} - 部门人员`"
      width="500"
    >
      <a-spin :spinning="loadingUsers">
        <a-empty v-if="departmentUsers.length === 0" description="该部门暂无人员" />
        <a-list v-else :data-source="departmentUsers" size="small">
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta>
                <template #title>
                  {{ item.real_name || item.username }}
                  <a-tag size="small" style="margin-left: 8px;">{{ item.role }}</a-tag>
                </template>
                <template #description>
                  {{ item.email }}
                </template>
              </a-list-item-meta>
            </a-list-item>
          </template>
        </a-list>
      </a-spin>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { useTableList } from '@/composables/useTableList'
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentUsers,
  getDepartmentTree,
  getDepartmentPath,
  type Department,
  type DepartmentUser,
  type DepartmentTreeNode
} from '@/api/system/department'
import DeptTree from './components/DeptTree.vue'

const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getDepartments)

const columns = [
  { title: '行号', key: 'rowIndex', width: 60, align: 'center' as const },
  { title: '部门编码', dataIndex: 'dept_code', key: 'dept_code', width: 120 },
  { title: '部门名称', dataIndex: 'dept_name', key: 'dept_name', width: 150 },
  { title: '上级部门', key: 'parent_dept', width: 120 },
  { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 70, align: 'center' as const },
  { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
  { title: '状态', key: 'status', width: 80 },
  { title: '操作', key: 'action', width: 240, fixed: 'right' as const }
]


const statusFilter = ref<string | undefined>(undefined)


// 部门树相关
const deptTreeRef = ref()
const selectedDeptId = ref<number | null>(null)
const selectedDept = ref<DepartmentTreeNode | null>(null)
const currentDeptName = computed(() => selectedDept.value?.dept_name || '')
const deptPath = ref<{ id: number; dept_name: string }[]>([])

// 部门名称映射（用于显示上级部门名称）
const deptNameMap = ref<Record<number, string>>({})

// 构建部门名称映射
function buildDeptNameMap(nodes: DepartmentTreeNode[]) {
  for (const node of nodes) {
    deptNameMap.value[node.id] = node.dept_name
    if (node.children) {
      buildDeptNameMap(node.children)
    }
  }
}

const getParentDeptName = (parentId: number) => {
  return deptNameMap.value[parentId] || `ID:${parentId}`
}

// 选中树节点
const handleTreeSelect = async (dept: DepartmentTreeNode | null) => {
  selectedDept.value = dept
  selectedDeptId.value = dept?.id || null

  // 加载面包屑路径
  if (dept) {
    try {
      const res: any = await getDepartmentPath(dept.id)
      deptPath.value = res.data || []
    } catch {
      deptPath.value = []
    }
  } else {
    deptPath.value = []
  }

  // 刷新右侧列表
  pagination.current = 1
  fetchData()
}

// Form
const modalVisible = ref(false)
const saving = ref(false)
const formRef = ref()
const editingRecord = ref<Department | null>(null)
const formData = reactive({
  dept_code: '',
  dept_name: '',
  description: '',
  status: 'active',
  parent_id: null as number | null,
  sort_order: 0
})
const formRules = {
  dept_code: [{ required: true, message: '请输入部门编码' }],
  dept_name: [{ required: true, message: '请输入部门名称' }]
}

// 父部门树选择器数据
const parentTreeOptions = ref<DepartmentTreeNode[]>([])

// 编辑时，排除自身及其子部门（防止循环引用）
const disabledParentOptions = computed(() => {
  if (!editingRecord.value) return []
  const ids: number[] = [editingRecord.value.id]
  // 收集所有子部门 ID
  function collectChildIds(nodes: DepartmentTreeNode[], targetId: number) {
    for (const node of nodes) {
      if (node.id === targetId && node.children) {
        for (const child of node.children) {
          ids.push(child.id)
          if (child.children) collectChildIds([child], child.id)
        }
      } else if (node.children) {
        collectChildIds(node.children, targetId)
      }
    }
  }
  if (deptTreeRef.value?.treeData) {
    collectChildIds(deptTreeRef.value.treeData, editingRecord.value.id)
  }
  return ids
})

// Users drawer
const usersDrawerVisible = ref(false)
const loadingUsers = ref(false)
const viewingDepartment = ref<Department | null>(null)
const departmentUsers = ref<DepartmentUser[]>([])

// 加载父部门选择器数据
const fetchParentTreeOptions = async () => {
  try {
    const res: any = await getDepartmentTree('active')
    parentTreeOptions.value = res.data || []
    buildDeptNameMap(parentTreeOptions.value)
  } catch {
    parentTreeOptions.value = []
  }
}







const handleCreate = async () => {
  editingRecord.value = null
  formData.dept_code = ''
  formData.dept_name = ''
  formData.description = ''
  formData.status = 'active'
  formData.parent_id = selectedDeptId.value
  formData.sort_order = 0
  await fetchParentTreeOptions()
  modalVisible.value = true
}

const handleEdit = async (record: Department) => {
  editingRecord.value = record
  formData.dept_code = record.dept_code
  formData.dept_name = record.dept_name
  formData.description = record.description || ''
  formData.status = record.status
  formData.parent_id = record.parent_id
  formData.sort_order = record.sort_order || 0
  await fetchParentTreeOptions()
  modalVisible.value = true
}

// 添加子部门
const handleAddChild = async (record: Department) => {
  editingRecord.value = null
  formData.dept_code = ''
  formData.dept_name = ''
  formData.description = ''
  formData.status = 'active'
  formData.parent_id = record.id
  formData.sort_order = 0
  await fetchParentTreeOptions()
  modalVisible.value = true
}

const handleSave = async () => {
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    if (editingRecord.value) {
      await updateDepartment(editingRecord.value.id, {
        dept_code: formData.dept_code,
        dept_name: formData.dept_name,
        description: formData.description,
        status: formData.status,
        parent_id: formData.parent_id,
        sort_order: formData.sort_order
      })
      message.success('更新成功')
    } else {
      await createDepartment({
        dept_code: formData.dept_code,
        dept_name: formData.dept_name,
        description: formData.description,
        parent_id: formData.parent_id,
        sort_order: formData.sort_order
      })
      message.success('创建成功')
    }
    modalVisible.value = false
    fetchData()
    // 刷新左侧树
    deptTreeRef.value?.fetchTree()
  } catch (e: any) {
    message.error(e?.response?.data?.message || '操作失败')
  } finally {
    saving.value = false
  }
}

const handleDelete = async (record: Department) => {
  try {
    await deleteDepartment(record.id)
    message.success('已停用')
    fetchData()
    // 刷新左侧树
    deptTreeRef.value?.fetchTree()
  } catch (e: any) {
    message.error(e?.response?.data?.message || '停用失败')
  }
}

const handleViewUsers = async (record: Department) => {
  viewingDepartment.value = record
  usersDrawerVisible.value = true
  loadingUsers.value = true
  try {
    const res: any = await getDepartmentUsers(record.id)
    departmentUsers.value = res.data || []
  } catch {
    message.error('获取部门人员失败')
    departmentUsers.value = []
  } finally {
    loadingUsers.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.dept-layout {
  display: flex;
  gap: 16px;
  min-height: calc(100vh - 180px);
}

.dept-tree-card {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
  overflow: auto;
}

.dept-list-card {
  flex: 1;
  min-width: 0;
}
</style>
