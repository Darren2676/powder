// 补充线边仓库存 - 为委外备料出库准备测试数据
const { Sequelize } = require('sequelize');
require('dotenv').config();

const seq = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: 'mssql',
  logging: false,
  dialectOptions: { options: { encrypt: false } }
});

async function run() {
  console.log('补充线边仓库存...');

  // 需要补充的物料列表（从出库单看到的）
  const items = [
    { item_number: '510103-31', item_name: '油封外骨架(涂胶）', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '510103-32', item_name: '油封内骨架（涂胶）', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '510103-33', item_name: 'N7502胶条', qty: 10, wh: '10', wh_name: '车间仓库' },
    { item_number: '710103-81', item_name: '保护套', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '710103-82', item_name: 'VCI防锈包装袋', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '710103-83', item_name: '外纸箱', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '710103-84', item_name: '内纸箱', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '710103-85', item_name: '隔板', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '710103-86', item_name: '托盘', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '710091-87', item_name: '护角', qty: 100, wh: '10', wh_name: '车间仓库' },
    { item_number: '710103-88', item_name: '盖板', qty: 100, wh: '10', wh_name: '车间仓库' },
  ];

  for (const item of items) {
    // 检查 material_batch_inventory 是否已有该物料的批次
    const [existing] = await seq.query(
      `SELECT * FROM material_batch_inventory WHERE item_number = :item_number AND warehouse_number = :wh`,
      { replacements: { item_number: item.item_number, wh: item.wh } }
    );

    if (existing.length > 0) {
      // 更新现有批次库存
      await seq.query(
        `UPDATE material_batch_inventory SET quantity = quantity + :qty, initial_quantity = initial_quantity + :qty WHERE item_number = :item_number AND warehouse_number = :wh`,
        { replacements: { qty: item.qty, item_number: item.item_number, wh: item.wh } }
      );
      console.log(`OK: 更新批次库存 ${item.item_number} +${item.qty}`);
    } else {
      // 查找 item_master 中的规格信息
      const [master] = await seq.query(
        `SELECT specifications, basic_unit FROM item_master WHERE item_number = :item_number`,
        { replacements: { item_number: item.item_number } }
      );
      const spec = master.length > 0 ? master[0].specifications || '' : '';
      const unit = master.length > 0 ? master[0].basic_unit || 'PCS' : 'PCS';

      // 创建新批次
      const batchNo = `TEST-${item.item_number}-${Date.now()}`;
      await seq.query(
        `INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, inbound_date, status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, N'原材料', :spec, :unit, :wh, :wh_name, :qty, :qty, GETDATE(), N'正常', GETDATE(), GETDATE())`,
        { replacements: { batch_number: batchNo, item_number: item.item_number, item_name: item.item_name, spec, unit, wh: item.wh, wh_name: item.wh_name, qty: item.qty } }
      );
      console.log(`OK: 创建批次 ${item.item_number} qty=${item.qty}`);
    }

    // 更新 material_inventory 汇总
    await seq.query(
      `IF EXISTS (SELECT 1 FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :wh)
        UPDATE material_inventory SET quantity = quantity + :qty WHERE item_number = :item_number AND warehouse_number = :wh
      ELSE
        INSERT INTO material_inventory (item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, safety_stock_quantity, creation_date, last_updated) VALUES (:item_number, :item_name, N'原材料', '', 'PCS', :wh, :wh_name, :qty, 0, GETDATE(), GETDATE())`,
      { replacements: { item_number: item.item_number, item_name: item.item_name, wh: item.wh, wh_name: item.wh_name, qty: item.qty } }
    );
    console.log(`OK: 更新汇总 ${item.item_number}`);
  }

  await seq.close();
  console.log('\n库存补充完成!');
}

run().catch(e => { console.error('Failed:', e); process.exit(1); });
