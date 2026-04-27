import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SosService } from './sos.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

const mockQuery = jest.fn();
const mockDs = { query: mockQuery };
const mockEmitToUnit = jest.fn();
const mockBroadcast = jest.fn();
const mockGateway = { emitToUnit: mockEmitToUnit, broadcast: mockBroadcast };

async function build() {
  const mod = await Test.createTestingModule({
    providers: [
      SosService,
      { provide: getDataSourceToken(), useValue: mockDs },
      { provide: NotificationsGateway, useValue: mockGateway },
    ],
  }).compile();
  return mod.get(SosService);
}

describe('SosService', () => {
  let service: SosService;

  beforeEach(async () => {
    service = await build();
    mockQuery.mockReset();
    mockEmitToUnit.mockReset();
    mockBroadcast.mockReset();
  });

  it('1. create sets status=open and emits sos:new to unit', async () => {
    mockQuery.mockResolvedValueOnce([{
      id: 'inc-1', incidentType: 'sos', severity: 'urgent', title: 'Test', status: 'open',
    }]);

    const result = await service.create('user-1', 'UNIT_001', {
      incidentType: 'sos',
      severity: 'urgent',
      title: 'Test SOS',
    });

    expect(result['status']).toBe('open');
    expect(mockEmitToUnit).toHaveBeenCalledWith('UNIT_001', 'sos:new', expect.objectContaining({ id: 'inc-1' }));
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('2. create broadcasts when no unitCode', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'inc-2', status: 'open' }]);
    await service.create('user-1', null, { incidentType: 'sos', severity: 'high', title: 'Broadcast' });
    expect(mockBroadcast).toHaveBeenCalledWith('sos:new', expect.any(Object));
  });

  it('3. list returns paginated results with total', async () => {
    mockQuery
      .mockResolvedValueOnce([{ count: '3' }])
      .mockResolvedValueOnce([{ id: 'inc-1' }, { id: 'inc-2' }, { id: 'inc-3' }]);
    const result = await service.list({ page: 1, limit: 10 });
    expect(result.total).toBe(3);
    expect(result.data).toHaveLength(3);
  });

  it('4. updateStatus emits sos:resolved when status=resolved', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'inc-1', status: 'resolved' }]);
    await service.updateStatus('inc-1', { status: 'resolved', resolutionNote: 'handled' }, 'user-1');
    expect(mockBroadcast).toHaveBeenCalledWith('sos:resolved', { id: 'inc-1' });
  });

  it('5. getById throws NotFoundException for unknown id', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(service.getById('unknown')).rejects.toThrow(NotFoundException);
  });
});
