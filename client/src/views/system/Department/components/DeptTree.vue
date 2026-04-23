<template>
  <div class="dept-tree-wrapper">
    <div class="dept-tree-header">
      <a-space>
        <a-button size="small" @click="handleExpandAll">全部展开</a-button>
        <a-button size="small" @click="handleCollapseAll">全部折叠</a-button>
      </a-space>
    </div>
    <a-spin :spinning="loading">
      <a-empty v-if="treeData.length === 0 && !loading" description="暂无部门数据" />
      <a-tree
        v-else
        v-model:expandedKeys="expandedKeys"
        v-model:selectedKeys="selectedKeys"
        :tree-data="treeData"
        :field-names="fieldNames"
        show-icon
        block-node
        @select="handleSelect"
      >
        <template #icon="{ expanded, data }">
          <FolderOpenOutlined v-if="expanded && data.children && data.children.length > 0" />
          <FolderOutlined v-else-if="data.children && data.children.length > 0" />
          <FileOutlined v-else />
        </template>
        <template #title="{ data }">
          <span :class="{ 'dept-inactive': data.status === 'inactive' }">
            {{ data.dept_name }}
          </span>
          <span v-if="data.dept_code" class="dept-code">（{{ data.dept_code }}）</span>
        </template>
      </a-tree>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { message } from 'ant-design-vue'
import { FolderOutlined, FolderOpenOutlined, FileOutlined } from '@ant-design/icons-vue'
import { getDepartmentTree, type DepartmentTreeNode } from '@/api/system/department'

const props = defineProps<{
  selectedId?: number | null
}>()

const emit = defineEmits<{
  (e: 'select', dept: DepartmentTreeNode | null): void
}>()

const loading = ref(false)
const treeData = ref<DepartmentTreeNode[]>([])
const expandedKeys = ref<string[]>([])
const selectedKeys = ref<string[]>([])
const allKeys = ref<string[]>([])

const fieldNames = {
  key: 'id',
  title: 'dept_name',
  children: 'children'
}

// 收集所有可展开的 key
function collectAllKeys(nodes: DepartmentTreeNode[]): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      keys.push(String(node.id))
      keys.push(...collectAllKeys(node.children))
    }
  }
  return keys
}

// 加载部门树
const fetchTree = async () => {
  loading.value = true
  try {
    const res: any = await getDepartmentTree()
    treeData.value = res.data || []
    allKeys.value = collectAllKeys(treeData.value)
    // 默认展开第一层
    expandedKeys.value = treeData.value.map((n: DepartmentTreeNode) => String(n.id))
  } catch {
    message.error('加载部门树失败')
  } finally {
    loading.value = false
  }
}

// 全部展开
const handleExpandAll = () => {
  expandedKeys.value = [...allKeys.value]
}

// 全部折叠
const handleCollapseAll = () => {
  expandedKeys.value = []
}

// 选中节点
const handleSelect = (keys: string[], info: any) => {
  if (keys.length > 0) {
    const node = info.node?.dataRef || info.node
    emit('select', node as DepartmentTreeNode)
  } else {
    emit('select', null)
  }
}

// 根据 ID 查找节点
function findNode(nodes: DepartmentTreeNode[], id: number): DepartmentTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNode(node.children, id)
      if (found) return found
    }
  }
  return null
}

// 监听外部传入的 selectedId
watch(() => props.selectedId, (newId) => {
  if (newId) {
    selectedKeys.value = [String(newId)]
  } else {
    selectedKeys.value = []
  }
})

// 暴露方法供父组件调用
defineExpose({
  fetchTree,
  treeData
})

onMounted(() => {
  fetchTree()
})
</script>

<style scoped>
.dept-tree-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.dept-tree-header {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.dept-tree-wrapper :deep(.ant-tree) {
  background: transparent;
}

.dept-inactive {
  color: #999;
  text-decoration: line-through;
}

.dept-code {
  color: #999;
  font-size: 12px;
  margin-left: 2px;
}
</style>
