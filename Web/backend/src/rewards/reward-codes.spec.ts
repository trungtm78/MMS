import {
  DISCIPLINE_FORM_LABELS,
  DISCIPLINE_FORMS,
  DISTRICT_LEVEL_ENDED_ON,
  REWARD_AUTHORITIES,
  REWARD_AUTHORITY_LABELS,
  REWARD_BASES,
  REWARD_BASIS_LABELS,
  REWARD_FORM_AUTHORITIES,
  REWARD_FORM_LABELS,
  REWARD_FORMS,
  authorityAllowedFor,
  sqlLabelCase,
} from './reward-codes';

describe('reward and discipline codes', () => {
  // Luật DQTV 2019 Điều 48, Thông tư 75/2020/TT-BQP Điều 8
  it('lists the discipline forms the militia law provides, and only those', () => {
    expect([...DISCIPLINE_FORMS].sort()).toEqual(
      [
        'cach_chuc',
        'canh_cao',
        'giang_chuc',
        'khien_trach',
        'tuoc_danh_hieu',
      ].sort(),
    );
  });

  it('labels every code', () => {
    for (const form of REWARD_FORMS)
      expect(REWARD_FORM_LABELS[form]).toBeTruthy();
    for (const authority of REWARD_AUTHORITIES)
      expect(REWARD_AUTHORITY_LABELS[authority]).toBeTruthy();
    for (const basis of REWARD_BASES)
      expect(REWARD_BASIS_LABELS[basis]).toBeTruthy();
    for (const form of DISCIPLINE_FORMS)
      expect(DISCIPLINE_FORM_LABELS[form]).toBeTruthy();
  });

  it('names at least one known issuing authority for every reward form', () => {
    for (const form of REWARD_FORMS) {
      const authorities = REWARD_FORM_AUTHORITIES[form];
      expect(authorities.length).toBeGreaterThan(0);
      for (const a of authorities) expect(REWARD_AUTHORITIES).toContain(a);
    }
  });

  it('lets district level issue only decisions dated before it ended', () => {
    expect(DISTRICT_LEVEL_ENDED_ON).toBe('2025-07-01');
    expect(authorityAllowedFor('giay_khen', 'district', '2025-06-30')).toBe(
      true,
    );
    expect(authorityAllowedFor('giay_khen', 'district', '2025-07-01')).toBe(
      false,
    );
  });

  it('refuses an authority that does not confer the form', () => {
    expect(authorityAllowedFor('giay_khen', 'commune', '2026-01-01')).toBe(
      true,
    );
    expect(authorityAllowedFor('bang_khen', 'commune', '2026-01-01')).toBe(
      false,
    );
    expect(
      authorityAllowedFor('huan_chuong', 'ministry_of_defence', '2026-01-01'),
    ).toBe(false);
  });
});

describe('sqlLabelCase', () => {
  it('maps codes to labels in SQL and escapes quotes', () => {
    expect(sqlLabelCase('d.form', { a: 'Nhãn A', b: "O'Brien" })).toBe(
      "CASE d.form WHEN 'a' THEN 'Nhãn A' WHEN 'b' THEN 'O''Brien' ELSE d.form END",
    );
  });
});
