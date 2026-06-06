import sequelize from '../../../config/database';
import dayjs from 'dayjs';
import { getFactoryCode } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================
export const generateSampleBomNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `SB${fc}-${today}-`;
  const opts: any = { replacements: { prefix: `${prefix}%` } };
  if (transaction) opts.transaction = transaction;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 sample_bom_number FROM sample_bom_header WHERE sample_bom_number LIKE :prefix ORDER BY sample_bom_number DESC`,
    opts
  );
  let seq = 1;
  if (rows.length > 0) {
    const lastSeq = parseInt(rows[0].sample_bom_number.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

export const generateInspectionReportNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `SIR${fc}-${today}-`;
  const opts: any = { replacements: { prefix: `${prefix}%` } };
  if (transaction) opts.transaction = transaction;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 report_number FROM sample_inspection_report WHERE report_number LIKE :prefix ORDER BY report_number DESC`,
    opts
  );
  let seq = 1;
  if (rows.length > 0) {
    const lastSeq = parseInt(rows[0].report_number.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 状态常量 ====================
export const BOM_STATUS = {
  TRIAL: '试制中',
  DETERMINED: '已确定',
  IMPORTED: '已导入',
} as const;

export const VERSION_STATUS = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  INSPECTED: '已检测',
} as const;

export const REPORT_STATUS = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
} as const;
