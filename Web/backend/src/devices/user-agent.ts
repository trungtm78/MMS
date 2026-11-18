// A readable name for the client behind a session, from its User-Agent header. Only for
// display: the header is whatever the client chose to send.

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export interface DeviceDescription {
  deviceType: DeviceType;
  browser: string | null;
  os: string | null;
  deviceName: string;
}

const UNKNOWN_DEVICE = 'Không xác định';
// The Flutter mobile app sends dart:io's default header
const MOBILE_APP = 'Ứng dụng MMS';
// The product tokens that name a client come first; reading a bounded prefix keeps the
// patterns cheap whatever the header length
const MAX_READ = 512;

const OS_PATTERNS: [RegExp, string][] = [
  [/iPad/, 'iPadOS'],
  [/iPhone|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows NT|Windows Phone/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

// Order matters: Chromium-based browsers also carry "Chrome", and Chrome carries "Safari"
const BROWSER_PATTERNS: [RegExp, string][] = [
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const DESKTOP_OS = new Set(['Windows', 'macOS', 'Linux', 'ChromeOS']);

const firstMatch = (ua: string, patterns: [RegExp, string][]) =>
  patterns.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

function deviceTypeOf(ua: string, os: string | null): DeviceType {
  if (/iPad|Tablet/.test(ua) || (os === 'Android' && !/Mobile/.test(ua))) {
    return 'tablet';
  }
  if (/Mobi|iPhone|iPod|Windows Phone/.test(ua)) return 'mobile';
  return os && DESKTOP_OS.has(os) ? 'desktop' : 'unknown';
}

export function describeUserAgent(
  userAgent: string | null | undefined,
): DeviceDescription {
  const ua = (userAgent ?? '').slice(0, MAX_READ);
  if (/^Dart\//.test(ua)) {
    return {
      deviceType: 'mobile',
      browser: MOBILE_APP,
      os: null,
      deviceName: MOBILE_APP,
    };
  }
  const os = firstMatch(ua, OS_PATTERNS);
  const browser = firstMatch(ua, BROWSER_PATTERNS);
  return {
    deviceType: deviceTypeOf(ua, os),
    browser,
    os,
    deviceName:
      browser && os ? `${browser} – ${os}` : (browser ?? os ?? UNKNOWN_DEVICE),
  };
}
