import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';

const mockDataSource = {
  query: jest.fn(),
};

describe('AssignmentsService', () => {
  let service: AssignmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<AssignmentsService>(AssignmentsService);
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────
  // createAssignment
  // ──────────────────────────────────────────────

  describe('createAssignment', () => {
    const dto = { caUserId: 'ca-1', dqtvUserId: 'dqtv-1' };
    const assignedBy = 'admin-1';

    it('inserts and returns the new assignment', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'assign-1', assigned_at: new Date() }]) // INSERT
        .mockResolvedValueOnce([{                                               // SELECT detail
          id: 'assign-1',
          caUserId: 'ca-1',
          dqtvUserId: 'dqtv-1',
          dqtvFullName: 'Nguyen Van A',
          dqtvUnitCode: 'WARD_01',
          assignedBy: 'admin-1',
          assignedAt: new Date(),
        }]);

      const result = await service.createAssignment(dto, assignedBy);
      expect(result.id).toBe('assign-1');
      expect(result.dqtvFullName).toBe('Nguyen Van A');
    });

    it('throws ConflictException on duplicate (pg error 23505)', async () => {
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
      mockDataSource.query.mockRejectedValueOnce(pgError);
      await expect(service.createAssignment(dto, assignedBy)).rejects.toThrow(ConflictException);
    });

    it('re-throws non-duplicate errors', async () => {
      mockDataSource.query.mockRejectedValueOnce(new Error('connection lost'));
      await expect(service.createAssignment(dto, assignedBy)).rejects.toThrow('connection lost');
    });
  });

  // ──────────────────────────────────────────────
  // removeAssignment
  // ──────────────────────────────────────────────

  describe('removeAssignment', () => {
    const requester = { sub: 'admin-1', role: 'system_admin' };

    it('deletes the assignment when found', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ id: 'assign-1' }]) // SELECT check
        .mockResolvedValueOnce(undefined);             // DELETE

      await expect(service.removeAssignment('assign-1', requester)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when assignment does not exist', async () => {
      mockDataSource.query.mockResolvedValueOnce([]); // SELECT returns empty
      await expect(service.removeAssignment('missing-id', requester)).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // listByCa
  // ──────────────────────────────────────────────

  describe('listByCa', () => {
    const mockList = [
      { id: 'a1', caUserId: 'ca-1', dqtvUserId: 'dqtv-1', dqtvFullName: 'A', dqtvUnitCode: 'U1', assignedBy: 'admin', assignedAt: new Date() },
    ];

    it('system_admin can list assignments for any CA', async () => {
      mockDataSource.query.mockResolvedValueOnce(mockList);
      const result = await service.listByCa('ca-1', { sub: 'admin-1', role: 'system_admin' });
      expect(result).toHaveLength(1);
    });

    it('ca_officer can list own assignments (no caUserId param)', async () => {
      mockDataSource.query.mockResolvedValueOnce(mockList);
      const result = await service.listByCa(undefined, { sub: 'ca-1', role: 'ca_officer' });
      expect(result).toHaveLength(1);
    });

    it('ca_officer can list own assignments (caUserId = self)', async () => {
      mockDataSource.query.mockResolvedValueOnce(mockList);
      const result = await service.listByCa('ca-1', { sub: 'ca-1', role: 'ca_officer' });
      expect(result).toHaveLength(1);
    });

    it('ca_officer throws ForbiddenException when querying other CA', async () => {
      await expect(
        service.listByCa('other-ca', { sub: 'ca-1', role: 'ca_officer' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('system_admin without caUserId throws ForbiddenException', async () => {
      await expect(
        service.listByCa(undefined, { sub: 'admin-1', role: 'system_admin' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────
  // getAssignedDqtvIds
  // ──────────────────────────────────────────────

  describe('getAssignedDqtvIds', () => {
    it('returns array of dqtv user IDs', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { dqtv_user_id: 'u1' },
        { dqtv_user_id: 'u2' },
      ]);
      const result = await service.getAssignedDqtvIds('ca-1');
      expect(result).toEqual(['u1', 'u2']);
    });

    it('returns empty array when CA has no assignments', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      const result = await service.getAssignedDqtvIds('ca-1');
      expect(result).toEqual([]);
    });
  });
});
