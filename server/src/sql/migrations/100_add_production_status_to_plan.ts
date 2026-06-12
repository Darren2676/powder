import sequelize from '../../config/database';

/**
 * 迁移: Production_plan 表增加 production_status 字段
 * 反映该计划关联生产单的实时生产进度
 */
export async function up() {
  // 1. 添加字段
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Production_plan' AND COLUMN_NAME = 'production_status')
      ALTER TABLE Production_plan ADD production_status NVARCHAR(20) DEFAULT NULL;
  `);

  // 2. 回填历史数据：按 production_number 汇总关联生产单状态
  await sequelize.query(`
    UPDATE pp SET pp.production_status = sub.max_status
    FROM Production_plan pp
    INNER JOIN (
      SELECT po.production_number,
        CASE MAX(CASE po.plan_status
          WHEN N'未开始' THEN 0 WHEN N'已派发' THEN 1 WHEN N'已备料' THEN 2
          WHEN N'生产中' THEN 3 WHEN N'已完成' THEN 4 ELSE -1 END)
        WHEN 0 THEN N'未排产' WHEN 1 THEN N'已排产' WHEN 2 THEN N'已备料'
        WHEN 3 THEN N'生产中' WHEN 4 THEN N'生产完成' ELSE NULL END AS max_status
      FROM production_order po
      WHERE po.approval_status = N'已审批' AND po.plan_status != N'已取消'
      GROUP BY po.production_number
    ) sub ON pp.production_number = sub.production_number;
  `);

  console.log('[迁移] 100 Production_plan 增加 production_status 字段完成');
}

export async function down() {
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Production_plan' AND COLUMN_NAME = 'production_status')
      ALTER TABLE Production_plan DROP COLUMN production_status;
  `);
}
