import { describeUserAgent } from './user-agent';

describe('describeUserAgent', () => {
  it.each<[string, string | null, ReturnType<typeof describeUserAgent>]>([
    [
      'Chrome on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      {
        deviceType: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
        deviceName: 'Chrome – Windows',
      },
    ],
    [
      'Edge on Windows (not Chrome)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
      {
        deviceType: 'desktop',
        browser: 'Edge',
        os: 'Windows',
        deviceName: 'Edge – Windows',
      },
    ],
    [
      'Safari on macOS (not Chrome)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      {
        deviceType: 'desktop',
        browser: 'Safari',
        os: 'macOS',
        deviceName: 'Safari – macOS',
      },
    ],
    [
      'Firefox on Linux',
      'Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0',
      {
        deviceType: 'desktop',
        browser: 'Firefox',
        os: 'Linux',
        deviceName: 'Firefox – Linux',
      },
    ],
    [
      'Chrome on an Android phone',
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      {
        deviceType: 'mobile',
        browser: 'Chrome',
        os: 'Android',
        deviceName: 'Chrome – Android',
      },
    ],
    [
      'Samsung Internet on an Android tablet',
      'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36',
      {
        deviceType: 'tablet',
        browser: 'Samsung Internet',
        os: 'Android',
        deviceName: 'Samsung Internet – Android',
      },
    ],
    [
      'Safari on an iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      {
        deviceType: 'mobile',
        browser: 'Safari',
        os: 'iOS',
        deviceName: 'Safari – iOS',
      },
    ],
    [
      'Safari on an iPad',
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      {
        deviceType: 'tablet',
        browser: 'Safari',
        os: 'iPadOS',
        deviceName: 'Safari – iPadOS',
      },
    ],
    [
      'the Flutter mobile app',
      'Dart/3.5 (dart:io)',
      {
        deviceType: 'mobile',
        browser: 'Ứng dụng MMS',
        os: null,
        deviceName: 'Ứng dụng MMS',
      },
    ],
    [
      'an unknown client',
      'curl/8.9.1',
      {
        deviceType: 'unknown',
        browser: null,
        os: null,
        deviceName: 'Không xác định',
      },
    ],
    [
      'no user agent',
      null,
      {
        deviceType: 'unknown',
        browser: null,
        os: null,
        deviceName: 'Không xác định',
      },
    ],
  ])('describes %s', (_label, userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toEqual(expected);
  });

  it('does not choke on a very long header', () => {
    expect(describeUserAgent('A'.repeat(100_000)).deviceType).toBe('unknown');
  });
});
