import axios from 'axios';
import type { AxiosInstance } from 'axios';

/**
 * 新核云开放平台 API 服务
 * 封装 Token 管理（自动获取/缓存/刷新）+ 业务接口调用
 */

const XHY_BASE_URL = process.env.XHY_BASE_URL || 'https://c2.xinheyun.com';
const XHY_APP_KEY = process.env.XHY_APP_KEY || '';
const XHY_APP_SECRET = process.env.XHY_APP_SECRET || '';

// Token 缓存
let cachedToken: string = '';
let tokenExpireAt: number = 0; // 毫秒时间戳

const client: AxiosInstance = axios.create({
  baseURL: XHY_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// ==================== Token 管理 ====================

/**
 * 获取 Access Token（带缓存，过期前5分钟自动刷新）
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  // 提前5分钟刷新
  if (cachedToken && tokenExpireAt > now + 5 * 60 * 1000) {
    return cachedToken;
  }

  if (!XHY_APP_KEY || !XHY_APP_SECRET) {
    throw new Error('新核云 APP_KEY 或 APP_SECRET 未配置，请在 .env 中设置 XHY_APP_KEY 和 XHY_APP_SECRET');
  }

  try {
    const response = await client.post('/api/open/v3/token', {
      body: {
        appKey: XHY_APP_KEY,
        appSecret: XHY_APP_SECRET
      }
    });

    const data = response.data;
    if (data.code !== 0 && data.code !== 200) {
      throw new Error(`新核云认证失败: code=${data.code}, message=${data.message}`);
    }

    const entity = data.data?.entity;
    if (!entity?.accessToken) {
      throw new Error('新核云认证返回数据异常: 缺少 accessToken');
    }

    cachedToken = entity.accessToken;
    // accessTokenExpireIn 为秒数
    tokenExpireAt = now + (entity.accessTokenExpireIn || 7200) * 1000;

    console.log(`[新核云] Token 获取成功, 有效期 ${entity.accessTokenExpireIn}s`);
    return cachedToken;
  } catch (err: any) {
    cachedToken = '';
    tokenExpireAt = 0;
    if (err.response) {
      throw new Error(`新核云认证请求失败: HTTP ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

/**
 * 带认证的 POST 请求
 */
async function authPost(url: string, body: any): Promise<any> {
  const token = await getAccessToken();
  const response = await client.post(url, body, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.data;
}

// ==================== 检验记录接口 ====================

/** 检验记录筛选条件 */
interface InspectConditions {
  code?: { conditionType: string; value: string };
  workOrderNumber?: { conditionType: string; value: string };
  itemCode?: { conditionType: string; value: string };
  itemName?: { conditionType: string; value: string };
  [key: string]: any;
}

/** 分批查询参数 */
interface SearchAfterParams {
  conditions?: InspectConditions;
  sorts?: Array<{ sortOrder: 'ASC' | 'DESC'; sortFieldKey: string }>;
  boundaryIds?: string[];
  length?: number;
}

/** 分批查询响应 */
interface SearchAfterResponse {
  code: number;
  message: string;
  data: {
    entity: {
      list: InspectRecord[];
      boundaryIds: string[];
    };
  };
}

/** 检验记录 */
export interface InspectRecord {
  code: string;                    // 唯一编号
  workOrderNumber: string;         // 生产单编号
  itemCode: string;                // 在制品编号
  itemName: string;                // 在制品名称
  itemType: string;                // 在制品属性
  itemSpecification: any;          // 在制品规格
  categoryId: string;              // 在制品分类
  procedureName: string;           // 工序名称
  inspectType: string;             // 检验类型: NON/SELF/SPECIAL
  inspectMethod: string;           // 检验方法: NONE/HEAD/ALL/SAMPLING/LAST
  jbkInspectPlanName: string;      // 检验方案名称
  jbkInspectStandardName: string;  // 检验规范名称
  operator: number;                // 检验人ID
  jobBookingTime: number;          // 检验时间 (ms时间戳)
  createTime: number;              // 创建时间 (ms时间戳)
  workOrderType: string;           // 生产单类型
  comment: string;                 // 备注
  images: any;                     // 附件
  itemAlbum: any;                  // 物料图
}

/**
 * 分批查询检验记录（单次）
 * @param params 查询参数
 * @returns 分批查询结果
 */
export async function searchAfterInspectRecords(params: SearchAfterParams): Promise<SearchAfterResponse> {
  const body = {
    body: {
      conditions: params.conditions || {},
      sorts: params.sorts || [{ sortOrder: 'DESC', sortFieldKey: 'createTime' }],
      boundaryIds: params.boundaryIds || [],
      length: params.length || 100
    }
  };

  const result = await authPost('/api/open/v3/inspect_job_booking/searchAfter/', body);

  if (result.code !== 0 && result.code !== 200) {
    throw new Error(`新核云查询检验记录失败: code=${result.code}, message=${result.message}`);
  }

  return result;
}

/**
 * 分批遍历所有检验记录（自动翻页）
 * @param conditions 筛选条件
 * @param batchSize 每批数量 (最大500)
 * @param maxRecords 最大获取记录数（安全上限，防止无限循环）
 * @param onBatch 每批回调（可用于实时处理/存储）
 * @returns 全部检验记录
 */
export async function fetchAllInspectRecords(
  conditions?: InspectConditions,
  batchSize: number = 200,
  maxRecords: number = 10000,
  onBatch?: (records: InspectRecord[], batchIndex: number, total: number) => Promise<void> | void
): Promise<{ records: InspectRecord[]; total: number; batches: number }> {
  const allRecords: InspectRecord[] = [];
  let boundaryIds: string[] = [];
  let batchIndex = 0;
  let totalRecords = 0;

  const effectiveBatchSize = Math.min(Math.max(batchSize, 1), 500);

  while (true) {
    batchIndex++;
    console.log(`[新核云] 分批查询检验记录 - 第${batchIndex}批, boundaryIds=${JSON.stringify(boundaryIds).slice(0, 100)}`);

    const result = await searchAfterInspectRecords({
      conditions,
      boundaryIds: boundaryIds.length > 0 ? boundaryIds : [],
      length: effectiveBatchSize
    });

    const entity = result.data.entity || result.data;
    const list = entity.list || [];

    if (list.length === 0) {
      console.log(`[新核云] 第${batchIndex}批返回0条，查询完毕`);
      break;
    }

    allRecords.push(...list);

    if (onBatch) {
      await onBatch(list, batchIndex, allRecords.length);
    }

    console.log(`[新核云] 第${batchIndex}批获取 ${list.length} 条，累计 ${allRecords.length}`);

    // 更新游标
    boundaryIds = entity.boundaryIds || [];

    // 终止条件：达到上限 / 无更多游标 / 返回数量小于请求数量（最后一批）
    if (allRecords.length >= maxRecords) {
      console.log(`[新核云] 已达到最大获取上限 ${maxRecords} 条`);
      break;
    }
    if (boundaryIds.length === 0 || boundaryIds.every(id => !id)) {
      console.log(`[新核云] boundaryIds 为空，查询完毕`);
      break;
    }
    if (list.length < effectiveBatchSize) {
      console.log(`[新核云] 返回数量(${list.length})小于请求数量(${effectiveBatchSize})，查询完毕`);
      break;
    }

    // 防止API限流，每批之间间隔200ms
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { records: allRecords, total: totalRecords, batches: batchIndex };
}

/**
 * 标准查询检验记录（带分页）
 */
export async function queryInspectRecords(params: {
  conditions?: InspectConditions;
  sorts?: Array<{ sortOrder: 'ASC' | 'DESC'; sortFieldKey: string }>;
  start?: number;
  length?: number;
}): Promise<any> {
  const body = {
    body: {
      conditions: params.conditions || {},
      sorts: params.sorts || [{ sortOrder: 'DESC', sortFieldKey: 'createTime' }],
      paging: {
        start: params.start || 0,
        length: Math.min(params.length || 20, 500)
      }
    }
  };

  const result = await authPost('/api/open/v3/inspect_job_booking/query', body);

  if (result.code !== 0 && result.code !== 200) {
    throw new Error(`新核云查询检验记录失败: code=${result.code}, message=${result.message}`);
  }

  return result;
}

// ==================== 检验记录明细行接口 ====================

/** 检验明细行记录 */
export interface InspectLineRecord {
  code: string;                    // 明细行编号
  recordId: string;                // 关联检验记录ID
  recordCode: string;              // 关联检验记录编号
  workOrderNumber: string;         // 生产单编号
  workOrderId: string;             // 生产单ID
  itemCode: string;                // 在制品编号
  itemName: string;                // 在制品名称
  itemType: string;                // 在制品属性
  specification: any;              // 规格
  categoryId: string;              // 分类
  procedureName: string;           // 工序名称
  inspectType: string;             // 检验类型
  inspectMethod: string;           // 检验方法
  jbkInspectPlanName: string;      // 检验方案名称
  lotCarCode: string;              // 批次流转卡编号
  quantity: number;                // 数量
  jobBookingQuantity: number;      // 报工数量
  jbkUnitName: string;             // 单位
  productionUnitName: string;      // 生产单位
  status: string;                  // 状态: QUALIFIED/UN_QUALIFIED
  abandoned: boolean;              // 是否废弃
  defectName: string;              // 缺陷名称
  defectCategoryName: string;      // 缺陷分类
  defectCauseName: string;         // 缺陷原因
  jobBookingTime: number;          // 报工时间 (ms时间戳)
  createTime: number;              // 创建时间 (ms时间戳)
}

/**
 * 标准分页查询检验明细行
 */
export async function queryInspectLines(params: {
  conditions?: any;
  sorts?: Array<{ sortOrder: 'ASC' | 'DESC'; sortFieldKey: string }>;
  start?: number;
  length?: number;
}): Promise<any> {
  const body = {
    body: {
      conditions: params.conditions || {},
      sorts: params.sorts || [{ sortOrder: 'DESC', sortFieldKey: 'createTime' }],
      paging: {
        start: params.start || 0,
        length: Math.min(params.length || 20, 500)
      }
    }
  };

  const result = await authPost('/api/open/v3/inspect_job_booking_line/query', body);

  if (result.code !== 0 && result.code !== 200) {
    throw new Error(`新核云查询检验明细行失败: code=${result.code}, message=${result.message}`);
  }

  return result;
}

/**
 * 分批查询检验明细行（searchAfter 游标式翻页）
 */
export async function searchAfterInspectLines(params: SearchAfterParams): Promise<any> {
  const body = {
    body: {
      conditions: params.conditions || {},
      sorts: params.sorts || [{ sortOrder: 'DESC', sortFieldKey: 'createTime' }],
      boundaryIds: params.boundaryIds || [],
      length: params.length || 100
    }
  };

  const result = await authPost('/api/open/v3/inspect_job_booking_line/searchAfter/', body);

  if (result.code !== 0 && result.code !== 200) {
    throw new Error(`新核云查询检验明细行失败: code=${result.code}, message=${result.message}`);
  }

  return result;
}

/**
 * 分批遍历所有检验明细行（自动翻页）
 */
export async function fetchAllInspectLines(
  conditions?: any,
  batchSize: number = 200,
  maxRecords: number = 50000,
  onBatch?: (records: InspectLineRecord[], batchIndex: number, total: number) => Promise<void> | void
): Promise<{ records: InspectLineRecord[]; total: number; batches: number }> {
  const allRecords: InspectLineRecord[] = [];
  let boundaryIds: string[] = [];
  let batchIndex = 0;

  const effectiveBatchSize = Math.min(Math.max(batchSize, 1), 500);

  while (true) {
    batchIndex++;
    console.log(`[新核云] 分批查询检验明细行 - 第${batchIndex}批`);

    const result = await searchAfterInspectLines({
      conditions,
      boundaryIds: boundaryIds.length > 0 ? boundaryIds : [],
      length: effectiveBatchSize
    });

    const entity = result.data.entity || result.data;
    const list = entity.list || [];

    if (list.length === 0) {
      console.log(`[新核云] 第${batchIndex}批返回0条，查询完毕`);
      break;
    }

    allRecords.push(...list);

    if (onBatch) {
      await onBatch(list, batchIndex, allRecords.length);
    }

    console.log(`[新核云] 第${batchIndex}批获取 ${list.length} 条，累计 ${allRecords.length}`);

    boundaryIds = entity.boundaryIds || [];

    if (allRecords.length >= maxRecords) {
      console.log(`[新核云] 已达到最大获取上限 ${maxRecords} 条`);
      break;
    }
    if (boundaryIds.length === 0 || boundaryIds.every((id: string) => !id)) {
      console.log(`[新核云] boundaryIds 为空，查询完毕`);
      break;
    }
    if (list.length < effectiveBatchSize) {
      console.log(`[新核云] 返回数量(${list.length})小于请求数量(${effectiveBatchSize})，查询完毕`);
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { records: allRecords, total: allRecords.length, batches: batchIndex };
}

// ==================== 库存明细查询接口 ====================

/** 库存明细查询参数 */
export interface InventoryDetailQuery {
  itemCodes?: string[];
  warehouseCodes?: string[];
  warehouseBinCodes?: string[];
  batchCodes?: string[];
  snCodes?: string[];
}

/** 库存明细记录 */
export interface InventoryDetailRecord {
  itemCode: string;
  itemName: string;
  itemSpecification: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseBinCode: string;
  warehouseBinName: string;
  batchCode: string;
  snCode: string;
  quantity: number;
  unitName: string;
  [key: string]: any;
}

/**
 * 查询库存明细
 * @param params 查询参数（物料编码/仓库编码/库位编码/批次号/序列号）
 */
export async function queryInventoryDetail(params: InventoryDetailQuery): Promise<any> {
  const body: Record<string, any> = {};
  if (params.itemCodes && params.itemCodes.length > 0) body.itemCodes = params.itemCodes;
  if (params.warehouseCodes && params.warehouseCodes.length > 0) body.warehouseCodes = params.warehouseCodes;
  if (params.warehouseBinCodes && params.warehouseBinCodes.length > 0) body.warehouseBinCodes = params.warehouseBinCodes;
  if (params.batchCodes && params.batchCodes.length > 0) body.batchCodes = params.batchCodes;
  if (params.snCodes && params.snCodes.length > 0) body.snCodes = params.snCodes;

  const result = await authPost('/api/open/v3/inventory/detail/query', body);

  if (result.code !== 0 && result.code !== 200) {
    throw new Error(`新核云查询库存明细失败: code=${result.code}, message=${result.message}`);
  }

  return result;
}
