import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateTaskCode,
  createTask,
  getTaskById,
  getTasks,
  acceptTask,
  updateTaskProgress,
} from './task.service';

vi.mock('../db/pool', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('mock-task-uuid') }));

import { queryOne, queryMany } from '../db/pool';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

const baseTaskRow = {
  id: 'task-1',
  code: 'NV-202601-0001',
  title: 'Patrol Zone A',
  description: 'Nightly patrol',
  type: 'patrol' as const,
  priority: 'high' as const,
  status: 'assigned' as const,
  deadline: new Date('2026-01-16'),
  location_name: 'Zone A',
  location_lat: 10.5,
  location_lng: 106.5,
  unit_id: 'unit-1',
  created_by: 'commander-1',
  created_at: new Date('2026-01-15'),
  updated_at: new Date('2026-01-15'),
  completed_at: null,
  completed_by: null,
};

const baseAssignmentRow = {
  id: 'assign-1',
  task_id: 'task-1',
  assignee_id: 'user-1',
  assignee_name: 'Nguyen Van A',
  assigned_by: 'commander-1',
  assigned_by_name: 'Commander X',
  status: 'assigned' as const,
  assigned_at: new Date('2026-01-15'),
  accepted_at: null,
  completed_at: null,
  note: null,
  progress: 0,
};

describe('task.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── generateTaskCode ─────────────────────────────────────────────────────

  describe('generateTaskCode', () => {
    it('generates code in format NV-YYYYMM-NNNN', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });

      const code = await generateTaskCode();

      expect(code).toMatch(/^NV-\d{6}-\d{4}$/);
    });

    it('increments when tasks already exist', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '9' });

      const code = await generateTaskCode();

      expect(code).toMatch(/0010$/);
    });
  });

  // ─── createTask ───────────────────────────────────────────────────────────

  describe('createTask', () => {
    it('creates task with assignments and returns Task', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' })    // generateTaskCode
        .mockResolvedValueOnce(undefined)           // INSERT tasks
        .mockResolvedValueOnce(undefined)           // INSERT assignment for user-1
        .mockResolvedValueOnce(undefined)           // UPDATE tasks SET status = 'assigned'
        .mockResolvedValueOnce(baseTaskRow);        // getTaskById
      mockQueryMany.mockResolvedValueOnce([baseAssignmentRow]);

      const result = await createTask(
        {
          title: 'Patrol Zone A',
          type: 'patrol',
          priority: 'high',
          assigneeIds: ['user-1'],
        },
        'commander-1'
      );

      expect(result.id).toBe('task-1');
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0].assigneeName).toBe('Nguyen Van A');
    });

    it('does not update status when no assignees', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: '0' })  // generateTaskCode
        .mockResolvedValueOnce(undefined)         // INSERT tasks
        .mockResolvedValueOnce(baseTaskRow);      // getTaskById
      mockQueryMany.mockResolvedValueOnce([]);

      await createTask(
        { title: 'Unassigned Task', type: 'admin', priority: 'low', assigneeIds: [] },
        'commander-1'
      );

      // UPDATE tasks SET status = 'assigned' should NOT be called
      const calls = mockQueryOne.mock.calls.map(c => c[0] as string);
      expect(calls.some(sql => sql.includes("SET status = $1"))).toBe(false);
    });
  });

  // ─── getTaskById ──────────────────────────────────────────────────────────

  describe('getTaskById', () => {
    it('returns mapped Task with assignments', async () => {
      mockQueryOne.mockResolvedValueOnce(baseTaskRow);
      mockQueryMany.mockResolvedValueOnce([baseAssignmentRow]);

      const result = await getTaskById('task-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('task-1');
      expect(result!.locationName).toBe('Zone A');
      expect(result!.assignments).toHaveLength(1);
    });

    it('returns null when task not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getTaskById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── getTasks ─────────────────────────────────────────────────────────────

  describe('getTasks', () => {
    it('returns paginated tasks matching options', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '1' });
      mockQueryMany
        .mockResolvedValueOnce([{ id: 'task-1' }])  // task ID list
        .mockResolvedValueOnce([baseAssignmentRow]);  // assignments for getTaskById
      mockQueryOne.mockResolvedValueOnce(baseTaskRow); // getTaskById for task-1

      const result = await getTasks({ status: 'assigned', page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.tasks).toHaveLength(1);
    });

    it('returns empty list when no matching tasks', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getTasks({ assigneeId: 'user-nonexistent' });

      expect(result.total).toBe(0);
      expect(result.tasks).toHaveLength(0);
    });
  });

  // ─── acceptTask ───────────────────────────────────────────────────────────

  describe('acceptTask', () => {
    it('accepts task and returns updated Task', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'assign-1' })    // find assignment
        .mockResolvedValueOnce(undefined)               // UPDATE assignment status
        .mockResolvedValueOnce(undefined)               // UPDATE task status
        .mockResolvedValueOnce({ ...baseTaskRow, status: 'in_progress' }); // getTaskById
      mockQueryMany.mockResolvedValueOnce([{ ...baseAssignmentRow, status: 'accepted' }]);

      const result = await acceptTask('task-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('in_progress');
    });

    it('returns null when user is not assigned to the task', async () => {
      mockQueryOne.mockResolvedValueOnce(null); // no assignment found

      const result = await acceptTask('task-1', 'user-outsider');

      expect(result).toBeNull();
    });
  });

  // ─── updateTaskProgress ───────────────────────────────────────────────────

  describe('updateTaskProgress', () => {
    it('records progress update and returns updated Task', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'assign-1' })         // find assignment
        .mockResolvedValueOnce(undefined)                   // INSERT task_updates
        .mockResolvedValueOnce(undefined)                   // UPDATE assignment status (in_progress)
        .mockResolvedValueOnce(undefined)                   // UPDATE tasks status
        .mockResolvedValueOnce({ ...baseTaskRow, status: 'in_progress' }); // getTaskById
      mockQueryMany.mockResolvedValueOnce([baseAssignmentRow]);

      const result = await updateTaskProgress('task-1', 'user-1', {
        progress: 50,
        note: 'Halfway done',
      });

      expect(result).not.toBeNull();
    });

    it('marks task completed when progress is 100', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: 'assign-1' })
        .mockResolvedValueOnce(undefined) // INSERT task_updates
        .mockResolvedValueOnce(undefined) // UPDATE assignment completed
        .mockResolvedValueOnce(undefined) // UPDATE task completed
        .mockResolvedValueOnce({ ...baseTaskRow, status: 'completed' });
      mockQueryMany.mockResolvedValueOnce([{ ...baseAssignmentRow, status: 'completed' }]);

      const result = await updateTaskProgress('task-1', 'user-1', { progress: 100 });

      expect(result).not.toBeNull();
      // The UPDATE task should set status = 'completed'
      const updateTaskCall = mockQueryOne.mock.calls.find(
        c => (c[0] as string).includes('completed_at')
      );
      expect(updateTaskCall).toBeDefined();
    });

    it('returns null when user is not assigned to the task', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await updateTaskProgress('task-1', 'outsider', { progress: 10 });

      expect(result).toBeNull();
    });
  });
});
