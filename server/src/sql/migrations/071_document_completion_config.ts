import sequelize from '../../config/database';

/**
 * 071: 单据自动完成配置表 + production_order.completion_status
 * 1. 创建 document_completion_config 配置表
 * 2. 插入三种单据类型的默认种子数据
 * 3. production_order 新增 completion_status 列
 */
export async function runMigration(): Promise<void> {
  // ========== 1. 创建 document_completion_config 表 ==========
  const [tableCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'document_completion_config'`
  );
  if (tableCheck[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE document_completion_config (
        id INT IDENTITY(1,1) PRIMARY KEY,
        document_type NVARCHAR(50) NOT NULL,
        document_type_name NVARCHAR(100) NOT NULL,
        enabled BIT NOT NULL DEFAULT 1,
        conditions NVARCHAR(MAX) NOT NULL,
        tolerance_pct DECIMAL(5,2) DEFAULT 0,
        completion_status NVARCHAR(50) NOT NULL,
        description NVARCHAR(500) DEFAULT '',
        updated_by NVARCHAR(100) DEFAULT '',
        updated_at DATETIME DEFAULT GETDATE(),
        created_at DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_doc_comp_doc_type UNIQUE(document_type)
      )
    `);
    console.log('  ✓ document_completion_config 表已创建');
  } else {
    console.log('  → document_completion_config 表已存在，跳过');
  }

  // ========== 2. 插入默认种子数据 ==========
  const salesConditions = JSON.stringify([
    { field: 'shipping_status', operator: 'in', value: ['全部发货', '超额发货'], scope: 'detail', required: true, label: '所有明细行已全部发货' }
  ]);
  const productionConditions = JSON.stringify([
    { field: 'plan_status', operator: 'equals', value: '已完成', scope: 'header', required: true, label: '生产状态=已完成' },
    { field: 'inbound_status', operator: 'equals', value: '全部入库', scope: 'header', required: true, label: '入库状态=全部入库' }
  ]);
  const purchaseConditions = JSON.stringify([
    { field: 'receive_status', operator: 'equals', value: '已到货', scope: 'detail', required: true, label: '所有明细行已到货' }
  ]);

  const seedData = [
    { document_type: 'sales_order', document_type_name: '销售订单', conditions: salesConditions, completion_status: '已完成', description: '销售订单自动完成条件：所有明细行全部发货' },
    { document_type: 'production_order', document_type_name: '生产订单', conditions: productionConditions, completion_status: '已完成', description: '生产订单自动完成条件：生产状态=已完成 且 入库状态=全部入库' },
    { document_type: 'purchase_order', document_type_name: '采购订单', conditions: purchaseConditions, completion_status: '已完成', description: '采购订单自动完成条件：所有明细行已到货' },
  ];

  for (const seed of seedData) {
    const [exists]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM document_completion_config WHERE document_type = :dt`,
      { replacements: { dt: seed.document_type } }
    );
    if (exists[0].cnt === 0) {
      await sequelize.query(
        `INSERT INTO document_completion_config (document_type, document_type_name, conditions, completion_status, description)
         VALUES (:document_type, :document_type_name, :conditions, :completion_status, :description)`,
        { replacements: seed }
      );
      console.log(`  ✓ 种子数据已插入: ${seed.document_type_name}`);
    } else {
      console.log(`  → 种子数据已存在: ${seed.document_type_name}，跳过`);
    }
  }

  // ========== 3. production_order 新增 completion_status 列 ==========
  const [colCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'completion_status'`
  );
  if (colCheck[0].cnt === 0) {
    await sequelize.query(
      `ALTER TABLE production_order ADD completion_status NVARCHAR(20) DEFAULT N'未完成'`
    );
    console.log('  ✓ production_order.completion_status 已添加');
  } else {
    console.log('  → production_order.completion_status 已存在，跳过');
  }

  console.log('071: 单据自动完成配置迁移完成');
}

runMigration().then(() => process.exit(0)).catch(err => { console.error('071 迁移失败:', err); process.exit(1); });
