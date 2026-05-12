<script setup lang="ts">
import type { MenuItem } from '@/store/menu';

defineOptions({ name: 'SidebarMenuItem' });

defineProps<{
  item: MenuItem;
  getIcon: (name: string | null) => any;
}>();

defineEmits<{
  contextmenu: [e: MouseEvent, key: string];
}>();
</script>

<template>
  <a-sub-menu v-if="item.children && item.children.length > 0" :key="item.key">
    <template #icon>
      <component :is="getIcon(item.icon)" v-if="getIcon(item.icon)" />
    </template>
    <template #title>{{ item.name }}</template>
    <SidebarMenuItem
      v-for="child in item.children"
      :key="child.key"
      :item="child"
      :get-icon="getIcon"
      @contextmenu="(e: MouseEvent, key: string) => $emit('contextmenu', e, key)"
    />
  </a-sub-menu>
  <a-menu-item v-else :key="item.key" @contextmenu="(e: MouseEvent) => $emit('contextmenu', e, item.key)">
    <component :is="getIcon(item.icon)" v-if="getIcon(item.icon)" />
    <span>{{ item.name }}</span>
  </a-menu-item>
</template>
