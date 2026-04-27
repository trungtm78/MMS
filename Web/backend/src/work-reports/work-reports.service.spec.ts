import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkReportsService } from './work-reports.service';

const mockQuery = jest.fn();
const mockDs = { query: mockQuery };

async function build() {
  const mod = await Test.createTestingModule({
    providers: [WorkReportsService, { provide: getDataSourceToken(), useValue: mockDs }],
  }).compile();
  return mod.get(WorkReportsService);
}

describe('WorkReportsService', () => {
  let service: WorkReportsService;

  beforeEach(async () => {
    service = await build();
    mockQuery.mockReset();
  });

  it('1. list scopes to own reports for dqtv_member', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([{ id: 'wr-1', reportType: 'daily', title: 'Report' }]);

    const result = await service.list({
      requesterRole: 'dqtv_member',
      requesterSub: 'user-1',
      page: 1,
      limit: 10,
    });

    expect(result.total).toBe(1);
    const countSql: string = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('created_by');
  });

  it('2. create inserts with review_status=pending', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'wr-2', reviewStatus: 'pending' }]);
    const result = await service.create('user-1', {
      reportType: 'weekly',
      title: 'Weekly Report',
      content: 'All good',
    });
    expect(result['reviewStatus']).toBe('pending');
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('pending');
  });

  it('3. review by CA sets review_status and reviewed_by', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'wr-3', reviewStatus: 'approved' }]);
    const result = await service.review('wr-3', { reviewStatus: 'approved' }, 'ca-1', 'ca_officer');
    expect(result['reviewStatus']).toBe('approved');
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('approved');
    expect(params[2]).toBe('ca-1');
  });

  it('4. review throws ForbiddenException for dqtv_member role', async () => {
    await expect(
      service.review('wr-3', { reviewStatus: 'approved' }, 'user-1', 'dqtv_member'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('5. review throws NotFoundException for unknown id', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(
      service.review('unknown', { reviewStatus: 'rejected' }, 'ca-1', 'ca_officer'),
    ).rejects.toThrow(NotFoundException);
  });
});
