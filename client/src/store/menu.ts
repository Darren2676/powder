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

  const MENU_CACHE_VERSION = 'v20260529s'; // 菜单缓存版本号，菜单结构变更时更新

  /**
   * 从服务器获取菜单树
   */
  const fetchMenuTree = async () => {
    try {
      const response: any = await roleApi.getMyMenuTree();
      if (response.success) {
        menuTree.value = response.data;
        loaded.value = true;
        // 持久化（带版本号）
        localStorage.setItem('menuTree', JSON.stringify(response.data));
        localStorage.setItem('menuTreeVersion', MENU_CACHE_VERSION);
      }
    } catch (err) {
      console.error('获取菜单树失败:', err);
    }
  };

  /**
   * 从 localStorage 恢复菜单树
   * 仅当缓存版本号匹配时才恢复，避免旧缓存导致路由错乱
   */
  const initMenuTree = () => {
    const storedVersion = localStorage.getItem('menuTreeVersion');
    const stored = localStorage.getItem('menuTree');
    if (stored && storedVersion === MENU_CACHE_VERSION) {
      try {
        menuTree.value = JSON.parse(stored);
        loaded.value = true;
      } catch (err) {
        console.error('Failed to parse stored menuTree:', err);
        localStorage.removeItem('menuTree');
        localStorage.removeItem('menuTreeVersion');
      }
    } else {
      // 版本不匹配或无缓存，清除旧数据
      localStorage.removeItem('menuTree');
      localStorage.removeItem('menuTreeVersion');
    }
  };

  /**
   * 清除菜单树
   */
  const clearMenuTree = () => {
    menuTree.value = [];
    loaded.value = false;
    localStorage.removeItem('menuTree');
    localStorage.removeItem('menuTreeVersion');
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