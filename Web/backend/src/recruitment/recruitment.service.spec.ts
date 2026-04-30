import { Test } from '@nestjs/testing';
import { RecruitmentService } from './recruitment.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecruitmentApplication } from './entities/recruitment-application.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('RecruitmentService', () => {
  let service: RecruitmentService;
  let repo: jest.Mocked<any>;

  beforeEach(async () => {
    repo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        RecruitmentService,
        { provide: getRepositoryToken(RecruitmentApplication), useValue: repo },
      ],
    }).compile();
    service = module.get(RecruitmentService);
  });

  describe('listApplications', () => {
    it('returns paginated results', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      const result = await service.listApplications({});
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('createApplication', () => {
    it('creates application with userId', async () => {
      repo.create.mockReturnValue({ name: 'Test', status: 'new' });
      repo.save.mockResolvedValue({ id: '1', name: 'Test', status: 'new' });
      const result = await service.createApplication({ name: 'Test' }, 'user-123');
      expect(result.status).toBe('new');
    });
  });

  describe('getApplicationById', () => {
    it('returns application when found', async () => {
      repo.findOne.mockResolvedValue({ id: '1', name: 'Test', deletedAt: null });
      const result = await service.getApplicationById('1');
      expect(result).toBeDefined();
    });
    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getApplicationById('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateApplication', () => {
    it('updates status and sets reviewer fields', async () => {
      const app = { id: '1', status: 'new', reviewedBy: null, reviewedAt: null };
      repo.findOne.mockResolvedValue(app);
      repo.save.mockResolvedValue({ ...app, status: 'reviewing' });
      const result = await service.updateApplication('1', { status: 'reviewing' }, 'reviewer-id');
      expect(result.status).toBe('reviewing');
    });
  });

  describe('deleteApplication', () => {
    it('soft deletes when admin', async () => {
      const app = { id: '1', deletedAt: null };
      repo.findOne.mockResolvedValue(app);
      repo.save.mockResolvedValue({ ...app, deletedAt: new Date() });
      await expect(service.deleteApplication('1', 'admin', true)).resolves.not.toThrow();
    });
    it('throws ForbiddenException when not admin', async () => {
      await expect(service.deleteApplication('1', 'user', false)).rejects.toThrow(ForbiddenException);
    });
  });
});
