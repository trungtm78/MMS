import { Test, TestingModule } from '@nestjs/testing';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

const mockLeaveService = {
  listLeaveRequests: jest.fn(),
  createLeaveRequest: jest.fn(),
  getLeaveRequest: jest.fn(),
  reviewLeaveRequest: jest.fn(),
  getLeaveBalances: jest.fn(),
  listApprovals: jest.fn(),
  cancelLeaveRequest: jest.fn(),
  listLeaveTypes: jest.fn(),
};

const userReq = {
  user: { sub: 'user-1', role: 'office_staff', unitScope: 'UNIT_001' },
};

describe('LeaveController', () => {
  let controller: LeaveController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveController],
      providers: [{ provide: LeaveService, useValue: mockLeaveService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LeaveController>(LeaveController);
    jest.clearAllMocks();
  });

  describe('listLeaveRequests', () => {
    it('passes mine=true through as a boolean', async () => {
      mockLeaveService.listLeaveRequests.mockResolvedValueOnce({
        data: [],
        total: 0,
      });

      await controller.listLeaveRequests(
        userReq as never,
        'pending',
        undefined,
        undefined,
        'true',
      );

      expect(mockLeaveService.listLeaveRequests).toHaveBeenCalledWith(
        userReq.user,
        { status: 'pending', page: undefined, limit: undefined, mine: true },
      );
    });

    it('returns paginated leave requests', async () => {
      const paginated = { data: [{ id: 'lr-1' }], total: 1 };
      mockLeaveService.listLeaveRequests.mockResolvedValueOnce(paginated);

      const result = await controller.listLeaveRequests(
        userReq as never,
        undefined,
        '1',
        '20',
      );

      expect(result).toEqual(paginated);
      expect(mockLeaveService.listLeaveRequests).toHaveBeenCalledWith(
        userReq.user,
        { status: undefined, page: 1, limit: 20 },
      );
    });

    it('filters by status when provided', async () => {
      mockLeaveService.listLeaveRequests.mockResolvedValueOnce({
        data: [],
        total: 0,
      });

      await controller.listLeaveRequests(
        userReq as never,
        'pending',
        undefined,
        undefined,
      );

      expect(mockLeaveService.listLeaveRequests).toHaveBeenCalledWith(
        userReq.user,
        { status: 'pending', page: undefined, limit: undefined },
      );
    });
  });

  describe('createLeaveRequest', () => {
    const dto: CreateLeaveDto = {
      leaveTypeId: '7a1f3c52-9d4e-4b8a-a6f1-2c3d4e5f6a7b',
      fromDate: '2025-02-01',
      toDate: '2025-02-05',
      reason: 'Nghỉ phép năm',
    };

    it('creates and returns leave request', async () => {
      const created = { id: 'lr-new', ...dto, status: 'pending' };
      mockLeaveService.createLeaveRequest.mockResolvedValueOnce(created);

      const result = await controller.createLeaveRequest(userReq as never, dto);

      expect(result).toEqual(created);
      expect(mockLeaveService.createLeaveRequest).toHaveBeenCalledWith(
        userReq.user,
        dto,
      );
    });

    it('propagates error when dates invalid', async () => {
      mockLeaveService.createLeaveRequest.mockRejectedValueOnce(
        new Error('invalid_dates'),
      );

      await expect(
        controller.createLeaveRequest(userReq as never, {
          ...dto,
          fromDate: '2025-02-05',
          toDate: '2025-02-01',
        }),
      ).rejects.toThrow('invalid_dates');
    });
  });

  // GET /leave/types — every signed-in user picks a type when requesting leave
  describe('listLeaveTypes', () => {
    it('returns the active leave types', async () => {
      const types = [{ id: 'lt-1', code: 'annual', name: 'Nghỉ phép năm' }];
      mockLeaveService.listLeaveTypes.mockResolvedValueOnce(types);

      await expect(controller.listLeaveTypes()).resolves.toEqual(types);
    });

    it('is served at leave/types for any signed-in user', () => {
      const handler = Object.getOwnPropertyDescriptor(
        LeaveController.prototype,
        'listLeaveTypes',
      )?.value as object;
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('leave/types');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.GET,
      );
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        JwtAuthGuard,
      ]);
    });

    // Express matches routes in declaration order: after leave/:id, "types" would reach
    // ParseUUIDPipe and answer 400
    it('is declared before leave/:id', () => {
      const methods = Object.getOwnPropertyNames(LeaveController.prototype);
      expect(methods.indexOf('listLeaveTypes')).toBeGreaterThan(-1);
      expect(methods.indexOf('listLeaveTypes')).toBeLessThan(
        methods.indexOf('getLeaveRequest'),
      );
    });
  });

  describe('getLeaveRequest', () => {
    it('returns single leave request', async () => {
      const lr = { id: 'lr-1', status: 'pending' };
      mockLeaveService.getLeaveRequest.mockResolvedValueOnce(lr);

      const result = await controller.getLeaveRequest(userReq as never, 'lr-1');

      expect(result).toEqual(lr);
      // The service decides whether the caller may see it
      expect(mockLeaveService.getLeaveRequest).toHaveBeenCalledWith(
        userReq.user,
        'lr-1',
      );
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockLeaveService.getLeaveRequest.mockRejectedValueOnce(
        new NotFoundException(),
      );

      await expect(
        controller.getLeaveRequest(userReq as never, 'bad'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reviewLeaveRequest', () => {
    it('approves leave request and returns void', async () => {
      mockLeaveService.reviewLeaveRequest.mockResolvedValueOnce(undefined);

      const result = await controller.reviewLeaveRequest(
        userReq as never,
        'lr-1',
        { action: 'approve' },
      );

      expect(result).toBeUndefined();
      expect(mockLeaveService.reviewLeaveRequest).toHaveBeenCalledWith(
        userReq.user,
        'lr-1',
        'approve',
        undefined,
      );
    });

    it('rejects leave request with reason', async () => {
      mockLeaveService.reviewLeaveRequest.mockResolvedValueOnce(undefined);

      await controller.reviewLeaveRequest(userReq as never, 'lr-1', {
        action: 'reject',
        reason: 'Busy',
      });

      expect(mockLeaveService.reviewLeaveRequest).toHaveBeenCalledWith(
        userReq.user,
        'lr-1',
        'reject',
        'Busy',
      );
    });
  });

  describe('getLeaveBalances', () => {
    it('returns leave balances for current user', async () => {
      const balances = { annual: 12, sick: 10, used: 3 };
      mockLeaveService.getLeaveBalances.mockResolvedValueOnce(balances);

      const result = await controller.getLeaveBalances(userReq as never);

      expect(result).toEqual(balances);
      expect(mockLeaveService.getLeaveBalances).toHaveBeenCalledWith('user-1');
    });
  });

  describe('listApprovals', () => {
    it('returns approvals list', async () => {
      const approvals = [{ id: 'lr-1', status: 'pending' }];
      mockLeaveService.listApprovals.mockResolvedValueOnce(approvals);

      const result = await controller.listApprovals(
        userReq as never,
        'pending',
      );

      expect(result).toEqual(approvals);
      expect(mockLeaveService.listApprovals).toHaveBeenCalledWith(
        userReq.user,
        'pending',
      );
    });
  });

  describe('approveFromApprovals', () => {
    it('approves leave request from approvals page', async () => {
      mockLeaveService.reviewLeaveRequest.mockResolvedValueOnce(undefined);

      await controller.approveFromApprovals(userReq as never, 'lr-1', 'LGTM');

      expect(mockLeaveService.reviewLeaveRequest).toHaveBeenCalledWith(
        userReq.user,
        'lr-1',
        'approve',
        'LGTM',
      );
    });
  });

  describe('rejectFromApprovals', () => {
    it('rejects leave request from approvals page', async () => {
      mockLeaveService.reviewLeaveRequest.mockResolvedValueOnce(undefined);

      await controller.rejectFromApprovals(
        userReq as never,
        'lr-1',
        'Too short notice',
      );

      expect(mockLeaveService.reviewLeaveRequest).toHaveBeenCalledWith(
        userReq.user,
        'lr-1',
        'reject',
        'Too short notice',
      );
    });
  });

  describe('cancelLeaveRequest', () => {
    it('cancels pending leave request', async () => {
      mockLeaveService.cancelLeaveRequest.mockResolvedValueOnce(undefined);

      await controller.cancelLeaveRequest(userReq as never, 'lr-1');

      expect(mockLeaveService.cancelLeaveRequest).toHaveBeenCalledWith(
        userReq.user,
        'lr-1',
      );
    });

    it('propagates error when request cannot be cancelled', async () => {
      mockLeaveService.cancelLeaveRequest.mockRejectedValueOnce(
        new Error('cannot_cancel'),
      );

      await expect(
        controller.cancelLeaveRequest(userReq as never, 'lr-1'),
      ).rejects.toThrow('cannot_cancel');
    });
  });
});
