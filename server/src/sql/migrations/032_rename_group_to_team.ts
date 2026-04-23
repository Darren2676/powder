import sequelize from '../../config/database';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 1. 重命名表 [group] → [team]
    try {
      await sequelize.query(`EXEC sp_rename 'group', 'team'`);
      console.log('表重命名: [group] → [team] 完成');
    } catch (e: any) {
      console.log('表重命名跳过（可能已重命名）:', e.message);
    }

    // 2. 重命名 team 表列: group_number → team_number
    try {
      await sequelize.query(`EXEC sp_rename 'team.group_number', 'team_number', 'COLUMN'`);
      console.log('列重命名: team.group_number → team_number 完成');
    } catch (e: any) {
      console.log('列重命名 team.group_number 跳过:', e.message);
    }

    // 3. 重命名 team 表列: group_name → team_name
    try {
      await sequelize.query(`EXEC sp_rename 'team.group_name', 'team_name', 'COLUMN'`);
      console.log('列重命名: team.group_name → team_name 完成');
    } catch (e: any) {
      console.log('列重命名 team.group_name 跳过:', e.message);
    }

    // 4. 重命名 work_report 表列: group_number → team_number
    try {
      await sequelize.query(`EXEC sp_rename 'work_report.group_number', 'team_number', 'COLUMN'`);
      console.log('列重命名: work_report.group_number → team_number 完成');
    } catch (e: any) {
      console.log('列重命名 work_report.group_number 跳过:', e.message);
    }

    // 5. 重命名 work_report 表列: group_name → team_name
    try {
      await sequelize.query(`EXEC sp_rename 'work_report.group_name', 'team_name', 'COLUMN'`);
      console.log('列重命名: work_report.group_name → team_name 完成');
    } catch (e: any) {
      console.log('列重命名 work_report.group_name 跳过:', e.message);
    }

    // 验证
    const [teamCols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'team' ORDER BY ORDINAL_POSITION`
    );
    console.log('\n[team] 表列:', teamCols.map((c: any) => c.COLUMN_NAME).join(', '));

    const [wrCols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'work_report' AND COLUMN_NAME IN ('team_number', 'team_name')`
    );
    console.log('work_report 表新列:', wrCols.map((c: any) => c.COLUMN_NAME).join(', '));

    console.log('\n迁移完成');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
