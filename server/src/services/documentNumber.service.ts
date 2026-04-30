/**
 * 单据编号生成服务
 * 从各 Controller 抽取的单据编号生成函数，统一管理
 */
import sequelize from '@/config/database'
import dayjs from 'dayjs'

// ==================== 生产计划编号 ====================

export const generateProductionNumber = async (transaction?: any): Promise<string> => {
  const today = new Date();
  const prefix = 'M' + today.getFullYear() +
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

export const generateOutsourcingReqNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `OSR-${today}-`;
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

export const generateOutsourcingOrderNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `OS-${today}-`;
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

export const generateLinesideTxnNumber = async (transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `LS-${dateStr}-`;

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

export const generateWRNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `WR-${today}-`;
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

export const generateInboundOrderNumber = async (transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `PI-${dateStr}-`;

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

export const generateShippingOrderNumber = async (transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `SM-${dateStr}-`;

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

export const generateOrderNumber = async (transaction?: any): Promise<string> => {
  const today = new Date();
  const prefix = 'P' + today.getFullYear() +
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

export const generateTaskNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `PT-${today}-`;
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

export const generatePrepNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `MP-${today}-`;
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

export const generateForecastNumber = async (transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `SF-${dateStr}-`;

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

export const generateOutsourcingIssueNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `OMI-${today}-`;
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

export const generateOutsourcingReceiptNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `ORC-${today}-`;
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

export const generateOutsourcingInspectionNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `OQI-${today}-`;
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

export const generateOutsourcingSettlementNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `OST-${today}-`;
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

// ==================== 委外回收入库单编号 ====================

export const generateOutsourcingReturnStockinNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `ORS-${today}-`;
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
