import { Test, TestingModule } from '@nestjs/testing';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { NotFoundException } from '@nestjs/common';

const mockRecruitmentService = {
  listApplications: jest.fn(),
  createApplication: jest.fn(),
  getApplicationById: jest.fn(),
  updateApplication: jest.fn(),
  deleteApplication: jest.fn(),
};

const adminReq = { user: { sub: 'admin-1', username: 'admin', role: 'system_admin', unitScope: null } };

describe('RecruitmentController', () => {
  let controller: RecruitmentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecruitmentController],
      providers: [{ provide: RecruitmentService, useValue: mockRecruitmentService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RecruitmentController>(RecruitmentController);
    jest.clearAllMocks();
  });

  describe('listApplications', () => {
    it('returns paginated applications', async () => {
      const paginated = { data: [{ id: 'app-1' }], total: 1, page: 1, limit: 20 };
      mockRecruitmentService.listApplications.mockResolvedValueOnce(paginated);

      const result = await controller.listApplications(undefined, 1, 20);

      expect(result).toEqual(paginated);
      expect(mockRecruitmentService.listApplications).toHaveBeenCalledWith({ status: undefined, page: 1, limit: 20 });
    });

    it('filters by status', async () => {
      mockRecruitmentService.listApplications.mockResolvedValueOnce({ data: [], total: 0 });

      await controller.listApplications('pending', 1, 20);

      expect(mockRecruitmentService.listApplications).toHaveBeenCalledWith({ status: 'pending', page: 1, limit: 20 });
    });
  });

  describe('createApplication', () => {
    it('creates and returns application', async () => {
      const dto = { fullName: 'Nguyen Van A', dob: '1990-01-01' };
      const created = { id: 'app-new', ...dto, status: 'pending' };
      mockRecruitmentService.createApplication.mockResolvedValueOnce(created);

      const result = await controller.createApplication(dto as any, adminReq);

      expect(result).toEqual(created);
      expect(mockRecruitmentService.createApplication).toHaveBeenCalledWith(dto, 'admin-1');
    });

    it('propagates error from service', async () => {
      mockRecruitmentService.createApplication.mockRejectedValueOnce(new Error('validation'));

      await expect(controller.createApplication({} as any, adminReq)).rejects.toThrow('validation');
    });
  });

  describe('getApplicationById', () => {
    it('returns single application', async () => {
      const app = { id: 'app-1', fullName: 'Nguyen Van A' };
      mockRecruitmentService.getApplicationById.mockResolvedValueOnce(app);

      const result = await controller.getApplicationById('app-1');

      expect(result).toEqual(app);
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockRecruitmentService.getApplicationById.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.getApplicationById('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateApplication', () => {
    it('updates and returns application', async () => {
      const updated = { id: 'app-1', status: 'approved' };
      mockRecruitmentService.updateApplication.mockResolvedValueOnce(updated);

      const result = await controller.updateApplication('app-1', { status: 'approved' } as any, adminReq);

      expect(result).toEqual(updated);
      expect(mockRecruitmentService.updateApplication).toHaveBeenCalledWith('app-1', { status: 'approved' }, 'admin-1');
    });

    it('propagates NotFoundException', async () => {
      mockRecruitmentService.updateApplication.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.updateApplication('bad', {} as any, adminReq)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteApplication', () => {
    it('deletes application and returns void', async () => {
      mockRecruitmentService.deleteApplication.mockResolvedValueOnce(undefined);

      await expect(controller.deleteApplication('app-1', adminReq)).resolves.toBeUndefined();

      expect(mockRecruitmentService.deleteApplication).toHaveBeenCalledWith('app-1', 'admin-1', true);
    });

    it('propagates NotFoundException for unknown id', async () => {
      mockRecruitmentService.deleteApplication.mockRejectedValueOnce(new NotFoundException());

      await expect(controller.deleteApplication('bad', adminReq)).rejects.toThrow(NotFoundException);
    });
  });
});
