import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthCheckService, TypeOrmHealthIndicator, MemoryHealthIndicator } from '@nestjs/terminus';

const mockHealthCheck = jest.fn();
const mockDbPingCheck = jest.fn();
const mockMemoryCheckHeap = jest.fn();

const mockHealthCheckService = {
  check: jest.fn(),
};

const mockTypeOrmHealthIndicator = {
  pingCheck: jest.fn(),
};

const mockMemoryHealthIndicator = {
  checkHeap: jest.fn(),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: TypeOrmHealthIndicator, useValue: mockTypeOrmHealthIndicator },
        { provide: MemoryHealthIndicator, useValue: mockMemoryHealthIndicator },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('returns health check result when all checks pass', () => {
      const healthResult = {
        status: 'ok',
        info: { database: { status: 'up' }, memory_heap: { status: 'up' } },
      };
      mockHealthCheckService.check.mockReturnValueOnce(healthResult);

      const result = controller.check();

      expect(result).toEqual(healthResult);
      expect(mockHealthCheckService.check).toHaveBeenCalled();
    });

    it('propagates error when database check fails', () => {
      mockHealthCheckService.check.mockImplementationOnce(() => {
        throw new Error('db_down');
      });

      expect(() => controller.check()).toThrow('db_down');
    });
  });
});
