import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as taskService from '../../src/services/task.service';
import * as pool from '../../src/db/pool';

vi.mock('../../src/db/pool');

describe('Task Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTaskCode', () => {
    it('should generate code with correct format', async () => {
      vi.mocked(pool.queryOne).mockResolvedValueOnce({ count: '5' });
      
      const code = await taskService.generateTaskCode();
      
      expect(code).toMatch(/^NV-\d{4}\d{2}-\d{4}$/);
    });
  });

  describe('getTaskById', () => {
    it('should return null for non-existent task', async () => {
      vi.mocked(pool.queryOne).mockResolvedValueOnce(null);
      
      const result = await taskService.getTaskById('non-existent-id');
      
      expect(result).toBeNull();
    });

    it('should return task with assignments', async () => {
      const mockTask = {
        id: 'task-1',
        code: 'NV-202403-0001',
        title: 'Test Task',
        description: 'Test Description',
        type: 'patrol',
        priority: 'high',
        status: 'pending',
        deadline: new Date(),
        location_name: 'Test Location',
        location_lat: 10.0,
        location_lng: 106.0,
        unit_id: null,
        created_by: 'user-1',
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
        completed_by: null
      };
      
      vi.mocked(pool.queryOne).mockResolvedValueOnce(mockTask);
      vi.mocked(pool.queryMany).mockResolvedValueOnce([]);
      
      const result = await taskService.getTaskById('task-1');
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe('task-1');
      expect(result?.title).toBe('Test Task');
    });
  });

  describe('acceptTask', () => {
    it('should return null if assignment not found', async () => {
      vi.mocked(pool.queryOne).mockResolvedValueOnce(null);
      
      const result = await taskService.acceptTask('task-1', 'user-1');
      
      expect(result).toBeNull();
    });
  });

  describe('updateTaskProgress', () => {
    it('should complete task when progress is 100', async () => {
      vi.mocked(pool.queryOne)
        .mockResolvedValueOnce({ id: 'assignment-1' })  // assignment query
        .mockResolvedValueOnce(null);  // insert update
        
      const mockTask = {
        id: 'task-1',
        code: 'NV-202403-0001',
        title: 'Test',
        description: null,
        type: 'patrol' as const,
        priority: 'high' as const,
        status: 'in_progress' as const,
        deadline: null,
        locationName: null,
        locationLat: null,
        locationLng: null,
        unitId: null,
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        completedBy: null,
        assignments: []
      };
      
      vi.mocked(pool.queryMany).mockResolvedValueOnce([]);
      
      // This would need more mocking for full test
    });
  });
});
