import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateIncidentCode,
  createSOS,
  createIncidentReport,
  getIncidentById,
  getIncidents,
  resolveIncident,
} from './incident.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('mock-uuid') }));

import { queryOne, queryMany } from '../db/pool';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

const baseIncidentRow = {
  id: 'incident-1',
  code: 'BC-202601-0001',
  reporter_id: 'user-1',
  reporter_name: 'Nguyen Van A',
  incident_type: 'sos' as const,
  severity: 'high' as const,
  title: 'SOS - Khẩn cấp',
  message: 'Emergency',
  lat: 10.5,
  lng: 106.5,
  location_name: 'Zone A',
  status: 'open' as const,
  assigned_to: null,
  assigned_to_name: null,
  resolved_at: null,
  resolved_by: null,
  resolved_by_name: null,
  resolution_note: null,
  created_at: new Date('2026-01-15'),
  updated_at: new Date('2026-01-15'),
};

describe('incident.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── generateIncidentCode ─────────────────────────────────────────────────

  describe('generateIncidentCode', () => {
    it('generates a code in format BC-YYYYMM-NNNN', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });

      const code = await generateIncidentCode();

      expect(code).toMatch(/^BC-\d{6}-\d{4}$/);
    });

    it('increments count for subsequent incidents in same month', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '5' });

      const code = await generateIncidentCode();

      expect(code).toMatch(/0006$/);
    });
  });

  // ─── createSOS ────────────────────────────────────────────────────────────

  describe('createSOS', () => {
    it('creates SOS incident, alert, and returns incident', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' }) // generateIncidentCode
        .mockResolvedValueOnce(undefined)       // INSERT incidents
        .mockResolvedValueOnce(undefined)       // INSERT alerts
        .mockResolvedValueOnce(baseIncidentRow); // getIncidentById

      const result = await createSOS('user-1', {
        severity: 'high',
        message: 'Emergency',
        location: { lat: 10.5, lng: 106.5, name: 'Zone A' },
      });

      expect(result).not.toBeNull();
      expect(result.incidentType).toBe('sos');
      expect(mockQueryOne).toHaveBeenCalledTimes(4);
    });
  });

  // ─── createIncidentReport ─────────────────────────────────────────────────

  describe('createIncidentReport', () => {
    it('creates a report and returns the incident', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '2' })  // generateIncidentCode
        .mockResolvedValueOnce(undefined)        // INSERT incidents
        .mockResolvedValueOnce(baseIncidentRow); // getIncidentById (low severity, no alert)

      const result = await createIncidentReport('user-1', {
        incidentType: 'fire',
        severity: 'low',
        title: 'Small fire',
        message: 'Fire in room 3',
      });

      expect(result.title).toBe('SOS - Khẩn cấp');
    });

    it('creates alert for high severity reports', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' })  // generateIncidentCode
        .mockResolvedValueOnce(undefined)        // INSERT incidents
        .mockResolvedValueOnce(undefined)        // INSERT alerts (high severity)
        .mockResolvedValueOnce(baseIncidentRow); // getIncidentById

      await createIncidentReport('user-1', {
        incidentType: 'security',
        severity: 'high',
        title: 'Threat',
        message: 'Suspicious person',
      });

      // alert insert is called as 3rd queryOne call
      expect(mockQueryOne).toHaveBeenCalledTimes(4);
    });
  });

  // ─── getIncidentById ──────────────────────────────────────────────────────

  describe('getIncidentById', () => {
    it('returns mapped Incident when found', async () => {
      mockQueryOne.mockResolvedValueOnce(baseIncidentRow);

      const result = await getIncidentById('incident-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('incident-1');
      expect(result!.reporterName).toBe('Nguyen Van A');
    });

    it('returns null when incident not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getIncidentById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── getIncidents ─────────────────────────────────────────────────────────

  describe('getIncidents', () => {
    it('returns paginated incidents', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '1' });
      mockQueryMany.mockResolvedValueOnce([{ id: 'incident-1' }]);
      mockQueryOne.mockResolvedValueOnce(baseIncidentRow); // getIncidentById for each

      const result = await getIncidents({ page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.incidents).toHaveLength(1);
    });

    it('returns empty list when no incidents match filters', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getIncidents({ status: 'resolved' });

      expect(result.total).toBe(0);
      expect(result.incidents).toHaveLength(0);
    });
  });

  // ─── resolveIncident ──────────────────────────────────────────────────────

  describe('resolveIncident', () => {
    it('resolves incident and updates related alert', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'incident-1', status: 'open' }) // find incident
        .mockResolvedValueOnce(undefined)                              // UPDATE incidents
        .mockResolvedValueOnce(undefined)                              // UPDATE alerts
        .mockResolvedValueOnce({ ...baseIncidentRow, status: 'resolved' }); // getIncidentById

      const result = await resolveIncident('incident-1', 'user-1', 'Resolved by patrol');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('resolved');
    });

    it('returns null when incident not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await resolveIncident('nonexistent', 'user-1', 'note');

      expect(result).toBeNull();
    });
  });
});
