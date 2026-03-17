<script setup lang="ts">
import { ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { getApprovalLog } from '@/api/approval'
import {
  SendOutlined, CheckCircleOutlined, RollbackOutlined, UndoOutlined
} from '@ant-design/icons-vue'

const props = defineProps<{
  open: boolean
  module: string
  recordId: string
}>()

const emit = defineEmits<{ (e: 'update:open', val: boolean): void }>()

interface LogItem {
  id: number; action: string; from_status: string; to_status: string;
  operator_name: string; remark: string | null; created_at: string;
}

const loading = ref(false)
const logs = ref<LogItem[]>([])

const actionMap: Record<string, { label: string; color: string }> = {
  'submit':   { label: '提交审批', color: 'blue' },
  'approve':  { label: '审批通过', color: 'green' },
  'reverse':  { label: '反审退回', color: 'orange' },
  'withdraw': { label: '撤回提交', color: 'gray' }
}

const iconMap: Record<string, any> = {
  'submit': SendOutlined,
  'approve': CheckCircleOutlined,
  'reverse': RollbackOutlined,
  'withdraw': UndoOutlined
}

const fetchLogs = async () => {
  if (!props.module || !props.recordId) return
  loading.value = true
  try {
    const res = await getApprovalLog(props.module, props.recordId)
    logs.value = res.data || []
  } catch { message.error('获取审批历史失败') }
  finally { loading.value = false }
}

watch(() => props.open, (val) => { if (val) fetchLogs() })

const formatDate = (dt: string) => {
  if (!dt) return ''
  const d = new Date(dt)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <a-modal :open="props.open" title="审批历史" :footer="null" @cancel="emit('update:open', false)" width="550px">
    <a-spin :spinning="loading">
      <a-empty v-if="!logs.length" description="暂无审批记录" />
      <a-timeline v-else>
        <a-timeline-item v-for="log in logs" :key="log.id" :color="actionMap[log.action]?.color || 'blue'">
          <template #dot>
            <component :is="iconMap[log.action]" style="font-size: 16px" />
          </template>
          <div>
            <strong>{{ actionMap[log.action]?.label || log.action }}</strong>
            <span style="margin-left: 8px; color: #888;">{{ log.operator_name }}</span>
            <span style="margin-left: 8px; color: #aaa; font-size: 12px;">{{ formatDate(log.created_at) }}</span>
          </div>
          <div style="color: #666; font-size: 13px;">
            {{ log.from_status }} → {{ log.to_status }}
          </div>
          <div v-if="log.remark" style="color: #999; font-size: 12px; margin-top: 2px;">
            备注: {{ log.remark }}
          </div>
        </a-timeline-item>
      </a-timeline>
    </a-spin>
  </a-modal>
</template>
