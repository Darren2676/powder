/**
 * 单据编号生成服务
 * 从各 Controller 抽取的单据编号生成函数，统一管理
 *
 * 多工厂编号规则：
 *   横杠格式: TYPE-FC-YYYYMMDD-001（如 SO-N-20260604-001）
 *   紧凑格式: TYPEFCYYYYMMDD001（如 PN20260604005）
 *   FC = factoryCode（N=宁国, G=广州），为空时保持原格式
 */
import sequelize from '@/config/database'
import dayjs from 'dayjs'

// ==================== 生产计划编号 ====================

export const generateProductionNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const prefix = 'M' + fc + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const queryOptions: any = { replacements: { prefix: prefix + '%' } };
  if (transaction) queryOptions.transaction = transaction;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(production_number) as max_num FROM Production_plan WHERE production_number LIKE :prefix`,
    queryOptions
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== 委外申请编号 ====================

export const generateOutsourcingReqNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `OSR${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 outsourcing_req_number FROM outsourcing_req WHERE outsourcing_req_number LIKE :prefix ORDER BY outsourcing_req_number DESC`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].outsourcing_req_number as string;
    const lastSeq = parseInt(last.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 委外订单编号 ====================

export const generateOutsourcingOrderNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `OS${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 outsourcing_order_number FROM outsourcing_order WHERE outsourcing_order_number LIKE :prefix ORDER BY outsourcing_order_number DESC`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].outsourcing_order_number as string;
    const lastSeq = parseInt(last.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 线边事务编号 ====================

export const generateLinesideTxnNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `LS${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(transaction_number) as max_num FROM lineside_inventory_transaction WHERE transaction_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 报工单编号 ====================

export const generateWRNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `WR${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(work_report_number) as max_num FROM work_report WHERE work_report_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 生产入库单编号 ====================

export const generateInboundOrderNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `PI${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(inbound_order_number) as max_num FROM production_inbound_order WHERE inbound_order_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 发货单编号 ====================

export const generateShippingOrderNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `SM${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(shipping_order_number) as max_num FROM shipping_order WHERE shipping_order_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 生产单编号 ====================

export const generateOrderNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const prefix = 'P' + fc + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const [rows]: any = await sequelize.query(
    `SELECT MAX(production_order_number) as max_num FROM production_order WHERE production_order_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== 工序任务编号 ====================

export const generateTaskNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `PT${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(process_task_number) as max_num FROM process_task WHERE process_task_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 备料单编号 ====================

export const generatePrepNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `MP${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(preparation_number) as max_num FROM material_preparation WHERE preparation_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 销售预测编号 ====================

export const generateForecastNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `SF${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(forecast_number) as max_num FROM sales_forecast WHERE forecast_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== 委外发料单编号 ====================

export const generateOutsourcingIssueNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `OMI${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 issue_number FROM outsourcing_material_issue WHERE issue_number LIKE :prefix ORDER BY issue_number DESC`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].issue_number as string;
    const lastSeq = parseInt(last.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 委外收回单编号 ====================

export const generateOutsourcingReceiptNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `ORC${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 receipt_number FROM outsourcing_receipt WHERE receipt_number LIKE :prefix ORDER BY receipt_number DESC`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].receipt_number as string;
    const lastSeq = parseInt(last.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 委外质检单编号 ====================

export const generateOutsourcingInspectionNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `OQI${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 inspection_number FROM outsourcing_inspection WHERE inspection_number LIKE :prefix ORDER BY inspection_number DESC`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].inspection_number as string;
    const lastSeq = parseInt(last.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 委外结算单编号 ====================

export const generateOutsourcingSettlementNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `OST${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 settlement_number FROM outsourcing_settlement WHERE settlement_number LIKE :prefix ORDER BY settlement_number DESC`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].settlement_number as string;
    const lastSeq = parseInt(last.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 倒冲任务编号 ====================

export const generateBackflushTaskNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `BT${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(backflush_task_number) as max_num FROM backflush_task WHERE backflush_task_number LIKE :prefix`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 委外回收入库单编号 ====================

export const generateOutsourcingReturnStockinNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `ORS${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 stockin_number FROM outsourcing_return_stockin WHERE stockin_number LIKE :prefix ORDER BY stockin_number DESC`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].stockin_number as string;
    const lastSeq = parseInt(last.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 半成品生产入库单编号 ====================

export const generateSemiProductionInboundOrderNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `SPIO${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(inbound_order_number) as max_num FROM semi_production_inbound_order WHERE inbound_order_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 样品申请编号 ====================

export const generateSampleRequestNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `SR${fc}-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 request_number FROM sample_request WHERE request_number LIKE :prefix ORDER BY request_number DESC`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows.length > 0) {
    const last = rows[0].request_number as string;
    const lastSeq = parseInt(last.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 仓库编号生成 ====================

/**
 * 仓库类型 → 编码缩写映射
 * 新编码体系: {缩写}-{工厂编码}-{序号}
 */
const WAREHOUSE_TYPE_PREFIX: Record<string, string> = {
  '原材料仓库': 'RM',
  '成品仓库': 'FG',
  '半成品': 'SF',
  '成型件库': 'SF',
  '线边仓': 'WB',
  '线边仓库': 'WB',
  '待检仓': 'QC',
  '报废仓库': 'SC',
  '通用仓库': 'GP',
  '通用仓': 'GP',
};

/**
 * 生成仓库编号（新编码体系）
 * 格式: {类型缩写}-{工厂编码}-{序号}
 * 示例: RM-N-01, FG-G-02
 * 
 * @param factoryCode 工厂编码（N=宁国, G=广州），空字符串表示无工厂绑定
 * @param warehouseType 仓库类型名称（如 '原材料仓库'、'成品仓库'）
 * @param transaction 数据库事务（可选）
 * @returns 生成的仓库编号
 */
export const generateWarehouseNumber = async (factoryCode: string = '', warehouseType: string = '', transaction?: any): Promise<string> => {
  const fc = factoryCode ? factoryCode.toUpperCase() : 'XX';
  const typePrefix = WAREHOUSE_TYPE_PREFIX[warehouseType] || 'WH';
  const prefix = `${typePrefix}-${fc}-`;

  const queryOptions: any = { replacements: { prefix: prefix + '%' } };
  if (transaction) queryOptions.transaction = transaction;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(warehouse_number) as max_num FROM warehouse WHERE warehouse_number LIKE :prefix`,
    queryOptions
  );

  let seq = 1;
  if (rows.length > 0 && rows[0].max_num) {
    const maxNum = rows[0].max_num as string;
    // 提取序号部分 (prefix 后面的数字)
    const lastSeq = parseInt(maxNum.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(2, '0')}`;
};
