// SMS 短信服务 - 预留接口 (stub)
// 后续可对接阿里云短信、腾讯云短信等服务

export interface SmsResult {
  success: boolean;
  message: string;
}

export async function sendVerificationCode(phone: string, code: string): Promise<SmsResult> {
  // TODO: 对接实际短信服务商 API
  console.log(`[SMS Stub] 发送验证码 ${code} 到手机号 ${phone}`);
  return {
    success: true,
    message: '验证码发送成功（测试模式）'
  };
}

export function generateVerificationCode(length: number = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}
