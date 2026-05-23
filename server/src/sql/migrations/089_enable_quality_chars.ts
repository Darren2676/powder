import sequelize from '../../config/database';

/**
 * 迁移：来料检验质量特性启用字段
 * - item_master 添加 enable_quality_chars (物料级控制)
 * - incoming_inspect_plan 添加 enable_quality_chars (方案级控制)
 * - purchase_quality_inspection 添加 enable_quality_chars (检验单级)
 * - 兼容回填：已有检验规范的物料自动设为 'Y'
 */
export async function up() {
  // 1. item_master 添加 enable_quality_chars
  try {
    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'enable_quality_chars'`
    );
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE item_master ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N'`);
      console.log('[迁移089] item_master.enable_quality_chars 已添加');
    } else {
      console.log('[迁移089] item_master.enable_quality_chars 已存在，跳过');
    }
  } catch (e: any) { console.log('[迁移089] item_master 跳过:', e.message); }

  // 2. incoming_inspect_plan 添加 enable_quality_chars
  try {
    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'incoming_inspect_plan' AND COLUMN_NAME = 'enable_quality_chars'`
    );
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE incoming_inspect_plan ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N'`);
      console.log('[迁移089] incoming_inspect_plan.enable_quality_chars 已添加');
    } else {
      console.log('[迁移089] incoming_inspect_plan.enable_quality_chars 已存在，跳过');
    }
  } catch (e: any) { console.log('[迁移089] incoming_inspect_plan 跳过:', e.message); }

  // 3. purchase_quality_inspection 添加 enable_quality_chars
  try {
    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'purchase_quality_inspection' AND COLUMN_NAME = 'enable_quality_chars'`
    );
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE purchase_quality_inspection ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N'`);
      console.log('[迁移089] purchase_quality_inspection.enable_quality_chars 已添加');
    } else {
      console.log('[迁移089] purchase_quality_inspection.enable_quality_chars 已存在，跳过');
    }
  } catch (e: any) { console.log('[迁移089] purchase_quality_inspection 跳过:', e.message); }

  // 4. 兼容回填：已有检验规范的物料自动启用质量特性
  try {
    await sequelize.query(`
      UPDATE item_master SET enable_quality_chars = N'Y'
      WHERE item_number IN (SELECT spec_name FROM incoming_inspect_spec)
        AND ISNULL(enable_quality_chars, N'N') = N'N'
    `);
    console.log('[迁移089] item_master 兼容回填完成');
  } catch (e: any) { console.log('[迁移089] item_master 回填跳过:', e.message); }

  // 5. 兼容回填：已有检验方案的自动启用
  try {
    await sequelize.query(`
      UPDATE p SET enable_quality_chars = N'Y'
      FROM incoming_inspect_plan p
      INNER JOIN incoming_inspect_spec s ON p.plan_name = s.spec_name
      WHERE ISNULL(p.enable_quality_chars, N'N') = N'N'
    `);
    console.log('[迁移089] incoming_inspect_plan 兼容回填完成');
  } catch (e: any) { console.log('[迁移089] incoming_inspect_plan 回填跳过:', e.message); }

  // 6. 兼容回填：已有检验单（有明细行的）自动启用
  try {
    await sequelize.query(`
      UPDATE pq SET enable_quality_chars = N'Y'
      FROM purchase_quality_inspection pq
      WHERE EXISTS (
        SELECT 1 FROM purchase_quality_inspection_detail d
        WHERE d.inspection_number = pq.inspection_number
      ) AND ISNULL(pq.enable_quality_chars, N'N') = N'N'
    `);
    console.log('[迁移089] purchase_quality_inspection 兼容回填完成');
  } catch (e: any) { console.log('[迁移089] purchase_quality_inspection 回填跳过:', e.message); }
}

export async function down() {
  try { await sequelize.query(`ALTER TABLE purchase_quality_inspection DROP COLUMN IF EXISTS enable_quality_chars`); } catch {}
  try { await sequelize.query(`ALTER TABLE incoming_inspect_plan DROP COLUMN IF EXISTS enable_quality_chars`); } catch {}
  try { await sequelize.query(`ALTER TABLE item_master DROP COLUMN IF EXISTS enable_quality_chars`); } catch {}
  console.log('[迁移089] 回滚完成');
}
