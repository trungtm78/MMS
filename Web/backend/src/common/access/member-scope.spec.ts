import { ForbiddenException } from '@nestjs/common';
import {
  memberReachOf,
  memberReachSql,
  reachIncludes,
  resolveMemberGrants,
  resolveMemberReach,
  unitGrantOf,
} from './member-scope';

const STAFF: ReadonlySet<string> = new Set([
  'system_admin',
  'police_ward',
  'office_staff',
  'ca_officer',
]);

type Actor = {
  sub: string;
  role: string;
  roles?: string[];
  unitScope: string | null;
};

// The union of what every role held grants, in the one shape the SQL helpers take
describe('resolveMemberReach', () => {
  const assignments = { getAssignedDqtvIds: jest.fn() };

  beforeEach(() => {
    assignments.getAssignedDqtvIds.mockReset();
  });

  const resolve = (actor: Actor, requestedUnit?: string) =>
    resolveMemberReach(actor, {
      staffRoles: STAFF,
      assignments,
      requestedUnit,
    });

  it('lets wide staff see every unit or narrow to a requested one', async () => {
    const admin = { sub: 'a', role: 'system_admin', unitScope: null };

    await expect(resolve(admin)).resolves.toEqual({
      everyone: true,
      unit: null,
      userIds: null,
    });
    await expect(resolve(admin, 'KV1')).resolves.toEqual({
      everyone: false,
      unit: 'KV1',
      userIds: null,
    });
  });

  it('locks scoped staff to their unit whatever unit they request', async () => {
    const staff = { sub: 's', role: 'office_staff', unitScope: 'KV2' };

    await expect(resolve(staff, 'KV1')).resolves.toEqual({
      everyone: false,
      unit: 'KV2',
      userIds: null,
    });
  });

  it('limits CA officers to the DQTV assigned to them', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce(['dqtv-1', 'dqtv-2']);
    const officer = { sub: 'ca-1', role: 'ca_officer', unitScope: 'KV1' };

    await expect(resolve(officer)).resolves.toEqual({
      everyone: false,
      unit: null,
      userIds: ['dqtv-1', 'dqtv-2'],
    });
    expect(assignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
  });

  it('gives a CA officer with no assignment an empty list, which matches nobody', async () => {
    assignments.getAssignedDqtvIds.mockResolvedValueOnce([]);

    await expect(
      resolve({ sub: 'ca-1', role: 'ca_officer', unitScope: 'KV1' }),
    ).resolves.toEqual({ everyone: false, unit: null, userIds: [] });
  });

  it('limits DQTV members to their own records', async () => {
    await expect(
      resolve({ sub: 'me', role: 'dqtv', unitScope: null }),
    ).resolves.toEqual({ everyone: false, unit: null, userIds: ['me'] });
    await expect(
      resolve({ sub: 'me', role: 'dqtv_member', unitScope: 'KV1' }),
    ).resolves.toEqual({ everyone: false, unit: null, userIds: ['me'] });
  });

  it('adds the staff grant of a staff role held besides a DQTV primary role', async () => {
    await expect(
      resolve({
        sub: 'x',
        role: 'dqtv',
        roles: ['dqtv', 'police_ward'],
        unitScope: null,
      }),
    ).resolves.toEqual({ everyone: true, unit: null, userIds: ['x'] });
  });

  it.each(['police_area', 'ca_officer'])(
    'unites the unit of a unit role and the DQTV of ca_officer (primary %s)',
    async (primary) => {
      assignments.getAssignedDqtvIds.mockResolvedValueOnce(['dqtv-1']);

      await expect(
        resolveMemberReach(
          {
            sub: 'u-1',
            role: primary,
            roles: ['police_area', 'ca_officer'],
            unitScope: 'KV1',
          },
          {
            staffRoles: new Set([...STAFF, 'police_area']),
            assignments,
          },
        ),
      ).resolves.toEqual({ everyone: false, unit: 'KV1', userIds: ['dqtv-1'] });
    },
  );

  // police_area is no staff role here: held beside ca_officer it grants nothing more
  it.each(['police_area', 'ca_officer'])(
    'gives police_area with ca_officer only what ca_officer grants where police_area reads nothing (primary %s)',
    async (primary) => {
      assignments.getAssignedDqtvIds.mockResolvedValueOnce(['dqtv-1']);

      await expect(
        resolve({
          sub: 'u-1',
          role: primary,
          roles: ['police_area', 'ca_officer'],
          unitScope: 'KV1',
        }),
      ).resolves.toEqual({ everyone: false, unit: null, userIds: ['dqtv-1'] });
    },
  );

  it('refuses any other role', async () => {
    await expect(
      resolve({ sub: 'x', role: 'ubnd_leader', unitScope: null }),
    ).rejects.toThrow(new ForbiddenException('insufficient_role'));
  });
});

describe('memberReachOf', () => {
  it('collapses grants into one reach, merging member lists', () => {
    expect(
      memberReachOf([
        { unit: 'KV1', userIds: null },
        { unit: null, userIds: ['a', 'b'] },
        { unit: null, userIds: ['b', 'c'] },
      ]),
    ).toEqual({ everyone: false, unit: 'KV1', userIds: ['a', 'b', 'c'] });
    expect(memberReachOf([{ unit: null, userIds: null }])).toEqual({
      everyone: true,
      unit: null,
      userIds: null,
    });
    expect(memberReachOf([])).toEqual({
      everyone: false,
      unit: null,
      userIds: null,
    });
  });
});

// The GPS room of a connected user follows the unit grant (gps-rooms.ts)
describe('unitGrantOf', () => {
  const unitOf = (actor: Actor, requested?: string) =>
    unitGrantOf(actor, STAFF, requested);

  it('gives wide staff every unit, or the one requested', () => {
    expect(unitOf({ sub: 'a', role: 'system_admin', unitScope: 'KV1' })).toBe(
      null,
    );
    expect(
      unitOf({ sub: 'a', role: 'system_admin', unitScope: null }, 'KV3'),
    ).toBe('KV3');
  });

  it('gives scoped staff their unit', () => {
    expect(unitOf({ sub: 's', role: 'office_staff', unitScope: 'KV2' })).toBe(
      'KV2',
    );
  });

  it('grants no unit through ca_officer, DQTV or an area role without a scope', () => {
    expect(
      unitOf({ sub: 'c', role: 'ca_officer', unitScope: 'KV1' }),
    ).toBeUndefined();
    expect(
      unitOf({ sub: 'd', role: 'dqtv', unitScope: 'KV1' }),
    ).toBeUndefined();
    expect(
      unitGrantOf(
        { role: 'police_area', unitScope: null },
        new Set(['police_area']),
      ),
    ).toBeUndefined();
  });

  it('takes the unit role held beside a primary ca_officer role', () => {
    expect(
      unitGrantOf(
        {
          role: 'ca_officer',
          roles: ['police_area', 'ca_officer'],
          unitScope: 'KV1',
        },
        new Set(['police_area', 'ca_officer']),
      ),
    ).toBe('KV1');
  });
});

describe('reachIncludes', () => {
  const reach = { everyone: false, unit: 'KV1', userIds: ['dqtv-9'] };

  it('includes a record any part of the reach covers', () => {
    expect(reachIncludes(reach, { unitCode: 'KV1', ownerId: 'x' })).toBe(true);
    expect(reachIncludes(reach, { unitCode: 'KV7', ownerId: 'dqtv-9' })).toBe(
      true,
    );
    expect(
      reachIncludes(
        { everyone: true, unit: null, userIds: null },
        { unitCode: 'KV7', ownerId: null },
      ),
    ).toBe(true);
  });

  it('excludes a record nothing covers, and an ownerless one outside the unit', () => {
    expect(reachIncludes(reach, { unitCode: 'KV7', ownerId: 'x' })).toBe(false);
    expect(reachIncludes(reach, { unitCode: 'KV7', ownerId: null })).toBe(
      false,
    );
    expect(
      reachIncludes(
        { everyone: false, unit: null, userIds: null },
        { unitCode: 'KV1', ownerId: 'x' },
      ),
    ).toBe(false);
  });
});

describe('memberReachSql', () => {
  it('ORs every member, the unit code and the owner ids, with the given placeholders', () => {
    expect(memberReachSql({ everyone: '$3', unit: '$4', userIds: '$5' })).toBe(
      '($3::boolean OR ($4::text IS NOT NULL AND u.code = $4) OR ($5::uuid[] IS NOT NULL AND mp.user_id = ANY($5::uuid[])))',
    );
  });

  it('accepts other table aliases', () => {
    expect(
      memberReachSql(
        { everyone: '$1', unit: '$2', userIds: '$3' },
        { unit: 'mu', profile: 'm' },
      ),
    ).toBe(
      '($1::boolean OR ($2::text IS NOT NULL AND mu.code = $2) OR ($3::uuid[] IS NOT NULL AND m.user_id = ANY($3::uuid[])))',
    );
  });
});

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
