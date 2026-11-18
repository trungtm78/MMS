import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateDisciplineDto,
  CreateRewardDto,
  DecideAppealDto,
  DisciplineQueryDto,
  FileAppealDto,
  RewardQueryDto,
} from './rewards.dto';

// Same options as the global pipe in app.setup.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validate = (
  metatype: new () => object,
  value: unknown,
  type: 'body' | 'query' = 'body',
) => pipe.transform(value, { type, metatype }) as Promise<unknown>;

const MEMBER = '0b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

describe('reward and discipline DTOs', () => {
  describe('CreateRewardDto', () => {
    const valid = {
      militiaId: MEMBER,
      rewardType: 'giay_khen',
      issuingAuthority: 'commune',
      criteria: '  Hoàn thành xuất sắc nhiệm vụ  ',
      issuedDate: '2026-03-15',
    };

    it('accepts a decision and trims its text', async () => {
      await expect(validate(CreateRewardDto, valid)).resolves.toMatchObject({
        ...valid,
        criteria: 'Hoàn thành xuất sắc nhiệm vụ',
      });
    });

    it('accepts the optional basis and decision number', async () => {
      await expect(
        validate(CreateRewardDto, {
          ...valid,
          basis: 'ad_hoc',
          decisionNumber: ' 12/QĐ-UBND ',
        }),
      ).resolves.toMatchObject({
        basis: 'ad_hoc',
        decisionNumber: '12/QĐ-UBND',
      });
    });

    it.each([
      ['a member named instead of identified', { militiaName: 'Nguyễn Văn A' }],
      ['a form label instead of its code', { rewardType: 'Giấy khen' }],
      [
        'an authority label instead of its code',
        { issuingAuthority: 'UBND xã/phường' },
      ],
      ['an impossible date', { issuedDate: '2026-02-30' }],
      ['a malformed member id', { militiaId: 'mp-1' }],
      ['an unknown basis', { basis: 'other' }],
      ['criteria over 2000 characters', { criteria: 'x'.repeat(2001) }],
      [
        'a decision number over 50 characters',
        { decisionNumber: 'x'.repeat(51) },
      ],
    ])('refuses %s', async (_label, change) => {
      await expect(
        validate(CreateRewardDto, { ...valid, ...change }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires the member, form, authority and date', async () => {
      await expect(validate(CreateRewardDto, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('RewardQueryDto', () => {
    it('reads blank filters as absent', async () => {
      await expect(
        validate(
          RewardQueryDto,
          { from: '', to: '', rewardType: '', militiaId: '', unitCode: '' },
          'query',
        ),
      ).resolves.toEqual({});
    });

    it('refuses a malformed date or an unknown form', async () => {
      await expect(
        validate(RewardQueryDto, { from: '2026-13-01' }, 'query'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        validate(RewardQueryDto, { rewardType: 'medal' }, 'query'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CreateDisciplineDto', () => {
    const valid = {
      militiaId: MEMBER,
      disciplineType: 'khien_trach',
      violation: '  Vắng trực không lý do  ',
      decisionDate: '2026-04-02',
    };

    it('accepts a decision and trims its text', async () => {
      await expect(validate(CreateDisciplineDto, valid)).resolves.toMatchObject(
        {
          ...valid,
          violation: 'Vắng trực không lý do',
        },
      );
    });

    it('accepts the optional violation date, decision number and signer', async () => {
      await expect(
        validate(CreateDisciplineDto, {
          ...valid,
          violationDate: '2026-03-30',
          decisionNumber: '05/QĐ-UBND',
          issuedBy: 'Chủ tịch UBND phường',
        }),
      ).resolves.toMatchObject({ violationDate: '2026-03-30' });
    });

    it.each([
      [
        'a form the militia law does not provide',
        { disciplineType: 'ha_cap_bac' },
      ],
      [
        'expulsion, which is not a militia discipline form',
        { disciplineType: 'khai_tru' },
      ],
      ['a blank violation', { violation: '   ' }],
      ['a member named instead of identified', { militiaName: 'Trần Văn B' }],
      ['an impossible decision date', { decisionDate: '2026-04-31' }],
      ['a violation over 2000 characters', { violation: 'x'.repeat(2001) }],
    ])('refuses %s', async (_label, change) => {
      await expect(
        validate(CreateDisciplineDto, { ...valid, ...change }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('DisciplineQueryDto', () => {
    it('filters by status and form codes', async () => {
      await expect(
        validate(
          DisciplineQueryDto,
          { status: 'appealed', disciplineType: 'canh_cao' },
          'query',
        ),
      ).resolves.toEqual({ status: 'appealed', disciplineType: 'canh_cao' });
      await expect(
        validate(DisciplineQueryDto, { status: 'revoked' }, 'query'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('FileAppealDto', () => {
    it('requires the grounds of the appeal', async () => {
      await expect(validate(FileAppealDto, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(validate(FileAppealDto, { reason: '  ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts grounds with an optional filing date', async () => {
      await expect(
        validate(FileAppealDto, {
          reason: ' Quyết định chưa xét tình tiết giảm nhẹ ',
          filedDate: '2026-04-05',
        }),
      ).resolves.toEqual({
        reason: 'Quyết định chưa xét tình tiết giảm nhẹ',
        filedDate: '2026-04-05',
      });
    });
  });

  describe('DecideAppealDto', () => {
    it('requires an outcome and the resolution text', async () => {
      await expect(
        validate(DecideAppealDto, {
          outcome: 'overturned',
          resolution: ' Hủy quyết định kỷ luật ',
        }),
      ).resolves.toEqual({
        outcome: 'overturned',
        resolution: 'Hủy quyết định kỷ luật',
      });
      await expect(
        validate(DecideAppealDto, { outcome: 'partly', resolution: 'x' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        validate(DecideAppealDto, { outcome: 'upheld' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
