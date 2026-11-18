import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { InventoryQueryDto, RecordInventoryDto } from './record-inventory.dto';

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

const W1 = '1b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';
const W2 = '2b6f3c1e-3a53-4f4f-9d1a-6c1c2f7f1a01';

describe('RecordInventoryDto', () => {
  it('accepts the body the web form sends and trims the notes', async () => {
    await expect(
      validate(RecordInventoryDto, { confirmedCount: 12, notes: '  Đủ  ' }),
    ).resolves.toEqual({ confirmedCount: 12, notes: 'Đủ' });
  });

  it('accepts a count without notes, and item-level results', async () => {
    const body = {
      confirmedCount: 1,
      items: [
        { weaponId: W1, found: true, observedCondition: 'damaged' },
        { weaponId: W2, found: false },
      ],
    };

    await expect(validate(RecordInventoryDto, body)).resolves.toEqual(body);
  });

  it.each([
    ['no count', {}],
    ['a negative count', { confirmedCount: -1 }],
    ['a fractional count', { confirmedCount: 1.5 }],
    ['a count as text', { confirmedCount: '12' }],
    [
      'notes over 2000 characters',
      { confirmedCount: 1, notes: 'x'.repeat(2001) },
    ],
    [
      'the same weapon twice',
      {
        confirmedCount: 2,
        items: [
          { weaponId: W1, found: true },
          { weaponId: W1, found: true },
        ],
      },
    ],
    [
      'a malformed weapon id',
      { confirmedCount: 1, items: [{ weaponId: 'w1', found: true }] },
    ],
    [
      'an unknown condition',
      {
        confirmedCount: 1,
        items: [{ weaponId: W1, found: true, observedCondition: 'lost' }],
      },
    ],
    ['an unknown property', { confirmedCount: 1, expectedCount: 1 }],
  ])('refuses %s', async (_label, body) => {
    await expect(validate(RecordInventoryDto, body)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('InventoryQueryDto', () => {
  it('reads blank dates as absent and refuses malformed ones', async () => {
    await expect(
      validate(InventoryQueryDto, { from: '', to: '2026-09-14' }, 'query'),
    ).resolves.toEqual({ to: '2026-09-14' });
    await expect(
      validate(InventoryQueryDto, { from: '14/09/2026' }, 'query'),
    ).rejects.toThrow(BadRequestException);
  });
});
