/**
 * 业务异常 - Service 层抛出，Controller 层捕获并转换为 HTTP 响应
 */
export class BusinessError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
  }
}
