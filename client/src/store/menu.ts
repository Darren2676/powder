import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as roleApi from '@/api/system/role';

export interface MenuItem {
  key: string;
  name: string;
  code: string;
  type: string;
  icon: string | null;
  route: string | null;
  children: MenuItem[];
}

export const useMenuStore = defineStore('menu', () => {
  // State
  const menuTree = ref<MenuItem[]>([]);
  const loaded = ref(false);

  // Getters
  const menuKeys = computed(() => {
    const keys: string[] = [];
    const collect = (items: MenuItem[]) => {
      for (const item of items) {
        keys.push(item.key);
        if (item.children) collect(item.children);
      }
    };
    collect(menuTree.value);
    return keys;
  });

  const routeMap = computed(() => {
    const map: Record<string, string> = {};
    const collect = (items: MenuItem[]) => {
      for (const item of items) {
        if (item.route) {
          map[item.key] = item.route;
        }
        if (item.children) collect(item.children);
      }
    };
    collect(menuTree.value);
    return map;
  });

  // Actions

  /**
   * 从服务器获取菜单树
   */
  const fetchMenuTree = async () => {
    try {
      const response: any = await roleApi.getMyMenuTree();
      if (response.success) {
        menuTree.value = response.data;
        loaded.value = true;
        // 持久化
        localStorage.setItem('menuTree', JSON.stringify(response.data));
      }
    } catch (err) {
      console.error('获取菜单树失败:', err);
    }
  };

  /**
   * 从 localStorage 恢复菜单树
   */
  const initMenuTree = () => {
    const stored = localStorage.getItem('menuTree');
    if (stored) {
      try {
        menuTree.value = JSON.parse(stored);
        loaded.value = true;
      } catch (err) {
        console.error('Failed to parse stored menuTree:', err);
        localStorage.removeItem('menuTree');
      }
    }
  };

  /**
   * 清除菜单树
   */
  const clearMenuTree = () => {
    menuTree.value = [];
    loaded.value = false;
    localStorage.removeItem('menuTree');
  };

  // 初始化
  initMenuTree();

  return {
    menuTree,
    loaded,
    menuKeys,
    routeMap,
    fetchMenuTree,
    initMenuTree,
    clearMenuTree
  };
});
