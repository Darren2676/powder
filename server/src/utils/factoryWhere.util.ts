/**
 * factoryWhere - 自动为 SQL 查询注入 factory_id 过滤条件
 * 
 * 使用方式：
 *   const { sql, replacements } = factoryWhere(
 *     'SELECT * FROM sales_order WHERE status = @status',
 *     { status: '已审批' },
 *     req.factoryScope
 *   );
 *   const result = await sequelize.query(sql, { replacements });
 */

import { Request } from 'express';
import sequelize from '../config/database';
import { QueryTypes } from 'sequelize';

interface FactoryScope {
  mode: 'all' | 'single';
  factory_id?: number | null;
  filter: boolean;
  accessibleFactories?: number[];
}

interface FactoryWhereResult {
  sql: string;
  replacements: Record<string, any>;
}

/**
 * 从请求对象中获取 factory_id
 */
export function getFactoryId(req: Request): number | null {
  const scope = (req as any).factoryScope as FactoryScope | undefined;
  if (scope && scope.filter && scope.factory_id != null) {
    return scope.factory_id;
  }
  return null;
}

/**
 * 从请求对象中获取 factory_code（用于单据编号前缀）
 * 如宁国工厂返回 'N'，广州工厂返回 'G'
 * 当无工厂绑定或总部全量模式时返回空字符串
 */
export async function getFactoryCode(req: Request): Promise<string> {
  const factoryId = getFactoryId(req);
  if (factoryId === null) return '';
  try {
    const rows: any = await sequelize.query(
      'SELECT factory_code FROM factory WHERE id = :id',
      { replacements: { id: factoryId }, type: QueryTypes.SELECT }
    );
    if (rows.length > 0) return rows[0].factory_code;
  } catch { /* factory表可能未就绪 */ }
  return '';
}

/**
 * 为查询语句自动追加工厂过滤条件
 * @param baseSQL 原始 SQL（使用 @param 参数化）
 * @param replacements 已有的替换参数
 * @param scope factoryScope 中间件注入的作用域
 * @param tableAlias 表别名，默认 't'（如 SELECT ... FROM xxx t）
 */
export function factoryWhere(
  baseSQL: string,
  replacements: Record<string, any> = {},
  scope?: FactoryScope | null,
  tableAlias: string = 't'
): FactoryWhereResult {
  // 无作用域或不过滤，原样返回
  if (!scope || !scope.filter || scope.factory_id == null) {
    return { sql: baseSQL, replacements };
  }

  const factoryIdParam = `_factoryId_${Math.random().toString(36).substring(2, 8)}`;
  const whereClause = `${tableAlias}.factory_id = @${factoryIdParam}`;

  // 查找 WHERE 子句位置
  const upperSQL = baseSQL.toUpperCase();
  const whereIdx = upperSQL.indexOf('WHERE');

  let sql: string;
  if (whereIdx >= 0) {
    // 在已有 WHERE 后追加 AND
    sql = baseSQL.slice(0, whereIdx + 5) + ' ' + whereClause + ' AND ' + baseSQL.slice(whereIdx + 5);
  } else {
    // 查找是否有 GROUP BY / ORDER BY（WHERE 在它们之前）
    const groupByIdx = upperSQL.indexOf('GROUP BY');
    const orderByIdx = upperSQL.indexOf('ORDER BY');
    const insertIdx = groupByIdx >= 0 ? groupByIdx : (orderByIdx >= 0 ? orderByIdx : baseSQL.length);
    
    if (insertIdx < baseSQL.length) {
      sql = baseSQL.slice(0, insertIdx) + ' WHERE ' + whereClause + ' ' + baseSQL.slice(insertIdx);
    } else {
      sql = baseSQL + ' WHERE ' + whereClause;
    }
  }

  return {
    sql,
    replacements: { ...replacements, [factoryIdParam]: scope.factory_id }
  };
}

/**
 * 为 INSERT 语句自动追加 factory_id
 * @param columns 列名列表
 * @param valuesClause VALUES 子句（如 '@val1, @val2'）
 * @param scope factoryScope
 */
export function insertFactoryField(
  columns: string[],
  valuesClause: string,
  scope?: FactoryScope | null
): { columns: string[]; valuesClause: string } {
  if (!scope || !scope.filter || scope.factory_id == null) {
    return { columns, valuesClause };
  }

  return {
    columns: [...columns, 'factory_id'],
    valuesClause: valuesClause + `, ${scope.factory_id}`
  };
}
