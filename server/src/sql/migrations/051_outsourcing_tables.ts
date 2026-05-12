import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. 创建委外发料单主表
  await queryInterface.createTable('outsourcing_material_issue', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    issue_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    outsourcing_order_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    issue_date: {
      type: DataTypes.DATE
    },
    warehouse_number: {
      type: DataTypes.STRING(50)
    },
    warehouse_name: {
      type: DataTypes.STRING(100)
    },
    handler: {
      type: DataTypes.STRING(50)
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: '草稿'
    },
    remark: {
      type: DataTypes.STRING(500)
    },
    creation_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    creation_man: {
      type: DataTypes.STRING(50)
    },
    last_update_date: {
      type: DataTypes.DATE
    },
    last_update_man: {
      type: DataTypes.STRING(50)
    }
  });

  // 2. 创建委外发料单明细表
  await queryInterface.createTable('outsourcing_material_issue_detail', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    issue_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    line_number: {
      type: DataTypes.INTEGER
    },
    item_number: {
      type: DataTypes.STRING(50)
    },
    item_name: {
      type: DataTypes.STRING(200)
    },
    specifications: {
      type: DataTypes.STRING(200)
    },
    batch_number: {
      type: DataTypes.STRING(50)
    },
    issued_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    unit: {
      type: DataTypes.STRING(20)
    },
    remark: {
      type: DataTypes.STRING(500)
    }
  });

  // 3. 创建委外收回单主表
  await queryInterface.createTable('outsourcing_receipt', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    receipt_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    outsourcing_order_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    receipt_date: {
      type: DataTypes.DATE
    },
    warehouse_number: {
      type: DataTypes.STRING(50)
    },
    warehouse_name: {
      type: DataTypes.STRING(100)
    },
    handler: {
      type: DataTypes.STRING(50)
    },
    inspection_status: {
      type: DataTypes.STRING(20),
      defaultValue: '待检验'
    },
    inspection_result: {
      type: DataTypes.STRING(20)
    },
    qualified_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    unqualified_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: '草稿'
    },
    remark: {
      type: DataTypes.STRING(500)
    },
    creation_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    creation_man: {
      type: DataTypes.STRING(50)
    },
    last_update_date: {
      type: DataTypes.DATE
    },
    last_update_man: {
      type: DataTypes.STRING(50)
    }
  });

  // 4. 创建委外收回单明细表
  await queryInterface.createTable('outsourcing_receipt_detail', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    receipt_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    line_number: {
      type: DataTypes.INTEGER
    },
    item_number: {
      type: DataTypes.STRING(50)
    },
    item_name: {
      type: DataTypes.STRING(200)
    },
    specifications: {
      type: DataTypes.STRING(200)
    },
    receipt_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    qualified_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    unqualified_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    unit: {
      type: DataTypes.STRING(20)
    },
    remark: {
      type: DataTypes.STRING(500)
    }
  });

  // 5. 创建委外质检记录表
  await queryInterface.createTable('outsourcing_inspection', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    inspection_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    receipt_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    outsourcing_order_number: {
      type: DataTypes.STRING(50)
    },
    inspection_date: {
      type: DataTypes.DATE
    },
    inspector: {
      type: DataTypes.STRING(50)
    },
    inspection_result: {
      type: DataTypes.STRING(20)
    },
    qualified_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    unqualified_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    defect_description: {
      type: DataTypes.STRING(500)
    },
    handling_method: {
      type: DataTypes.STRING(200)
    },
    remark: {
      type: DataTypes.STRING(500)
    },
    creation_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    creation_man: {
      type: DataTypes.STRING(50)
    }
  });

  // 6. 创建委外结算单表
  await queryInterface.createTable('outsourcing_settlement', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    settlement_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    outsourcing_order_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    settlement_date: {
      type: DataTypes.DATE
    },
    settlement_quantity: {
      type: DataTypes.DECIMAL(18, 4)
    },
    unit_price: {
      type: DataTypes.DECIMAL(18, 4)
    },
    total_amount: {
      type: DataTypes.DECIMAL(18, 4)
    },
    tax_rate: {
      type: DataTypes.DECIMAL(5, 2)
    },
    tax_amount: {
      type: DataTypes.DECIMAL(18, 4)
    },
    amount_with_tax: {
      type: DataTypes.DECIMAL(18, 4)
    },
    payment_status: {
      type: DataTypes.STRING(20),
      defaultValue: '未付款'
    },
    paid_amount: {
      type: DataTypes.DECIMAL(18, 4),
      defaultValue: 0
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: '草稿'
    },
    remark: {
      type: DataTypes.STRING(500)
    },
    creation_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    creation_man: {
      type: DataTypes.STRING(50)
    },
    last_update_date: {
      type: DataTypes.DATE
    },
    last_update_man: {
      type: DataTypes.STRING(50)
    }
  });

  // 7. 扩展 outsourcing_order 表字段
  await queryInterface.addColumn('outsourcing_order', 'issued_quantity', {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0
  });

  await queryInterface.addColumn('outsourcing_order', 'received_quantity', {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0
  });

  await queryInterface.addColumn('outsourcing_order', 'qualified_quantity', {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0
  });

  await queryInterface.addColumn('outsourcing_order', 'settlement_quantity', {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0
  });

  await queryInterface.addColumn('outsourcing_order', 'issue_status', {
    type: DataTypes.STRING(20),
    defaultValue: '未发料'
  });

  await queryInterface.addColumn('outsourcing_order', 'receipt_status', {
    type: DataTypes.STRING(20),
    defaultValue: '未收回'
  });

  await queryInterface.addColumn('outsourcing_order', 'settlement_status', {
    type: DataTypes.STRING(20),
    defaultValue: '未结算'
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // 删除扩展字段
  await queryInterface.removeColumn('outsourcing_order', 'settlement_status');
  await queryInterface.removeColumn('outsourcing_order', 'receipt_status');
  await queryInterface.removeColumn('outsourcing_order', 'issue_status');
  await queryInterface.removeColumn('outsourcing_order', 'settlement_quantity');
  await queryInterface.removeColumn('outsourcing_order', 'qualified_quantity');
  await queryInterface.removeColumn('outsourcing_order', 'received_quantity');
  await queryInterface.removeColumn('outsourcing_order', 'issued_quantity');

  // 删除新表
  await queryInterface.dropTable('outsourcing_settlement');
  await queryInterface.dropTable('outsourcing_inspection');
  await queryInterface.dropTable('outsourcing_receipt_detail');
  await queryInterface.dropTable('outsourcing_receipt');
  await queryInterface.dropTable('outsourcing_material_issue_detail');
  await queryInterface.dropTable('outsourcing_material_issue');
}
