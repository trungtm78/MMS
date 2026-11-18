import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

type HealthIndicatorFn = () => unknown;

const mockHealthCheckService = {
  check: jest.fn<unknown, [indicators: HealthIndicatorFn[]]>(),
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
        {
          provide: TypeOrmHealthIndicator,
          useValue: mockTypeOrmHealthIndicator,
        },
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

    it('checks the database ping and a 300 MiB heap ceiling', async () => {
      await controller.check();

      const [indicators] = mockHealthCheckService.check.mock.calls[0];
      expect(indicators).toHaveLength(2);
      indicators.forEach((indicator) => indicator());

      expect(mockTypeOrmHealthIndicator.pingCheck).toHaveBeenCalledWith(
        'database',
      );
      expect(mockMemoryHealthIndicator.checkHeap).toHaveBeenCalledWith(
        'memory_heap',
        300 * 1024 * 1024,
      );
    });

    it('propagates error when database check fails', () => {
      mockHealthCheckService.check.mockImplementationOnce(() => {
        throw new Error('db_down');
      });

      expect(() => controller.check()).toThrow('db_down');
    });
  });
});
