/**
 * 迁移092：创建退料单表 material_return + material_return_detail
 * 
 * 支持部分退料场景：领料后因生产异常，将部分物料退回仓库。
 * 退料单独立于领料单，保留领料记录的同时冲减库存和成本。
 */

import { DataTypes } from 'sequelize';

export default {
  async up(queryInterface: any): Promise<void> {
    // 退料单主表
    await queryInterface.createTable('material_return', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      return_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '退料单编号: MR-YYYYMMDD-NNN',
      },
      production_order_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '生产单编号',
      },
      preparation_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '备料单编号',
      },
      issue_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '关联的领料单编号',
      },
      return_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '已退料',
        comment: '退料状态',
      },
      total_return_items: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '退料明细行数',
      },
      remark: {
        type: DataTypes.STRING(500),
      },
      creation_date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      creation_man: {
        type: DataTypes.STRING(50),
      },
    });

    // 退料单明细表
    await queryInterface.createTable('material_return_detail', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      return_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '退料单编号',
      },
      line_number: {
        type: DataTypes.INTEGER,
        comment: '行号',
      },
      material_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '物料编号',
      },
      material_name: {
        type: DataTypes.STRING(200),
        comment: '物料名称',
      },
      material_type: {
        type: DataTypes.STRING(50),
        comment: '物料类型',
      },
      unit: {
        type: DataTypes.STRING(20),
        comment: '单位',
      },
      return_quantity: {
        type: DataTypes.DECIMAL(18, 4),
        allowNull: false,
        comment: '退料数量(正数)',
      },
      batch_number: {
        type: DataTypes.STRING(50),
        comment: '批次号',
      },
      step_number: {
        type: DataTypes.INTEGER,
        comment: '工序号',
      },
      work_center_name: {
        type: DataTypes.STRING(100),
        comment: '工作中心',
      },
      default_warehouse: {
        type: DataTypes.STRING(30),
        comment: '退回仓库',
      },
      remark: {
        type: DataTypes.STRING(500),
      },
    });

    // 索引
    await queryInterface.addIndex('material_return', ['production_order_number'], {
      name: 'idx_mr_production_order',
    });
    await queryInterface.addIndex('material_return', ['issue_number'], {
      name: 'idx_mr_issue_number',
    });
    await queryInterface.addIndex('material_return_detail', ['return_number'], {
      name: 'idx_mrd_return_number',
    });

    console.log('[Migration 092] material_return + material_return_detail 表创建成功');
  },

  async down(queryInterface: any): Promise<void> {
    await queryInterface.dropTable('material_return_detail');
    await queryInterface.dropTable('material_return');
    console.log('[Migration 092] material_return 相关表已删除');
  },
};
