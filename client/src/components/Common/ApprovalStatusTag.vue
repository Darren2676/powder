<script setup lang="ts">
defineProps<{ status: string }>()

const colorMap: Record<string, string> = {
  '草稿': 'default',
  '待审批': 'processing',
  '已审批': 'success'
}

const displayMap: Record<string, string> = {
  '草稿': '草稿',
  '待审批': '待审核',
  '已审批': '已审'
}
</script>

<template>
  <a-tag :color="colorMap[status] || 'default'">{{ displayMap[status] || status || '草稿' }}</a-tag>
</template>
