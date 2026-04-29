import sequelize from './config/database';

async function update() {
  try {
    await sequelize.query(
      `UPDATE permission SET permission_name = N'发货按订单汇总表' WHERE permission_code = 'shipping-by-order-summary'`
    );
    console.log('菜单名称已更新为：发货按订单汇总表');
    process.exit(0);
  } catch (err) {
    console.error('更新失败:', err);
    process.exit(1);
  }
}

update();
