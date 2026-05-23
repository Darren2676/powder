/**
 * 迁移091：创建生产单材料成本快照表
 * 
 * 将材料成本从实时查询模式改为领料时快照写入模式。
 * 领料时在事务中写入标准成本单价快照，后续查询直接读快照表。
 * 
 * 场景保障：
 * - 正常领料：INSERT 快照行
 * - 多次领料(补料)：INSERT 新快照行
 * - 领料撤回：DELETE 该 issue_number 快照行
 * - 标准成本表更新：不影响已有快照，历史成本锁定
 */

import { DataTypes } from 'sequelize';

export default {
  async up(queryInterface: any): Promise<void> {
    await queryInterface.createTable('production_material_cost_snapshot', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      snapshot_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '快照编号: MCS-YYYYMMDD-NNN',
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
        comment: '领料单编号',
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
      issued_quantity: {
        type: DataTypes.DECIMAL(18, 4),
        allowNull: false,
        comment: '领料数量',
      },
      standard_cost: {
        type: DataTypes.DECIMAL(18, 4),
        comment: '快照时的标准成本单价',
      },
      material_cost: {
        type: DataTypes.DECIMAL(18, 4),
        comment: '= issued_quantity × standard_cost',
      },
      cost_list_number: {
        type: DataTypes.STRING(30),
        comment: '快照时的成本表编号',
      },
      cost_list_name: {
        type: DataTypes.STRING(100),
        comment: '快照时的成本表名称',
      },
      has_cost: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否有定价',
      },
      step_number: {
        type: DataTypes.INTEGER,
        comment: '工序号',
      },
      work_center_name: {
        type: DataTypes.STRING(100),
        comment: '工作中心',
      },
      source_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '领料',
        comment: '来源类型: 领料/补料/退料',
      },
      source_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: '来源单号(领料单号/退料单号)',
      },
      creation_date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      creation_man: {
        type: DataTypes.STRING(50),
      },
      remark: {
        type: DataTypes.STRING(500),
      },
    });

    // 创建索引
    await queryInterface.addIndex('production_material_cost_snapshot', ['production_order_number'], {
      name: 'idx_pmcs_production_order',
    });
    await queryInterface.addIndex('production_material_cost_snapshot', ['issue_number'], {
      name: 'idx_pmcs_issue_number',
    });
    await queryInterface.addIndex('production_material_cost_snapshot', ['source_type', 'source_number'], {
      name: 'idx_pmcs_source',
    });

    console.log('[Migration 091] production_material_cost_snapshot 表创建成功');
  },

  async down(queryInterface: any): Promise<void> {
    await queryInterface.dropTable('production_material_cost_snapshot');
    console.log('[Migration 091] production_material_cost_snapshot 表已删除');
  },
};
