/**
 * usePagePermission - 页面级操作权限和字段权限控制组合式函数
 *
 * 用法示例:
 *
 * ```ts
 * const { canView, canCreate, canEdit, canDelete, canExport, canImport, canApprove, canViewField } = usePagePermission('sales-orders');
 *
 * // 在模板中使用:
 * // <a-button v-if="canCreate" @click="handleCreate">新增</a-button>
 * // <a-button v-if="canEdit" @click="handleEdit(record)">编辑</a-button>
 * // <a-button v-if="canDelete" @click="handleDelete(record)">删除</a-button>
 * // <template v-if="canViewField('unit_price')">
 * //   <span>{{ record.unit_price }}</span>
 * // </template>
 * // <template v-else>
 * //   <span style="color: #ccc;">***</span>
 * // </template>
 * ```
 */
import { computed } from 'vue';
import { usePermissionStore } from '@/store/permission';

export function usePagePermission(pageCode: string) {
  const permStore = usePermissionStore();

  /** 是否有查看权限 */
  const canView = computed(() => permStore.hasOperation(pageCode, 'view'));
  /** 是否有新增权限 */
  const canCreate = computed(() => permStore.hasOperation(pageCode, 'create'));
  /** 是否有编辑权限 */
  const canEdit = computed(() => permStore.hasOperation(pageCode, 'edit'));
  /** 是否有删除权限 */
  const canDelete = computed(() => permStore.hasOperation(pageCode, 'delete'));
  /** 是否有导出权限 */
  const canExport = computed(() => permStore.hasOperation(pageCode, 'export'));
  /** 是否有导入权限 */
  const canImport = computed(() => permStore.hasOperation(pageCode, 'import'));
  /** 是否有审批权限 */
  const canApprove = computed(() => permStore.hasOperation(pageCode, 'approve'));

  /**
   * 检查是否有指定字段的查看权限
   * admin 用户始终返回 true
   * 非admin用户：如果该页面没有配置任何字段权限，默认返回 true（表示该页面不需要字段级控制）
   * 如果配置了字段权限但未包含指定字段，返回 false
   */
  const canViewField = (fieldName: string): boolean => {
    return permStore.hasFieldPermission(pageCode, fieldName);
  };

  /**
   * 根据字段权限过滤表格列
   * 传入原始列定义数组，返回过滤后的列定义数组
   * 列的 dataIndex 或 key 与字段名匹配时进行权限检查
   *
   * @param columns 原始列定义数组
   * @param fieldMapping 可选的字段映射 { columnDataIndex: fieldPermissionName }
   */
  const filterColumns = (columns: any[], fieldMapping?: Record<string, string>) => {
    return computed(() => {
      // admin 不过滤
      if (permStore.isAdmin) return columns;

      // 获取该页面的受控字段列表
      const controlledFields = permStore.fieldPermissions[pageCode];
      // 如果该页面没有配置任何字段权限，不过滤（向后兼容）
      if (!controlledFields || controlledFields.length === 0) return columns;

      // 需要字段权限控制的字段名集合（来自该页面已配置的所有字段权限）
      // 用于判断某个列是否需要权限检查
      return columns.filter((col: any) => {
        const colKey = col.dataIndex || col.key;
        const fieldName = fieldMapping?.[colKey] || colKey;

        // 检查这个字段是否是受控字段
        // 如果不是受控字段（即 permission 表中没有为该页面配置该字段的 field 权限），直接显示
        // 如果是受控字段，则检查用户是否拥有该字段权限
        const isControlledField = _isFieldControlled(pageCode, fieldName);
        if (!isControlledField) return true;

        // 是受控字段，检查用户是否有权限
        return controlledFields.includes(fieldName);
      });
    });
  };

  /**
   * 内部辅助：判断某字段是否是受控字段
   * 通过检查 permissionCodes 中是否存在对应的 field permission code
   */
  const _isFieldControlled = (pCode: string, fieldName: string): boolean => {
    // 受控字段列表 = permission 表中该页面所有 field 类型的权限
    // 这些信息在 permissionCodes 中以 {pageCode}:field:{fieldName} 格式存在
    // 但我们无法直接获取"所有已配置的字段权限"，因为非admin用户可能没有被分配
    // 所以我们采用硬编码方式列出所有可能的受控字段
    const CONTROLLED_FIELDS: Record<string, string[]> = {
      'sales-orders': ['unit_price', 'total_amount'],
      'purchase-orders': ['unit_price', 'total_amount'],
      'outsourcing-orders': ['unit_price', 'total_amount'],
      'shipping-orders': ['unit_price', 'total_amount', 'freight'],
      'stock-ins': ['unit_price', 'total_amount'],
      'sales-prices': ['tax_inclusive_price', 'tax_exclusive_price', 'tax_rate', 'min_price_inclusive', 'min_price_exclusive'],
      'purchase-prices': ['unit_price', 'price'],
      'piece-rate-prices': ['qualified_piece_rate', 'defective_piece_rate'],
      'standard-costs': ['standard_cost', 'actual_cost'],
      'return-orders': ['unit_price', 'total_amount'],
    };
    const fields = CONTROLLED_FIELDS[pCode];
    return fields ? fields.includes(fieldName) : false;
  };

  return {
    canView,
    canCreate,
    canEdit,
    canDelete,
    canExport,
    canImport,
    canApprove,
    canViewField,
    filterColumns
  };
}
