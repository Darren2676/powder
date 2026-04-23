<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, CloudSyncOutlined, ApiOutlined, SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { getInspectRecords, testXhyConnection, syncInspectRecords } from '@/api/integration/xinheyunInspect'
import dayjs from 'dayjs'
import { createVNode } from 'vue'
import { useTableList } from '@/composables/useTableList'


const syncing = ref(false)
const testingConnection = ref(false)


const inspectTypeFilter = ref('')
const inspectMethodFilter = ref('')



const inspectTypeMap: Record<string, { label: string; color: string }> = {
  'NON': { label: '无', color: 'default' },
  'SELF': { label: '自检', color: 'blue' },
  'SPECIAL': { label: '专检', color: 'orange' }
}

const inspectMethodMap: Record<string, { label: string; color: string }> = {
  'NONE': { label: '无', color: 'default' },
  'HEAD': { label: '首检', color: 'blue' },
  'ALL': { label: '全检', color: 'green' },
  'SAMPLING': { label: '抽检', color: 'orange' },
  'LAST': { label: '末检', color: 'purple' }
}

const workOrderTypeMap: Record<string, string> = {
  'MANUFACTURE': '标准生产',
  'REPAIR': '返修',
  'CO_PRODUCT': '联产品',
  'REPAIR_WORKSTATION': '返修工位',
  'REPEAT_MANUFACTURE': '重复生产',
  'SALE_AFTER_WORKSTATION': '售后工位'
}

const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getInspectRecords)

const columns = [
  { title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const },
  { title: '编号', dataIndex: 'code', key: 'code', width: 120 },
  { title: '生产单号', dataIndex: 'work_order_number', key: 'work_order_number', width: 160 },
  { title: '在制品编号', dataIndex: 'item_code', key: 'item_code', width: 130 },
  { title: '在制品名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '工序', dataIndex: 'procedure_name', key: 'procedure_name', width: 110 },
  { title: '检验类型', dataIndex: 'inspect_type', key: 'inspect_type', width: 90 },
  { title: '检验方法', dataIndex: 'inspect_method', key: 'inspect_method', width: 90 },
  { title: '检验方案', dataIndex: 'inspect_plan_name', key: 'inspect_plan_name', width: 130, ellipsis: true },
  { title: '检验规范', dataIndex: 'inspect_standard_name', key: 'inspect_standard_name', width: 130, ellipsis: true },
  { title: '生产单类型', dataIndex: 'work_order_type', key: 'work_order_type', width: 100 },
  { title: '检验时间', dataIndex: 'job_booking_time', key: 'job_booking_time', width: 150 },
  { title: '创建时间', dataIndex: 'xhy_create_time', key: 'xhy_create_time', width: 150 },
  { title: '同步时间', dataIndex: 'sync_time', key: 'sync_time', width: 150 },
  { title: '备注', dataIndex: 'comment', key: 'comment', width: 120, ellipsis: true }
]

const handleSync = () => {
  Modal.confirm({
    title: '同步检验记录',
    icon: createVNode(ExclamationCircleOutlined),
    content: '将从新核云系统拉取最新的检验记录并同步到本地数据库。此操作可能需要一些时间，请确认是否继续？',
    okText: '开始同步',
    cancelText: '取消',
    onOk: async () => {
      syncing.value = true
      try {
        const res: any = await syncInspectRecords({ batchSize: 200, maxRecords: 10000 })
        if (res.success) {
          const d = res.data
          message.success(`同步完成: 获取 ${d.fetched} 条, 新增 ${d.inserted} 条, 更新 ${d.updated} 条${d.errors > 0 ? ', 失败 ' + d.errors + ' 条' : ''}`)
          fetchData()
        } else {
          message.error(res.message || '同步失败')
        }
      } catch (e: any) {
        message.error('同步失败: ' + (e.response?.data?.message || e.message || '未知错误'))
      } finally {
        syncing.value = false
      }
    }
  })
}

const formatTime = (val: string | null) => {
  if (!val) return '-'
  return dayjs(val).format('YYYY-MM-DD HH:mm')
}

onMounted(() => { fetchData() })
</script>

<template>
  <div style="padding: 16px">
    <a-card title="新核云检验记录" :bordered="false">
      <template #extra>
        <a-space>
          <a-button @click="handleTestConnection" :loading="testingConnection">
            <template #icon><ApiOutlined /></template>
            测试连接
          </a-button>
          <a-button type="primary" @click="handleSync" :loading="syncing">
            <template #icon><CloudSyncOutlined /></template>
            同步记录
          </a-button>
        </a-space>
      </template>

      <!-- 搜索栏 -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索编号/生产单号/物料编号/名称/工序..."
          style="width: 360px"
          allow-clear
          @search="handleSearch"
          @pressEnter="handleSearch"
        />
        <a-select v-model:value="inspectTypeFilter" placeholder="检验类型" style="width: 120px" allow-clear @change="handleSearch">
          <a-select-option value="">全部类型</a-select-option>
          <a-select-option value="SELF">自检</a-select-option>
          <a-select-option value="SPECIAL">专检</a-select-option>
          <a-select-option value="NON">无</a-select-option>
        </a-select>
        <a-select v-model:value="inspectMethodFilter" placeholder="检验方法" style="width: 120px" allow-clear @change="handleSearch">
          <a-select-option value="">全部方法</a-select-option>
          <a-select-option value="HEAD">首检</a-select-option>
          <a-select-option value="ALL">全检</a-select-option>
          <a-select-option value="SAMPLING">抽检</a-select-option>
          <a-select-option value="LAST">末检</a-select-option>
        </a-select>
        <a-button @click="handleReset">
          <template #icon><ReloadOutlined /></template>
          重置
        </a-button>
      </div>

      <!-- 表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1800 }"
        row-key="code"
        size="small"
        :bordered="true"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>

          <template v-else-if="column.key === 'inspect_type'">
            <a-tag :color="inspectTypeMap[record.inspect_type]?.color || 'default'">
              {{ inspectTypeMap[record.inspect_type]?.label || record.inspect_type || '-' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'inspect_method'">
            <a-tag :color="inspectMethodMap[record.inspect_method]?.color || 'default'">
              {{ inspectMethodMap[record.inspect_method]?.label || record.inspect_method || '-' }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'work_order_type'">
            {{ workOrderTypeMap[record.work_order_type] || record.work_order_type || '-' }}
          </template>

          <template v-else-if="column.key === 'job_booking_time'">
            {{ formatTime(record.job_booking_time) }}
          </template>

          <template v-else-if="column.key === 'xhy_create_time'">
            {{ formatTime(record.xhy_create_time) }}
          </template>

          <template v-else-if="column.key === 'sync_time'">
            {{ formatTime(record.sync_time) }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>
