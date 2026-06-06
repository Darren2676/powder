import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FactoryInfo } from '@/types';
import * as factoryApi from '@/api/system/factory';

const STORAGE_KEY_FACTORY = 'current_factory';
const STORAGE_KEY_VIEW_MODE = 'factory_view_mode';

export const useFactoryStore = defineStore('factory', () => {
  // State
  const factories = ref<FactoryInfo[]>([]);
  const currentFactory = ref<FactoryInfo | null>(null);
  const viewMode = ref<'all' | 'single'>('single');
  const loading = ref(false);

  // Getters
  const isHQ = computed(() => {
    const role = (currentFactory as any)?._userRole || '';
    return role.startsWith('headquarters_');
  });

  const currentFactoryId = computed(() => {
    if (viewMode.value === 'all') return null;
    return currentFactory.value?.id ?? null;
  });

  // 从 localStorage 恢复
  const restoreFromStorage = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FACTORY);
      if (saved) currentFactory.value = JSON.parse(saved);
      const mode = localStorage.getItem(STORAGE_KEY_VIEW_MODE);
      if (mode === 'all' || mode === 'single') viewMode.value = mode;
    } catch { /* ignore */ }
  };

  /**
   * 初始化：加载可访问工厂列表
   */
  const initFactories = async () => {
    try {
      loading.value = true;
      const res: any = await factoryApi.getFactoryList();
      if (res.success && res.data) {
        factories.value = res.data;
        // 如果还没有当前工厂，自动选中第一个
        if (!currentFactory.value && res.data.length > 0) {
          currentFactory.value = res.data[0];
          persistFactory();
        }
      }
    } catch { /* 工厂模块可能未就绪 */ }
    finally { loading.value = false; }
  };

  /**
   * 切换工厂
   */
  const switchFactory = async (factoryId: number): Promise<boolean> => {
    try {
      loading.value = true;
      const res: any = await factoryApi.switchFactory(factoryId);
      if (res.success) {
        // 更新 token
        const newToken = res.data.token;
        localStorage.setItem('token', newToken);

        // 更新当前工厂
        currentFactory.value = res.data.factory;
        persistFactory();

        // 切换工厂时自动切回单工厂视图
        viewMode.value = 'single';
        localStorage.setItem(STORAGE_KEY_VIEW_MODE, 'single');

        return true;
      }
      return false;
    } catch {
      return false;
    } finally { loading.value = false; }
  };

  /**
   * 切换视图模式（HQ专用：全部工厂 vs 单工厂）
   */
  const setViewMode = (mode: 'all' | 'single') => {
    viewMode.value = mode;
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, mode);
  };

  const persistFactory = () => {
    if (currentFactory.value) {
      localStorage.setItem(STORAGE_KEY_FACTORY, JSON.stringify(currentFactory.value));
    }
  };

  const clearFactory = () => {
    factories.value = [];
    currentFactory.value = null;
    viewMode.value = 'single';
    localStorage.removeItem(STORAGE_KEY_FACTORY);
    localStorage.removeItem(STORAGE_KEY_VIEW_MODE);
  };

  // 初始化时从 localStorage 恢复
  restoreFromStorage();

  return {
    factories,
    currentFactory,
    viewMode,
    loading,
    isHQ,
    currentFactoryId,
    initFactories,
    switchFactory,
    setViewMode,
    clearFactory,
    restoreFromStorage
  };
});
