import { Test, TestingModule } from '@nestjs/testing';
import { WorkReportsController } from './work-reports.controller';
import { WorkReportsService } from './work-reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockWorkReportsService = {
  list: jest.fn(),
  create: jest.fn(),
  review: jest.fn(),
};

const dqtvReq = { user: { sub: 'dqtv-1', role: 'dqtv_member', unitScope: 'UNIT_001' } };
const caReq = { user: { sub: 'ca-1', role: 'ca_officer', unitScope: 'UNIT_001' } };

describe('WorkReportsController', () => {
  let controller: WorkReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkReportsController],
      providers: [{ provide: WorkReportsService, useValue: mockWorkReportsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkReportsController>(WorkReportsController);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('returns paginated work reports', () => {
      const paginated = { data: [{ id: 'wr-1' }], total: 1, page: 1, limit: 20 };
      mockWorkReportsService.list.mockReturnValueOnce(paginated);

      const result = controller.list(dqtvReq as any, undefined, undefined, 1, 20);

      expect(result).toEqual(paginated);
      expect(mockWorkReportsService.list).toHaveBeenCalledWith({
        type: undefined,
        userId: undefined,
        page: 1,
        limit: 20,
        requesterRole: 'dqtv_member',
        requesterSub: 'dqtv-1',
      });
    });

    it('passes type and userId filters', () => {
      mockWorkReportsService.list.mockReturnValueOnce({ data: [], total: 0 });

      controller.list(caReq as any, 'weekly', 'dqtv-1', 1, 20);

      expect(mockWorkReportsService.list).toHaveBeenCalledWith({
        type: 'weekly',
        userId: 'dqtv-1',
        page: 1,
        limit: 20,
        requesterRole: 'ca_officer',
        requesterSub: 'ca-1',
      });
    });
  });

  describe('create', () => {
    it('creates work report and returns it', () => {
      const dto = { reportType: 'weekly', title: 'Week 1 Report', content: 'Done tasks...' };
      const created = { id: 'wr-new', ...dto };
      mockWorkReportsService.create.mockReturnValueOnce(created);

      const result = controller.create(dqtvReq as any, dto);

      expect(result).toEqual(created);
      expect(mockWorkReportsService.create).toHaveBeenCalledWith('dqtv-1', dto);
    });

    it('propagates error from service', () => {
      mockWorkReportsService.create.mockImplementationOnce(() => {
        throw new Error('validation');
      });

      expect(() => controller.create(dqtvReq as any, {} as any)).toThrow('validation');
    });
  });

  describe('review', () => {
    it('approves work report and returns result', () => {
      const updated = { id: 'wr-1', reviewStatus: 'approved' };
      mockWorkReportsService.review.mockReturnValueOnce(updated);

      const result = controller.review(caReq as any, 'wr-1', { reviewStatus: 'approved' });

      expect(result).toEqual(updated);
      expect(mockWorkReportsService.review).toHaveBeenCalledWith(
        'wr-1',
        { reviewStatus: 'approved' },
        'ca-1',
        'ca_officer',
      );
    });

    it('rejects work report with note', () => {
      mockWorkReportsService.review.mockReturnValueOnce({ id: 'wr-1', reviewStatus: 'rejected' });

      controller.review(caReq as any, 'wr-1', { reviewStatus: 'rejected', reviewNote: 'Incomplete' });

      expect(mockWorkReportsService.review).toHaveBeenCalledWith(
        'wr-1',
        { reviewStatus: 'rejected', reviewNote: 'Incomplete' },
        'ca-1',
        'ca_officer',
      );
    });
  });
});
