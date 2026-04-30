/**
 * 语音播报工具
 * 使用 Web Speech API 实现扫码成功/失败的语音播报
 * 支持开关控制
 */

/** 语音开关状态（持久化到 localStorage） */
const SPEECH_ENABLED_KEY = 'mes_speech_enabled'

/** 获取语音开关状态 */
export function getSpeechEnabled(): boolean {
  const val = localStorage.getItem(SPEECH_ENABLED_KEY)
  return val === null ? true : val === 'true'
}

/** 设置语音开关状态 */
export function setSpeechEnabled(enabled: boolean): void {
  localStorage.setItem(SPEECH_ENABLED_KEY, String(enabled))
}

/** 切换语音开关 */
export function toggleSpeech(): boolean {
  const newVal = !getSpeechEnabled()
  setSpeechEnabled(newVal)
  return newVal
}

/** 检查浏览器是否支持语音合成 */
export function isSpeechSupported(): boolean {
  return 'speechSynthesis' in window
}

/** 播报文本 */
export function speak(text: string, options?: {
  rate?: number
  pitch?: number
  volume?: number
}): void {
  if (!isSpeechSupported()) return
  if (!getSpeechEnabled()) return

  // 取消之前的播报
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = options?.rate ?? 1.2
  utterance.pitch = options?.pitch ?? 1.0
  utterance.volume = options?.volume ?? 1.0

  window.speechSynthesis.speak(utterance)
}

/** 播报扫码成功 */
export function speakScanSuccess(itemName?: string): void {
  const text = itemName ? `${itemName}，扫码成功` : '扫码成功'
  speak(text, { rate: 1.3 })
}

/** 播报扫码失败 */
export function speakScanFailed(reason?: string): void {
  const text = reason ? `${reason}，扫码失败` : '扫码失败，请重试'
  speak(text, { rate: 1.2, pitch: 0.9 })
}

/** 播报操作成功 */
export function speakSuccess(message: string): void {
  speak(message, { rate: 1.2 })
}

/** 播报警告 */
export function speakWarning(message: string): void {
  speak(message, { rate: 1.1, pitch: 1.1 })
}
