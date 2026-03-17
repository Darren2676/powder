<script setup lang="ts">
import { ref, computed, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '@/store/auth'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/approval'

const props = defineProps<{
  module: string
  recordId: string
  approvalStatus: string
}>()

const emit = defineEmits<{ (e: 'status-changed'): void }>()

const authStore = useAuthStore()
const role = computed(() => authStore.userRole)
const loading = ref(false)

const showSubmit = computed(() => props.approvalStatus === '草稿')
const showApprove = computed(() => props.approvalStatus === '待审批' && (role.value === 'manager' || role.value === 'admin'))
const showWithdraw = computed(() => props.approvalStatus === '待审批')
const showReverse = computed(() => props.approvalStatus === '已审批' && (role.value === 'manager' || role.value === 'admin'))

const remarkText = ref('')

const handleSubmit = () => {
  Modal.confirm({
    title: '提交审核',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定要提交审核吗？提交后将不可编辑。',
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      loading.value = true
      try { await submitForApproval(props.module, props.recordId); message.success('提交审核成功'); emit('status-changed') }
      catch { message.error('提交审核失败') }
      finally { loading.value = false }
    }
  })
}

const handleApprove = () => {
  remarkText.value = ''
  Modal.confirm({
    title: '审核通过',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定审核通过吗？',
    okText: '通过', cancelText: '取消',
    onOk: async () => {
      loading.value = true
      try { await approveRecord(props.module, props.recordId, remarkText.value || undefined); message.success('审核通过'); emit('status-changed') }
      catch { message.error('审核失败') }
      finally { loading.value = false }
    }
  })
}

const handleWithdraw = () => {
  Modal.confirm({
    title: '撤回提交',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定要撤回审核提交吗？',
    okText: '撤回', cancelText: '取消',
    onOk: async () => {
      loading.value = true
      try { await withdrawApproval(props.module, props.recordId); message.success('撤回成功'); emit('status-changed') }
      catch { message.error('撤回失败，可能您不是提交人') }
      finally { loading.value = false }
    }
  })
}

const handleReverse = () => {
  remarkText.value = ''
  Modal.confirm({
    title: '反审',
    icon: createVNode(ExclamationCircleOutlined),
    content: '确定要执行反审吗？记录将退回草稿状态，可重新编辑。',
    okText: '确认反审', okType: 'danger', cancelText: '取消',
    onOk: async () => {
      loading.value = true
      try { await reverseApproval(props.module, props.recordId, remarkText.value || undefined); message.success('反审成功，已退回草稿'); emit('status-changed') }
      catch { message.error('反审失败') }
      finally { loading.value = false }
    }
  })
}
</script>

<template>
  <a-space :size="4">
    <a-button v-if="showSubmit" type="link" size="small" :loading="loading" @click.stop="handleSubmit">提交</a-button>
    <a-button v-if="showApprove" type="link" size="small" style="color: #52c41a" :loading="loading" @click.stop="handleApprove">通过</a-button>
    <a-button v-if="showWithdraw" type="link" size="small" :loading="loading" @click.stop="handleWithdraw">撤回</a-button>
    <a-button v-if="showReverse" type="link" size="small" danger :loading="loading" @click.stop="handleReverse">反审</a-button>
  </a-space>
</template>
