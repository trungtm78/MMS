// Human-readable record codes (SOS-20261001-7KQ2XM): prefix, Vietnamese business day and a
// random suffix, drawn again while the database already holds the code
import { InternalServerErrorException } from '@nestjs/common';
import {
  useUtcServerClock,
  VN_1_OCTOBER_0130,
} from '../../../test/support/clock';
import {
  RECORD_CODE_ALPHABET,
  generateRecordCode,
  insertWithRecordCode,
} from './record-code';

describe('generateRecordCode', () => {
  useUtcServerClock(VN_1_OCTOBER_0130);

  it('stamps the Vietnamese business day and six random characters', () => {
    expect(generateRecordCode('SOS')).toMatch(
      /^SOS-20261001-[0-9A-HJKMNP-TV-Z]{6}$/,
    );
  });

  it('maps random bytes onto the Crockford base32 alphabet evenly', () => {
    const bytes = Buffer.from([0, 31, 32, 255, 64, 10]);

    expect(generateRecordCode('TASK', () => bytes)).toBe(
      `TASK-20261001-${RECORD_CODE_ALPHABET[0]}${RECORD_CODE_ALPHABET[31]}${RECORD_CODE_ALPHABET[0]}${RECORD_CODE_ALPHABET[31]}${RECORD_CODE_ALPHABET[0]}${RECORD_CODE_ALPHABET[10]}`,
    );
    expect(RECORD_CODE_ALPHABET).toHaveLength(32);
    expect(RECORD_CODE_ALPHABET).not.toMatch(/[ILOU]/);
  });

  it.each(['', 'sos', 'S0S', 'TOO-LONG'])('refuses the prefix %p', (prefix) => {
    expect(() => generateRecordCode(prefix)).toThrow(/record code prefix/i);
  });
});

describe('insertWithRecordCode', () => {
  useUtcServerClock(VN_1_OCTOBER_0130);

  it('returns the first insert that got its code', async () => {
    const insert = jest
      .fn<Promise<{ id: string } | null>, [string]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'row-1' });

    await expect(insertWithRecordCode('SOS', insert)).resolves.toEqual({
      id: 'row-1',
    });

    expect(insert).toHaveBeenCalledTimes(2);
    const [[first], [second]] = insert.mock.calls;
    expect(first).toMatch(/^SOS-20261001-/);
    expect(second).not.toBe(first);
  });

  it('gives up after five taken codes instead of looping', async () => {
    const insert = jest
      .fn<Promise<{ id: string } | null>, [string]>()
      .mockResolvedValue(null);

    await expect(insertWithRecordCode('SOS', insert)).rejects.toThrow(
      new InternalServerErrorException('record_code_exhausted'),
    );
    expect(insert).toHaveBeenCalledTimes(5);
  });
});
