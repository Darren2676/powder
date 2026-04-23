import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as roleApi from '@/api/system/role';

export const usePermissionStore = defineStore('permission', () => {
  // State
  const menuKeys = ref<string[]>([]);
  const permissionCodes = ref<string[]>([]);
  const routePaths = ref<string[]>([]);
  const roles = ref<Array<{ id: number; role_name: string; role_code: string }>>([]);
  const isAdmin = ref(false);
  const loaded = ref(false);
  // 操作权限: { "sales-orders": ["view","create","edit","delete","export","approve"] }
  const operationPermissions = ref<Record<string, string[]>>({});
  // 字段权限: { "sales-orders": ["unit_price","total_amount"] }
  const fieldPermissions = ref<Record<string, string[]>>({});

  // Getters
  const hasPermission = computed(() => {
    return (code: string) => {
      if (isAdmin.value) return true;
      return permissionCodes.value.includes(code);
    };
  });

  const hasMenuKey = computed(() => {
    return (key: string) => {
      if (isAdmin.value) return true;
      return menuKeys.value.includes(key);
    };
  });

  const hasRoutePath = computed(() => {
    return (path: string) => {
      if (isAdmin.value) return true;
      return routePaths.value.some(rp => path.startsWith(rp));
    };
  });

  /**
   * 检查是否有指定页面的指定操作权限
   * @param pageCode 页面编码，如 'sales-orders'
   * @param action 操作类型: 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import' | 'approve'
   */
  const hasOperation = computed(() => {
    return (pageCode: string, action: string) => {
      if (isAdmin.value) return true;
      const ops = operationPermissions.value[pageCode];
      return ops ? ops.includes(action) : false;
    };
  });

  /**
   * 检查是否有指定页面的指定字段查看权限
   * @param pageCode 页面编码，如 'sales-orders'
   * @param fieldName 字段名，如 'unit_price' | 'total_amount'
   */
  const hasFieldPermission = computed(() => {
    return (pageCode: string, fieldName: string) => {
      if (isAdmin.value) return true;
      const fields = fieldPermissions.value[pageCode];
      return fields ? fields.includes(fieldName) : false;
    };
  });

  /**
   * 获取指定页面的所有已授权操作列表
   * @param pageCode 页面编码
   * @returns 操作列表数组，如 ['view', 'create', 'edit']
   */
  const getPageOperations = computed(() => {
    return (pageCode: string): string[] => {
      if (isAdmin.value) return ['view', 'create', 'edit', 'delete', 'export', 'import', 'approve'];
      return operationPermissions.value[pageCode] || [];
    };
  });

  /**
   * 获取指定页面的所有已授权字段列表
   * @param pageCode 页面编码
   * @returns 字段列表数组，如 ['unit_price', 'total_amount']
   */
  const getPageFields = computed(() => {
    return (pageCode: string): string[] => {
      if (isAdmin.value) return []; // admin 返回空表示无限制
      return fieldPermissions.value[pageCode] || [];
    };
  });

  // Actions

  /**
   * 从登录响应中加载权限
   */
  const loadFromLogin = (permData: any) => {
    if (permData) {
      menuKeys.value = permData.menuKeys || [];
      permissionCodes.value = permData.permissionCodes || [];
      routePaths.value = permData.routePaths || [];
      roles.value = permData.roles || [];
      isAdmin.value = permData.isAdmin || false;
      operationPermissions.value = permData.operationPermissions || {};
      fieldPermissions.value = permData.fieldPermissions || {};
      loaded.value = true;
      // 持久化到 localStorage
      localStorage.setItem('permissions', JSON.stringify({
        menuKeys: menuKeys.value,
        permissionCodes: permissionCodes.value,
        routePaths: routePaths.value,
        roles: roles.value,
        isAdmin: isAdmin.value,
        operationPermissions: operationPermissions.value,
        fieldPermissions: fieldPermissions.value
      }));
    }
  };

  /**
   * 从服务器获取权限
   */
  const fetchPermissions = async () => {
    try {
      const response: any = await roleApi.getMyPermissions();
      if (response.success) {
        loadFromLogin(response.data);
      }
    } catch (err) {
      console.error('获取权限失败:', err);
    }
  };

  /**
   * 从 localStorage 恢复权限
   */
  const initPermissions = () => {
    const stored = localStorage.getItem('permissions');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        menuKeys.value = data.menuKeys || [];
        permissionCodes.value = data.permissionCodes || [];
        routePaths.value = data.routePaths || [];
        roles.value = data.roles || [];
        isAdmin.value = data.isAdmin || false;
        operationPermissions.value = data.operationPermissions || {};
        fieldPermissions.value = data.fieldPermissions || {};
        loaded.value = true;
      } catch (err) {
        console.error('Failed to parse stored permissions:', err);
        localStorage.removeItem('permissions');
      }
    }
  };

  /**
   * 清除权限
   */
  const clearPermissions = () => {
    menuKeys.value = [];
    permissionCodes.value = [];
    routePaths.value = [];
    roles.value = [];
    isAdmin.value = false;
    operationPermissions.value = {};
    fieldPermissions.value = {};
    loaded.value = false;
    localStorage.removeItem('permissions');
  };

  // 初始化
  initPermissions();

  return {
    // State
    menuKeys,
    permissionCodes,
    routePaths,
    roles,
    isAdmin,
    loaded,
    operationPermissions,
    fieldPermissions,
    // Getters
    hasPermission,
    hasMenuKey,
    hasRoutePath,
    hasOperation,
    hasFieldPermission,
    getPageOperations,
    getPageFields,
    // Actions
    loadFromLogin,
    fetchPermissions,
    initPermissions,
    clearPermissions
  };
});
