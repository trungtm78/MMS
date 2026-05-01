import { Test, TestingModule } from '@nestjs/testing';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException } from '@nestjs/common';

const mockLeaveService = {
  listLeaveRequests: jest.fn(),
  createLeaveRequest: jest.fn(),
  getLeaveRequest: jest.fn(),
  reviewLeaveRequest: jest.fn(),
  getLeaveBalances: jest.fn(),
  listApprovals: jest.fn(),
  cancelLeaveRequest: jest.fn(),
};

const userReq = { user: { sub: 'user-1', role: 'office_staff', unitScope: 'UNIT_001' } };

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
    it('returns paginated leave requests', async () => {
      const paginated = { data: [{ id: 'lr-1' }], total: 1 };
      mockLeaveService.listLeaveRequests.mockResolvedValueOnce(paginated);

      const result = await controller.listLeaveRequests(userReq as any, undefined, '1', '20');

      expect(result).toEqual(paginated);
      expect(mockLeaveService.listLeaveRequests).toHaveBeenCalledWith(
        userReq.user,
        { status: undefined, page: 1, limit: 20 },
      );
    });

    it('filters by status when provided', async () => {
      mockLeaveService.listLeaveRequests.mockResolvedValueOnce({ data: [], total: 0 });

      await controller.listLeaveRequests(userReq as any, 'pending', undefined, undefined);

      expect(mockLeaveService.listLeaveRequests).toHaveBeenCalledWith(
        userReq.user,
        { status: 'pending', page: undefined, limit: undefined },
      );
    });
  });

  describe('createLeaveRequest', () => {
    it('creates and returns leave request', async () => {
      const dto = { leaveType: 'annual', startDate: '2025-02-01', endDate: '2025-02-05' };
      const created = { id: 'lr-new', ...dto, status: 'pending' };
      mockLeaveService.createLeaveRequest.mockResolvedValueOnce(created);

      const result = await controller.createLeaveRequest(userReq as any, dto as any);

      expect(result).toEqual(created);
      expect(mockLeaveService.createLeaveRequest).toHaveBeenCalledWith(userReq.user, dto);
    });

    it('propagates error when dates invalid', async () => {
      mockLeaveService.createLeaveRequest.mockRejectedValueOnce(new Error('invalid_dates'));

      await expect(
        controller.createLeaveRequest(userReq as any, {} as any),
      ).rejects.toThrow('invalid_dates');
    });
  });

  describe('getLeaveRequest', () => {
    it('returns single leave request', async () => {
      const lr = { id: 'lr-1', status: 'pending' };
      mockLeaveService.getLeaveRequest.mockResolvedValueOnce(lr);

      const result = await controller.getLeaveRequest('lr-1');

      expect(result).toEqual(lr);
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockLeaveService.getLeaveRequest.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.getLeaveRequest('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reviewLeaveRequest', () => {
    it('approves leave request and returns void', async () => {
      mockLeaveService.reviewLeaveRequest.mockResolvedValueOnce(undefined);

      const result = await controller.reviewLeaveRequest(
        userReq as any,
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

      await controller.reviewLeaveRequest(userReq as any, 'lr-1', { action: 'reject', reason: 'Busy' });

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

      const result = await controller.getLeaveBalances(userReq as any);

      expect(result).toEqual(balances);
      expect(mockLeaveService.getLeaveBalances).toHaveBeenCalledWith('user-1');
    });
  });

  describe('listApprovals', () => {
    it('returns approvals list', async () => {
      const approvals = [{ id: 'lr-1', status: 'pending' }];
      mockLeaveService.listApprovals.mockResolvedValueOnce(approvals);

      const result = await controller.listApprovals(userReq as any, 'pending');

      expect(result).toEqual(approvals);
      expect(mockLeaveService.listApprovals).toHaveBeenCalledWith(userReq.user, 'pending');
    });
  });

  describe('approveFromApprovals', () => {
    it('approves leave request from approvals page', async () => {
      mockLeaveService.reviewLeaveRequest.mockResolvedValueOnce(undefined);

      await controller.approveFromApprovals(userReq as any, 'lr-1', 'LGTM');

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

      await controller.rejectFromApprovals(userReq as any, 'lr-1', 'Too short notice');

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

      await controller.cancelLeaveRequest(userReq as any, 'lr-1');

      expect(mockLeaveService.cancelLeaveRequest).toHaveBeenCalledWith(userReq.user, 'lr-1');
    });

    it('propagates error when request cannot be cancelled', async () => {
      mockLeaveService.cancelLeaveRequest.mockRejectedValueOnce(new Error('cannot_cancel'));

      await expect(controller.cancelLeaveRequest(userReq as any, 'lr-1')).rejects.toThrow(
        'cannot_cancel',
      );
    });
  });
});
