import { ForbiddenException } from '@nestjs/common';
import { memberScopeSql, resolveMemberScope } from './member-scope';

const STAFF: ReadonlySet<string> = new Set([
  'system_admin',
  'police_ward',
  'office_staff',
  'ca_officer',
]);

describe('resolveMemberScope', () => {
  const assignments = { getAssignedDqtvIds: jest.fn() };

  beforeEach(() => {
    assignments.getAssignedDqtvIds.mockReset();
  });

  const resolve = (
    actor: {
      sub: string;
      role: string;
      roles?: string[];
      unitScope: string | null;
    },
    requestedUnit?: string,
  ) =>
    resolveMemberScope(actor, {
      staffRoles: STAFF,
      assignments,
      requestedUnit,
    });

  it('lets wide staff see every unit or narrow to a requested one', async () => {
    const admin = { sub: 'a', role: 'system_admin', unitScope: null };

    await expect(resolve(admin)).resolves.toEqual({
      unit: null,
      userIds: null,
    });
    await expect(resolve(admin, 'KV1')).resolves.toEqual({
      unit: 'KV1',
      userIds: null,
    });
  });

  it('locks scoped staff to their unit whatever unit they request', async () => {
    const staff = { sub: 's', role: 'office_staff', unitScope: 'KV2' };

    await expect(resolve(staff, 'KV1')).resolves.toEqual({
      unit: 'KV2',
      userIds: null,
    });
  });

  it('limits CA officers to the DQTV assigned to them', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce(['dqtv-1', 'dqtv-2']);
    const officer = { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV1' };

    await expect(resolve(officer)).resolves.toEqual({
      unit: null,
      userIds: ['dqtv-1', 'dqtv-2'],
    });
    expect(assignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
  });

  it('gives a CA officer with no assignment an empty list, which matches nobody', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce([]);

    await expect(
      resolve({ sub: 'ca-1', role: 'ca_officer', unitScope: 'KV1' }),
    ).resolves.toEqual({ unit: null, userIds: [] });
  });

  it('limits DQTV members to their own records', async () => {
    await expect(
      resolve({ sub: 'me', role: 'dqtv', unitScope: null }),
    ).resolves.toEqual({ unit: null, userIds: ['me'] });
    await expect(
      resolve({ sub: 'me', role: 'dqtv_member', unitScope: 'KV1' }),
    ).resolves.toEqual({ unit: null, userIds: ['me'] });
  });

  it('treats a staff role held besides a DQTV primary role as staff', async () => {
    await expect(
      resolve({
        sub: 'x',
        role: 'dqtv',
        roles: ['dqtv', 'police_ward'],
        unitScope: null,
      }),
    ).resolves.toEqual({ unit: null, userIds: null });
  });

  it('refuses any other role', async () => {
    await expect(
      resolve({ sub: 'x', role: 'ubnd_leader', unitScope: null }),
    ).rejects.toThrow(new ForbiddenException('insufficient_role'));
  });
});

describe('memberScopeSql', () => {
  it('filters on the unit code and the owner user id with the given parameters', () => {
    expect(memberScopeSql(3, 4)).toBe(
      '($3::text IS NULL OR u.code = $3) AND ($4::uuid[] IS NULL OR mp.user_id = ANY($4::uuid[]))',
    );
  });

  it('accepts other table aliases', () => {
    expect(memberScopeSql(1, 2, { unit: 'mu', profile: 'm' })).toBe(
      '($1::text IS NULL OR mu.code = $1) AND ($2::uuid[] IS NULL OR m.user_id = ANY($2::uuid[]))',
    );
  });
});
