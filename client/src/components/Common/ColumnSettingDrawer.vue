<script setup lang="ts">
import { ArrowUpOutlined, ArrowDownOutlined, UndoOutlined } from '@ant-design/icons-vue'

defineProps<{
  open: boolean
  settingList: { key: string; title: string; visible: boolean }[]
  saving: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'moveUp', index: number): void
  (e: 'moveDown', index: number): void
  (e: 'save'): void
  (e: 'reset'): void
}>()
</script>

<template>
  <a-drawer
    :open="open"
    title="列显示设置"
    placement="right"
    :width="360"
    @close="emit('update:open', false)"
  >
    <template #extra>
      <a-space>
        <a-button size="small" @click="emit('reset')" :loading="saving">
          <template #icon><UndoOutlined /></template>
          恢复默认
        </a-button>
        <a-button size="small" type="primary" @click="emit('save')" :loading="saving">
          保存
        </a-button>
      </a-space>
    </template>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <div
        v-for="(item, index) in settingList"
        :key="item.key"
        style="display: flex; align-items: center; padding: 6px 8px; border: 1px solid #f0f0f0; border-radius: 4px; background: #fafafa;"
      >
        <a-checkbox v-model:checked="item.visible" style="margin-right: 8px;" />
        <span style="flex: 1; font-size: 13px;">{{ item.title }}</span>
        <a-space :size="2">
          <a-button type="text" size="small" :disabled="index === 0" @click="emit('moveUp', index)">
            <template #icon><ArrowUpOutlined /></template>
          </a-button>
          <a-button type="text" size="small" :disabled="index === settingList.length - 1" @click="emit('moveDown', index)">
            <template #icon><ArrowDownOutlined /></template>
          </a-button>
        </a-space>
      </div>
    </div>
  </a-drawer>
</template>
