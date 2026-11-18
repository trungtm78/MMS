import { ForbiddenException } from '@nestjs/common';
import {
  grantsReach,
  memberScopeSql,
  resolveMemberGrants,
  resolveMemberScope,
} from './member-scope';

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

// Each role held grants what it grants whatever its priority: the actor reaches the union
describe('resolveMemberGrants', () => {
  const assignments = { getAssignedDqtvIds: jest.fn() };
  const AREA_STAFF: ReadonlySet<string> = new Set([
    ...STAFF,
    'police_area',
    'ca_area',
  ]);

  beforeEach(() => {
    assignments.getAssignedDqtvIds.mockReset();
  });

  const grantsOf = (
    actor: {
      sub: string;
      role: string;
      roles?: string[];
      unitScope: string | null;
    },
    requestedUnit?: string,
  ) =>
    resolveMemberGrants(actor, {
      staffRoles: AREA_STAFF,
      assignments,
      requestedUnit,
    });

  it('gives a holder of a unit role and ca_officer both their unit and their assigned DQTV', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce(['dqtv-1']);
    const actor = {
      sub: 'u-1',
      role: 'police_area',
      roles: ['police_area', 'ca_officer'],
      unitScope: 'KV1',
    };

    await expect(grantsOf(actor)).resolves.toEqual([
      { unit: 'KV1', userIds: null },
      { unit: null, userIds: ['dqtv-1'] },
    ]);
    expect(assignments.getAssignedDqtvIds).toHaveBeenCalledWith('u-1');
  });

  it('does not depend on which role is the primary one', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValue(['dqtv-1']);
    const roles = ['police_area', 'ca_officer'];

    const asArea = await grantsOf({
      sub: 'u-1',
      role: 'police_area',
      roles,
      unitScope: 'KV1',
    });
    const asOfficer = await grantsOf({
      sub: 'u-1',
      role: 'ca_officer',
      roles,
      unitScope: 'KV1',
    });

    expect(asOfficer).toEqual(asArea);
  });

  it('keeps a CA officer alone to the DQTV assigned to them', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce([]);

    await expect(
      grantsOf({ sub: 'ca-1', role: 'ca_officer', unitScope: 'KV1' }),
    ).resolves.toEqual([{ unit: null, userIds: [] }]);
  });

  it('follows effectiveUnit for the unit grant', async () => {
    await expect(
      grantsOf({ sub: 'a', role: 'system_admin', unitScope: null }, 'KV3'),
    ).resolves.toEqual([{ unit: 'KV3', userIds: null }]);
    await expect(
      grantsOf({ sub: 'w', role: 'police_ward', unitScope: null }),
    ).resolves.toEqual([{ unit: null, userIds: null }]);
    await expect(
      grantsOf({ sub: 's', role: 'office_staff', unitScope: 'KV2' }, 'KV1'),
    ).resolves.toEqual([{ unit: 'KV2', userIds: null }]);
  });

  it('gives a DQTV member only themselves', async () => {
    await expect(
      grantsOf({ sub: 'd-1', role: 'dqtv', unitScope: 'KV1' }),
    ).resolves.toEqual([{ unit: null, userIds: ['d-1'] }]);
  });

  // An area role without a unit scope grants nothing through the unit, never everything
  it('grants nothing through an area role without a unit scope, keeping the other grants', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce(['dqtv-1']);

    await expect(
      grantsOf({
        sub: 'u-1',
        role: 'police_area',
        roles: ['police_area', 'ca_officer'],
        unitScope: null,
      }),
    ).resolves.toEqual([{ unit: null, userIds: ['dqtv-1'] }]);
    await expect(
      grantsOf({ sub: 'u-2', role: 'police_area', unitScope: null }),
    ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
  });

  it('refuses an actor none of whose roles grants anything', async () => {
    await expect(
      grantsOf({ sub: 'x', role: 'ubnd_leader', unitScope: null }),
    ).rejects.toThrow(new ForbiddenException('insufficient_role'));
  });
});

describe('grantsReach', () => {
  const grants = [
    { unit: 'KV1', userIds: null },
    { unit: null, userIds: ['dqtv-9'] },
  ];

  it('reaches a record any one grant covers', () => {
    expect(grantsReach(grants, { unitCode: 'KV1', ownerId: 'x' })).toBe(true);
    expect(grantsReach(grants, { unitCode: 'KV7', ownerId: 'dqtv-9' })).toBe(
      true,
    );
  });

  it('misses a record no grant covers, and an ownerless one outside the unit', () => {
    expect(grantsReach(grants, { unitCode: 'KV7', ownerId: 'x' })).toBe(false);
    expect(grantsReach(grants, { unitCode: 'KV7', ownerId: null })).toBe(false);
    expect(grantsReach([], { unitCode: 'KV1', ownerId: 'x' })).toBe(false);
  });

  it('requires both the unit and the owner of a grant naming both', () => {
    const both = [{ unit: 'KV1', userIds: ['a'] }];
    expect(grantsReach(both, { unitCode: 'KV1', ownerId: 'a' })).toBe(true);
    expect(grantsReach(both, { unitCode: 'KV2', ownerId: 'a' })).toBe(false);
    expect(grantsReach(both, { unitCode: 'KV1', ownerId: 'b' })).toBe(false);
  });
});
