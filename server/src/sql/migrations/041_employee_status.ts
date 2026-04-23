import { QueryInterface } from 'sequelize';

export default {
  name: '041_employee_status',
  async up(queryInterface: QueryInterface, sequelize: any) {
    const db = queryInterface.sequelize;

    // 检查 employee 表是否存在 status 列
    const [cols]: any = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employee' AND COLUMN_NAME = 'status'`
    );

    if (cols.length === 0) {
      await db.query(
        `ALTER TABLE [employee] ADD [status] NVARCHAR(20) NOT NULL DEFAULT N'未激活'`
      );
      console.log('[Migration 041] Added status column to employee table');
    } else {
      console.log('[Migration 041] status column already exists in employee table, skipping');
    }
  }
};
