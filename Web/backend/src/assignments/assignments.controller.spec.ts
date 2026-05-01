import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

const mockAssignmentsService = {
  createAssignment: jest.fn(),
  removeAssignment: jest.fn(),
  listByCa: jest.fn(),
};

const adminReq = { user: { sub: 'admin-1', role: 'system_admin', unitScope: null } };
const caReq = { user: { sub: 'ca-1', role: 'ca_officer', unitScope: 'UNIT_001' } };

describe('AssignmentsController', () => {
  let controller: AssignmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentsController],
      providers: [{ provide: AssignmentsService, useValue: mockAssignmentsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AssignmentsController>(AssignmentsController);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates assignment and returns it', () => {
      const dto = { caUserId: 'ca-1', dqtvUserId: 'dqtv-1' };
      const created = { id: 'a-new', ...dto };
      mockAssignmentsService.createAssignment.mockReturnValueOnce(created);

      const result = controller.create(dto as any, adminReq as any);

      expect(result).toEqual(created);
      expect(mockAssignmentsService.createAssignment).toHaveBeenCalledWith(dto, 'admin-1');
    });

    it('propagates error from service', () => {
      mockAssignmentsService.createAssignment.mockImplementationOnce(() => {
        throw new Error('duplicate_assignment');
      });

      expect(() => controller.create({} as any, adminReq as any)).toThrow('duplicate_assignment');
    });
  });

  describe('remove', () => {
    it('removes assignment and returns void (204)', () => {
      mockAssignmentsService.removeAssignment.mockReturnValueOnce(undefined);

      const result = controller.remove('a-1', adminReq as any);

      expect(result).toBeUndefined();
      expect(mockAssignmentsService.removeAssignment).toHaveBeenCalledWith('a-1', {
        sub: 'admin-1',
        role: 'system_admin',
      });
    });

    it('propagates NotFoundException for unknown assignment', () => {
      mockAssignmentsService.removeAssignment.mockImplementationOnce(() => {
        throw new NotFoundException();
      });

      expect(() => controller.remove('bad', adminReq as any)).toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns assignments for specified caUserId (admin)', () => {
      const assignments = [{ id: 'a1', caUserId: 'ca-1', dqtvUserId: 'dqtv-1' }];
      mockAssignmentsService.listByCa.mockReturnValueOnce(assignments);

      const result = controller.list('ca-1', adminReq as any);

      expect(result).toEqual(assignments);
      expect(mockAssignmentsService.listByCa).toHaveBeenCalledWith('ca-1', {
        sub: 'admin-1',
        role: 'system_admin',
      });
    });

    it('CA officer sees own assignments', () => {
      const assignments = [{ id: 'a1', caUserId: 'ca-1' }];
      mockAssignmentsService.listByCa.mockReturnValueOnce(assignments);

      const result = controller.list(undefined, caReq as any);

      expect(result).toEqual(assignments);
      expect(mockAssignmentsService.listByCa).toHaveBeenCalledWith(undefined, {
        sub: 'ca-1',
        role: 'ca_officer',
      });
    });

    it('propagates ForbiddenException when CA tries to view others', () => {
      mockAssignmentsService.listByCa.mockImplementationOnce(() => {
        throw new ForbiddenException();
      });

      expect(() => controller.list('other-ca', caReq as any)).toThrow(ForbiddenException);
    });
  });
});
