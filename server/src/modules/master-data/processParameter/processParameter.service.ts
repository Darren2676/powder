import sequelize from '../../../config/database';

// ==================== 编号生成 PP-YYYYMMDD-NNN ====================
export const generateParameterNumber = async (): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `PP-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(parameter_number) as max_num FROM process_parameter_header WHERE parameter_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};
