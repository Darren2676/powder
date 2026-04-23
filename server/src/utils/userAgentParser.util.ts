/**
 * 解析 User-Agent 字符串，提取设备类型和设备ID
 */

interface ParsedUA {
  device_type: string;   // 电脑 | 手机 | 平板 | 未知
  device_id: string;     // 例如: Windows 10_CHROME14_14
}

/**
 * 从 User-Agent 中提取操作系统信息
 */
function parseOS(ua: string): string {
  if (!ua) return '未知';

  // Windows
  const winMatch = ua.match(/Windows NT (\d+\.\d+)/);
  if (winMatch) {
    const winVer: Record<string, string> = {
      '10.0': 'Windows 10',
      '6.3': 'Windows 8.1',
      '6.2': 'Windows 8',
      '6.1': 'Windows 7',
      '6.0': 'Windows Vista',
      '5.1': 'Windows XP',
      '11.0': 'Windows 11',
    };
    // Windows 11 also reports NT 10.0, check for specific markers
    if (winMatch[1] === '10.0') {
      // Check for Windows 11 hint in newer UAs
      if (ua.includes('Windows NT 10.0') && ua.match(/Edg\/\d{3,}/)) {
        // Could be Win 11 but we can't be 100% sure from UA alone
      }
    }
    return winVer[winMatch[1]] || `Windows ${winMatch[1]}`;
  }

  // macOS
  const macMatch = ua.match(/Mac OS X (\d+[._]\d+([._]\d+)?)/);
  if (macMatch) {
    const ver = macMatch[1].replace(/_/g, '.');
    return `macOS ${ver}`;
  }

  // iOS
  const iosMatch = ua.match(/iPhone OS (\d+[._]\d+)/);
  if (iosMatch) {
    return `iOS ${iosMatch[1].replace(/_/g, '.')}`;
  }

  // iPad
  const ipadMatch = ua.match(/iPad.*OS (\d+[._]\d+)/);
  if (ipadMatch) {
    return `iPadOS ${ipadMatch[1].replace(/_/g, '.')}`;
  }

  // Android
  const androidMatch = ua.match(/Android (\d+(\.\d+)?)/);
  if (androidMatch) {
    return `Android ${androidMatch[1]}`;
  }

  // Linux
  if (ua.includes('Linux')) return 'Linux';

  return '未知';
}

/**
 * 从 User-Agent 中提取浏览器信息
 */
function parseBrowser(ua: string): { name: string; version: string } {
  if (!ua) return { name: '未知', version: '' };

  // 顺序很重要，先检测更具体的浏览器

  // Edge (Chromium)
  const edgMatch = ua.match(/Edg\/(\d+(\.\d+)?)/);
  if (edgMatch) return { name: 'EDGE', version: edgMatch[1] };

  // Opera / OPR
  const oprMatch = ua.match(/OPR\/(\d+(\.\d+)?)/);
  if (oprMatch) return { name: 'OPERA', version: oprMatch[1] };

  // Vivaldi
  const vivaldiMatch = ua.match(/Vivaldi\/(\d+(\.\d+)?)/);
  if (vivaldiMatch) return { name: 'VIVALDI', version: vivaldiMatch[1] };

  // 360 Browser
  if (ua.includes('360SE') || ua.includes('360EE')) {
    return { name: '360', version: '' };
  }

  // QQ Browser
  const qqMatch = ua.match(/QQBrowser\/(\d+(\.\d+)?)/);
  if (qqMatch) return { name: 'QQ', version: qqMatch[1] };

  // WeChat
  const wxMatch = ua.match(/MicroMessenger\/(\d+(\.\d+)?)/);
  if (wxMatch) return { name: 'WECHAT', version: wxMatch[1] };

  // Firefox
  const ffMatch = ua.match(/Firefox\/(\d+(\.\d+)?)/);
  if (ffMatch) return { name: 'FIREFOX', version: ffMatch[1] };

  // Safari (must check before Chrome as Chrome UA includes Safari)
  if (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')) {
    const safariMatch = ua.match(/Version\/(\d+(\.\d+)?)/);
    return { name: 'SAFARI', version: safariMatch ? safariMatch[1] : '' };
  }

  // Chrome
  const chromeMatch = ua.match(/Chrome\/(\d+(\.\d+)?)/);
  if (chromeMatch) return { name: 'CHROME', version: chromeMatch[1] };

  // IE
  const ieMatch = ua.match(/MSIE (\d+(\.\d+)?)/);
  if (ieMatch) return { name: 'IE', version: ieMatch[1] };
  const ie11Match = ua.match(/Trident\/.*rv:(\d+(\.\d+)?)/);
  if (ie11Match) return { name: 'IE', version: ie11Match[1] };

  return { name: '未知', version: '' };
}

/**
 * 判断设备类型
 */
function parseDeviceType(ua: string): string {
  if (!ua) return '未知';
  const uaLower = ua.toLowerCase();

  // 手机
  if (
    uaLower.includes('iphone') ||
    uaLower.includes('android') && uaLower.includes('mobile') ||
    uaLower.includes('windows phone') ||
    uaLower.includes('mobile')
  ) {
    return '手机';
  }

  // 平板
  if (
    uaLower.includes('ipad') ||
    uaLower.includes('android') && !uaLower.includes('mobile') && uaLower.includes('tablet') ||
    uaLower.includes('tablet')
  ) {
    return '平板';
  }

  // Android without mobile could be tablet
  if (uaLower.includes('android') && !uaLower.includes('mobile')) {
    return '平板';
  }

  // 默认电脑
  if (
    uaLower.includes('windows nt') ||
    uaLower.includes('macintosh') ||
    uaLower.includes('mac os x') ||
    uaLower.includes('linux') && !uaLower.includes('android')
  ) {
    return '电脑';
  }

  return '未知';
}

/**
 * 解析 User-Agent 字符串
 */
export function parseUserAgent(ua: string): ParsedUA {
  if (!ua) {
    return { device_type: '未知', device_id: '未知' };
  }

  const deviceType = parseDeviceType(ua);
  const os = parseOS(ua);
  const browser = parseBrowser(ua);

  // 构建设备ID: OS_BROWSER_VERSION 格式
  const browserPart = browser.version
    ? `${browser.name}${browser.version}`
    : browser.name;
  const deviceId = `${os}_${browserPart}`;

  return {
    device_type: deviceType,
    device_id: deviceId
  };
}
