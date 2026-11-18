// Coded values of khen thưởng (reward) and kỷ luật (discipline) decisions. Migration 026
// enforces the same lists with CHECK constraints (src/database/coded-values.spec.ts
// compares them).

// Individual titles and forms of Thông tư 93/2024/TT-BQP (amended by 62/2025/TT-BQP)
export const REWARD_FORMS = [
  'chien_si_thi_dua_toan_quoc',
  'chien_si_thi_dua_toan_quan',
  'chien_si_thi_dua_co_so',
  'chien_si_tien_tien',
  'huan_chuong',
  'huy_chuong',
  'danh_hieu_vinh_du_nha_nuoc',
  'giai_thuong_nha_nuoc',
  'ky_niem_chuong',
  'bang_khen',
  'giay_khen',
] as const;
export type RewardForm = (typeof REWARD_FORMS)[number];

export const REWARD_FORM_LABELS: Record<RewardForm, string> = {
  chien_si_thi_dua_toan_quoc: 'Chiến sĩ thi đua toàn quốc',
  chien_si_thi_dua_toan_quan: 'Chiến sĩ thi đua toàn quân',
  chien_si_thi_dua_co_so: 'Chiến sĩ thi đua cơ sở',
  chien_si_tien_tien: 'Chiến sĩ tiên tiến',
  huan_chuong: 'Huân chương',
  huy_chuong: 'Huy chương',
  danh_hieu_vinh_du_nha_nuoc: 'Danh hiệu vinh dự nhà nước',
  giai_thuong_nha_nuoc: 'Giải thưởng Hồ Chí Minh, Giải thưởng Nhà nước',
  ky_niem_chuong: 'Kỷ niệm chương "Vì sự nghiệp vũ trang quần chúng"',
  bang_khen: 'Bằng khen',
  giay_khen: 'Giấy khen',
};

// Who signs the decision
export const REWARD_AUTHORITIES = [
  'state',
  'prime_minister',
  'ministry_of_defence',
  'ministry_or_province',
  'military_region',
  'provincial_military_command',
  'district',
  'commune',
] as const;
export type RewardAuthority = (typeof REWARD_AUTHORITIES)[number];

export const REWARD_AUTHORITY_LABELS: Record<RewardAuthority, string> = {
  state: 'Chủ tịch nước',
  prime_minister: 'Thủ tướng Chính phủ',
  ministry_of_defence: 'Bộ trưởng Bộ Quốc phòng',
  ministry_or_province: 'Bộ, ban, ngành, tỉnh',
  military_region: 'Thủ trưởng cấp quân khu, quân chủng',
  provincial_military_command:
    'Thủ trưởng Bộ Chỉ huy quân sự, Bộ Chỉ huy Bộ đội biên phòng tỉnh',
  district: 'Chủ tịch UBND cấp huyện',
  commune: 'Chủ tịch UBND cấp xã',
};

// District-level administrations ended with the two-tier local government model
export const DISTRICT_LEVEL_ENDED_ON = '2025-07-01';

// The authorities that confer each form (Thông tư 93/2024/TT-BQP)
export const REWARD_FORM_AUTHORITIES: Record<
  RewardForm,
  readonly RewardAuthority[]
> = {
  chien_si_thi_dua_toan_quoc: ['prime_minister'],
  chien_si_thi_dua_toan_quan: ['ministry_of_defence'],
  chien_si_thi_dua_co_so: [
    'military_region',
    'provincial_military_command',
    'district',
    'commune',
  ],
  chien_si_tien_tien: ['provincial_military_command', 'district', 'commune'],
  huan_chuong: ['state'],
  huy_chuong: ['state'],
  danh_hieu_vinh_du_nha_nuoc: ['state'],
  giai_thuong_nha_nuoc: ['state'],
  ky_niem_chuong: ['ministry_of_defence'],
  bang_khen: [
    'prime_minister',
    'ministry_of_defence',
    'ministry_or_province',
    'military_region',
  ],
  giay_khen: [
    'military_region',
    'provincial_military_command',
    'district',
    'commune',
  ],
};

/** Whether `authority` may confer `form` on a decision dated `issuedDate` (YYYY-MM-DD). */
export function authorityAllowedFor(
  form: RewardForm,
  authority: RewardAuthority,
  issuedDate: string,
): boolean {
  if (!REWARD_FORM_AUTHORITIES[form].includes(authority)) return false;
  // YYYY-MM-DD strings compare in calendar order
  return authority !== 'district' || issuedDate < DISTRICT_LEVEL_ENDED_ON;
}

// What the reward recognises: regular achievement, an exceptional deed, a campaign, or a
// period of service
export const REWARD_BASES = [
  'achievement',
  'ad_hoc',
  'thematic',
  'contribution',
] as const;
export type RewardBasis = (typeof REWARD_BASES)[number];

export const REWARD_BASIS_LABELS: Record<RewardBasis, string> = {
  achievement: 'Thành tích thường xuyên',
  ad_hoc: 'Đột xuất',
  thematic: 'Theo chuyên đề',
  contribution: 'Quá trình cống hiến',
};

// Luật Dân quân tự vệ 2019 Điều 48, Thông tư 75/2020/TT-BQP Điều 8. Giáng chức and cách
// chức apply to command positions only.
export const DISCIPLINE_FORMS = [
  'khien_trach',
  'canh_cao',
  'giang_chuc',
  'cach_chuc',
  'tuoc_danh_hieu',
] as const;
export type DisciplineForm = (typeof DISCIPLINE_FORMS)[number];

export const DISCIPLINE_FORM_LABELS: Record<DisciplineForm, string> = {
  khien_trach: 'Khiển trách',
  canh_cao: 'Cảnh cáo',
  giang_chuc: 'Giáng chức',
  cach_chuc: 'Cách chức',
  tuoc_danh_hieu: 'Tước danh hiệu Dân quân tự vệ',
};

export const DISCIPLINE_STATUSES = [
  'active',
  'appealed',
  'overturned',
] as const;
export type DisciplineStatus = (typeof DISCIPLINE_STATUSES)[number];

export const APPEAL_OUTCOMES = ['upheld', 'overturned'] as const;
export type AppealOutcome = (typeof APPEAL_OUTCOMES)[number];

// Khiếu nại lần đầu and lần hai (Luật Khiếu nại 2011)
export const MAX_APPEAL_ROUNDS = 2;

export { sqlLabelCase } from '../common/sql/sql-label';
