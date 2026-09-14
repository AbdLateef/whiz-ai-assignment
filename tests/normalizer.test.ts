import {
  normalizePhone,
  extractEmailDomain,
  normalizeStatus,
  parseDate,
  normalizeNames
} from '../src/utils/normalizer';

describe('Normalizer Utilities', () => {
  test('normalizePhone strips non-digits correctly', () => {
    expect(normalizePhone('+86 138 2424 7912')).toBe('8613824247912');
    expect(normalizePhone('46704602383')).toBe('46704602383');
    expect(normalizePhone('+1 323 555 0192')).toBe('13235550192');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  test('extractEmailDomain extracts domain in lowercase', () => {
    expect(extractEmailDomain('y.aina@singhlogistics.io')).toBe('singhlogistics.io');
    expect(extractEmailDomain('JOOND@HUANGANALYTICS.CO')).toBe('huanganalytics.co');
    expect(extractEmailDomain('invalid-email')).toBeNull();
    expect(extractEmailDomain(null)).toBeNull();
  });

  test('normalizeStatus standardizes status values', () => {
    expect(normalizeStatus(' Qualified ')).toBe('Qualified');
    expect(normalizeStatus('CLOSED WON')).toBe('Closed Won');
    expect(normalizeStatus('new')).toBe('New');
    expect(normalizeStatus('Opportunity')).toBe('Opportunity');
    expect(normalizeStatus(null)).toBe('New');
  });

  test('parseDate handles various date string formats', () => {
    const d1 = parseDate('12/21/2025');
    expect(d1?.getUTCFullYear()).toBe(2025);
    expect(d1?.getUTCMonth()).toBe(11); // 0-indexed December = 11

    const d2 = parseDate('2026-05-24');
    expect(d2?.getFullYear()).toBe(2026);

    const d3 = parseDate('2025-10-27T00:00:00Z');
    expect(d3?.toISOString()).toBe('2025-10-27T00:00:00.000Z');

    expect(parseDate(null)).toBeNull();
  });

  test('normalizeNames handles missing first/last or full name', () => {
    const res1 = normalizeNames(null, null, 'J. Diallo');
    expect(res1.firstName).toBe('J.');
    expect(res1.lastName).toBe('Diallo');
    expect(res1.fullName).toBe('J. Diallo');

    const res2 = normalizeNames('Yuki', 'Aina', null);
    expect(res2.fullName).toBe('Yuki Aina');
  });
});
