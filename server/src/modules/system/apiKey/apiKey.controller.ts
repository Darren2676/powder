import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success, error } from '../../../utils/response.util';
import { generateApiKeyValue } from '../../../middleware/apiKeyAuth.middleware';

// 列出所有API Key（脱敏显示）
export const getApiKeys = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`
      SELECT id, key_name, client_name, description,
             perm_order_read, perm_order_write,
             perm_work_report_read, perm_work_report_write,
             perm_prep_read, perm_prep_write,
             perm_bom_read, perm_bom_write,
             is_active, rate_limit, allowed_ips, expires_at,
             last_used_at, created_by, created_at, updated_at,
             CASE WHEN LEN(api_key) > 8 THEN LEFT(api_key, 4) + '****' + RIGHT(api_key, 4) ELSE '****' END as api_key_masked
      FROM api_key
      ORDER BY created_at DESC
    `);
    res.json(success(items, '获取API密钥列表成功'));
  } catch (err) { next(err); }
};

// 创建API Key
export const createApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const user = (req as any).user;

    if (!b.key_name || !b.client_name) {
      return res.status(400).json(error('密钥名称和客户端名称不能为空', 400));
    }

    const { apiKey, secretHash } = generateApiKeyValue();

    await sequelize.query(`
      INSERT INTO api_key (key_name, api_key, secret_hash, client_name, description,
        perm_order_read, perm_order_write, perm_work_report_read, perm_work_report_write,
        perm_prep_read, perm_prep_write, perm_bom_read, perm_bom_write,
        is_active, rate_limit, allowed_ips, expires_at, created_by)
      VALUES (:key_name, :api_key, :secret_hash, :client_name, :description,
        :perm_order_read, :perm_order_write, :perm_work_report_read, :perm_work_report_write,
        :perm_prep_read, :perm_prep_write, :perm_bom_read, :perm_bom_write,
        :is_active, :rate_limit, :allowed_ips, :expires_at, :created_by)
    `, {
      replacements: {
        key_name: b.key_name,
        api_key: apiKey,
        secret_hash: secretHash,
        client_name: b.client_name,
        description: b.description || '',
        perm_order_read: b.perm_order_read ? 1 : 0,
        perm_order_write: b.perm_order_write ? 1 : 0,
        perm_work_report_read: b.perm_work_report_read ? 1 : 0,
        perm_work_report_write: b.perm_work_report_write ? 1 : 0,
        perm_prep_read: b.perm_prep_read ? 1 : 0,
        perm_prep_write: b.perm_prep_write ? 1 : 0,
        perm_bom_read: b.perm_bom_read ? 1 : 0,
        perm_bom_write: b.perm_bom_write ? 1 : 0,
        is_active: b.is_active !== false ? 1 : 0,
        rate_limit: b.rate_limit || 100,
        allowed_ips: b.allowed_ips || null,
        expires_at: b.expires_at || null,
        created_by: user?.username || 'admin'
      }
    });

    // 创建成功后返回完整密钥（仅此一次）
    res.json(success({ api_key: apiKey, key_name: b.key_name }, 'API密钥创建成功，请妥善保管，密钥仅显示一次'));
  } catch (err) { next(err); }
};

// 更新API Key
export const updateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(`SELECT id FROM api_key WHERE id = :id`, { replacements: { id: parseInt(id as string) } });
    if (chk.length === 0) {
      return res.status(404).json(error('API密钥不存在', 404));
    }

    await sequelize.query(`
      UPDATE api_key SET
        key_name = :key_name, client_name = :client_name, description = :description,
        perm_order_read = :perm_order_read, perm_order_write = :perm_order_write,
        perm_work_report_read = :perm_work_report_read, perm_work_report_write = :perm_work_report_write,
        perm_prep_read = :perm_prep_read, perm_prep_write = :perm_prep_write,
        perm_bom_read = :perm_bom_read, perm_bom_write = :perm_bom_write,
        is_active = :is_active, rate_limit = :rate_limit, allowed_ips = :allowed_ips,
        expires_at = :expires_at, updated_at = GETDATE()
      WHERE id = :id
    `, {
      replacements: {
        id: parseInt(id as string),
        key_name: b.key_name || chk[0].key_name,
        client_name: b.client_name || chk[0].client_name,
        description: b.description !== undefined ? b.description : chk[0].description,
        perm_order_read: b.perm_order_read ? 1 : 0,
        perm_order_write: b.perm_order_write ? 1 : 0,
        perm_work_report_read: b.perm_work_report_read ? 1 : 0,
        perm_work_report_write: b.perm_work_report_write ? 1 : 0,
        perm_prep_read: b.perm_prep_read ? 1 : 0,
        perm_prep_write: b.perm_prep_write ? 1 : 0,
        perm_bom_read: b.perm_bom_read ? 1 : 0,
        perm_bom_write: b.perm_bom_write ? 1 : 0,
        is_active: b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1,
        rate_limit: b.rate_limit || 100,
        allowed_ips: b.allowed_ips || null,
        expires_at: b.expires_at || null
      }
    });

    res.json(success(null, 'API密钥更新成功'));
  } catch (err) { next(err); }
};

// 删除API Key
export const deleteApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT id FROM api_key WHERE id = :id`, { replacements: { id: parseInt(id as string) } });
    if (chk.length === 0) {
      return res.status(404).json(error('API密钥不存在', 404));
    }
    await sequelize.query(`DELETE FROM api_key WHERE id = :id`, { replacements: { id: parseInt(id as string) } });
    res.json(success(null, 'API密钥删除成功'));
  } catch (err) { next(err); }
};

// 重新生成密钥
export const regenerateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT id FROM api_key WHERE id = :id`, { replacements: { id: parseInt(id as string) } });
    if (chk.length === 0) {
      return res.status(404).json(error('API密钥不存在', 404));
    }

    const { apiKey, secretHash } = generateApiKeyValue();
    await sequelize.query(`
      UPDATE api_key SET api_key = :api_key, secret_hash = :secret_hash, updated_at = GETDATE() WHERE id = :id
    `, { replacements: { id: parseInt(id as string), api_key: apiKey, secret_hash: secretHash } });

    res.json(success({ api_key: apiKey }, '密钥已重新生成，请妥善保管，旧密钥已失效'));
  } catch (err) { next(err); }
};

// 查询调用日志
export const getApiKeyUsage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM api_key_usage_log WHERE api_key_id = :id`,
      { replacements: { id: parseInt(id as string) } }
    );
    const total = countResult[0].total;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT id, api_key_id, endpoint, method, status_code, ip_address, response_time, created_at,
               ROW_NUMBER() OVER (ORDER BY created_at DESC) AS _row_num
        FROM api_key_usage_log WHERE api_key_id = :id
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { id: parseInt(id as string), offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取调用日志成功'));
  } catch (err) { next(err); }
};

// 调用统计
export const getApiKeyStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 最近7天每天调用量
    const [daily]: any = await sequelize.query(`
      SELECT CONVERT(VARCHAR(10), created_at, 120) as date, COUNT(*) as count,
             AVG(response_time) as avg_response_time
      FROM api_key_usage_log
      WHERE api_key_id = :id AND created_at >= DATEADD(day, -7, GETDATE())
      GROUP BY CONVERT(VARCHAR(10), created_at, 120)
      ORDER BY date DESC
    `, { replacements: { id: parseInt(id as string) } });

    // 按端点统计
    const [byEndpoint]: any = await sequelize.query(`
      SELECT TOP 20 endpoint, COUNT(*) as count,
             AVG(response_time) as avg_response_time
      FROM api_key_usage_log
      WHERE api_key_id = :id AND created_at >= DATEADD(day, -7, GETDATE())
      GROUP BY endpoint
      ORDER BY count DESC
    `, { replacements: { id: parseInt(id as string) } });

    // 错误率
    const [errorRate]: any = await sequelize.query(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count
      FROM api_key_usage_log
      WHERE api_key_id = :id AND created_at >= DATEADD(day, -7, GETDATE())
    `, { replacements: { id: parseInt(id as string) } });

    res.json(success({
      daily,
      byEndpoint,
      summary: {
        total_requests: errorRate[0]?.total_requests || 0,
        error_count: errorRate[0]?.error_count || 0,
        error_rate: errorRate[0]?.total_requests > 0
          ? ((errorRate[0].error_count / errorRate[0].total_requests) * 100).toFixed(2) + '%'
          : '0%'
      }
    }, '获取调用统计成功'));
  } catch (err) { next(err); }
};
