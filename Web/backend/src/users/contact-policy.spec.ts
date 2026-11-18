import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { AssignmentsService } from '../assignments/assignments.service';
import { ContactPolicy, contactScopeSql } from './contact-policy';

const mockDs = { query: jest.fn() };
const mockAssignments = { getAssignedDqtvIds: jest.fn() };

const callsOf = (mock: jest.Mock) => mock.mock.calls as unknown[][];

describe('ContactPolicy', () => {
  let policy: ContactPolicy;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ContactPolicy,
        { provide: getDataSourceToken(), useValue: mockDs },
        { provide: AssignmentsService, useValue: mockAssignments },
      ],
    }).compile();
    policy = mod.get(ContactPolicy);
    jest.resetAllMocks();
  });

  it.each([
    ['police_ward', { sub: 'w', role: 'police_ward', unitScope: null }],
    ['system_admin', { sub: 'a', role: 'system_admin', unitScope: 'KV1' }],
    // A ward-wide role held besides the primary one still spans the ward
    [
      'a secondary wide role',
      {
        sub: 'x',
        role: 'police_area',
        roles: ['police_ward'],
        unitScope: 'KV1',
      },
    ],
  ])('lets %s reach everyone in the ward', async (_label, actor) => {
    await expect(policy.scopeOf(actor)).resolves.toEqual({
      units: null,
      userIds: [],
    });
    expect(mockDs.query).not.toHaveBeenCalled();
    expect(mockAssignments.getAssignedDqtvIds).not.toHaveBeenCalled();
  });

  it('limits unit roles to the members of their unit', async () => {
    await expect(
      policy.scopeOf({ sub: 's', role: 'office_staff', unitScope: 'KV2' }),
    ).resolves.toEqual({ units: ['KV2'], userIds: [] });
    await expect(
      policy.scopeOf({ sub: 'p', role: 'police_area', unitScope: 'KV3' }),
    ).resolves.toEqual({ units: ['KV3'], userIds: [] });
  });

  it('gives ward-level roles without a unit scope the whole ward', async () => {
    await expect(
      policy.scopeOf({ sub: 'l', role: 'ubnd_leader', unitScope: null }),
    ).resolves.toEqual({ units: null, userIds: [] });
  });

  // A missing scope row must not widen an area role to the whole ward
  it('refuses area roles without a unit scope', async () => {
    await expect(
      policy.scopeOf({ sub: 'p', role: 'police_area', unitScope: null }),
    ).rejects.toThrow(new ForbiddenException('no_unit_scope'));
  });

  it('lets CA officers reach their unit colleagues and the DQTV assigned to them', async () => {
    mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-1', 'dq-2']);

    await expect(
      policy.scopeOf({ sub: 'ca-1', role: 'ca_officer', unitScope: 'KV2' }),
    ).resolves.toEqual({ units: ['KV2'], userIds: ['dq-1', 'dq-2'] });
    expect(mockAssignments.getAssignedDqtvIds).toHaveBeenCalledWith('ca-1');
  });

  // Without a scope the officer has no colleagues to reach, but the assignments still hold
  it('limits a CA officer without a unit scope to the DQTV assigned to them', async () => {
    mockAssignments.getAssignedDqtvIds.mockResolvedValueOnce(['dq-1']);

    await expect(
      policy.scopeOf({ sub: 'ca-1', role: 'ca_officer', unitScope: null }),
    ).resolves.toEqual({ units: [], userIds: ['dq-1'] });
  });

  it('lets DQTV members reach the members of their own units and their CA officers', async () => {
    mockDs.query.mockResolvedValueOnce([
      { units: ['KV1', 'KV4'], caUserIds: ['ca-9'] },
    ]);

    await expect(
      policy.scopeOf({ sub: 'dq-1', role: 'dqtv', unitScope: null }),
    ).resolves.toEqual({ units: ['KV1', 'KV4'], userIds: ['ca-9'] });

    const [sql, params] = callsOf(mockDs.query)[0] as [string, unknown[]];
    // Units through a militia profile or an account scope, never a ward-wide 'all' scope
    expect(sql).toMatch(/FROM militia_profiles/);
    expect(sql).toMatch(/FROM user_unit_scopes[\s\S]*scope_type <> 'all'/);
    expect(sql).toMatch(
      /SELECT a\.ca_user_id FROM ca_dqtv_assignments a WHERE a\.dqtv_user_id = \$1/,
    );
    expect(params).toEqual(['dq-1']);
  });

  it('gives a DQTV member without a unit nobody but their CA officers', async () => {
    mockDs.query.mockResolvedValueOnce([{ units: [], caUserIds: [] }]);

    await expect(
      policy.scopeOf({ sub: 'dq-1', role: 'dqtv_member', unitScope: null }),
    ).resolves.toEqual({ units: [], userIds: [] });
  });
});

describe('contactScopeSql', () => {
  it('matches everyone for a null unit list, else unit members and listed users', () => {
    const sql = contactScopeSql('u.id', '$3', '$4');

    expect(sql).toContain('$3::text[] IS NULL');
    expect(sql).toContain('u.id = ANY($4::uuid[])');
    expect(sql).toMatch(/unnest\(\$3::text\[\]\) AS cu\(code\)/);
    // Unit membership through a militia profile or an account scope (user-access.sql.ts)
    expect(sql).toMatch(/uim\.user_id = u\.id AND uimu\.code = cu\.code/);
    expect(sql).toMatch(/uis\.user_id = u\.id AND uisu\.code = cu\.code/);
  });
});
