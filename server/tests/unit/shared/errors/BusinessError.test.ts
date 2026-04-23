import { describe, it, expect } from 'vitest';
import { BusinessError } from '@/shared/errors/BusinessError';

describe('BusinessError', () => {
  it('should set statusCode and message', () => {
    const error = new BusinessError(400, '参数错误');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BusinessError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('参数错误');
    expect(error.name).toBe('BusinessError');
  });

  it('should support various status codes', () => {
    const notFound = new BusinessError(404, '资源不存在');
    expect(notFound.statusCode).toBe(404);
    expect(notFound.message).toBe('资源不存在');

    const forbidden = new BusinessError(403, '禁止访问');
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.message).toBe('禁止访问');

    const serverError = new BusinessError(500, '服务器内部错误');
    expect(serverError.statusCode).toBe(500);
    expect(serverError.message).toBe('服务器内部错误');
  });

  it('should be distinguishable from regular Error', () => {
    const businessError = new BusinessError(400, '业务异常');
    const regularError = new Error('普通异常');

    expect(businessError instanceof BusinessError).toBe(true);
    expect(regularError instanceof BusinessError).toBe(false);
  });

  it('should be catchable with instanceof check', () => {
    const throwBusiness = () => {
      throw new BusinessError(422, '校验失败');
    };

    try {
      throwBusiness();
    } catch (error: any) {
      expect(error instanceof BusinessError).toBe(true);
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('校验失败');
    }
  });

  it('should preserve stack trace', () => {
    const error = new BusinessError(400, 'test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('BusinessError');
  });
});
