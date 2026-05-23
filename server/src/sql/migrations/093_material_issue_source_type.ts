/**
 * 迁移093：material_issue 表增加 source_type 字段
 * 
 * 用于区分正常领料和补料：
 * - '领料'（默认）：正常领料
 * - '补料'：因生产需要再次领料
 */

import { DataTypes } from 'sequelize';

export default {
  async up(queryInterface: any): Promise<void> {
    // 检查字段是否已存在
    const [columns]: any = await queryInterface.sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'material_issue' AND COLUMN_NAME = 'source_type'`
    );

    if (columns.length === 0) {
      await queryInterface.addColumn('material_issue', 'source_type', {
        type: DataTypes.STRING(20),
        defaultValue: '领料',
        comment: '来源类型: 领料/补料',
      });
      console.log('[Migration 093] material_issue.source_type 字段已添加');
    } else {
      console.log('[Migration 093] material_issue.source_type 字段已存在，跳过');
    }
  },

  async down(queryInterface: any): Promise<void> {
    await queryInterface.removeColumn('material_issue', 'source_type');
    console.log('[Migration 093] material_issue.source_type 字段已删除');
  },
};
