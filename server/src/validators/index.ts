import { Request, Response, NextFunction } from 'express';

/**
 * 字段校验规则
 */
interface FieldRule {
  field: string;
  label: string;
  required?: boolean;
  type?: 'string' | 'number' | 'email';
  minLength?: number;
  maxLength?: number;
}

/**
 * 通用请求校验中间件工厂
 * 根据 rules 校验 req.body 中的字段，失败返回 400
 */
export function validateBody(rules: FieldRule[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];

    for (const rule of rules) {
      const value = req.body[rule.field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.label}不能为空`);
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      if (rule.type === 'number' && isNaN(Number(value))) {
        errors.push(`${rule.label}必须为数字`);
      }

      if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        errors.push(`${rule.label}格式不正确`);
      }

      if (rule.minLength && String(value).length < rule.minLength) {
        errors.push(`${rule.label}长度不能少于${rule.minLength}个字符`);
      }

      if (rule.maxLength && String(value).length > rule.maxLength) {
        errors.push(`${rule.label}长度不能超过${rule.maxLength}个字符`);
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('; ') });
      return;
    }

    next();
  };
}

/**
 * 校验分页参数中间件
 */
export function validatePagination(req: Request, res: Response, next: NextFunction) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  if (page < 1) {
    res.status(400).json({ success: false, message: 'page 必须 >= 1' });
    return;
  }
  if (limit < 1 || limit > 200) {
    res.status(400).json({ success: false, message: 'limit 必须在 1-200 之间' });
    return;
  }

  next();
}
