import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  TRAINING_TYPES,
  attendanceBlocker,
  isDayAmount,
  nextPlanStatus,
  sessionSpanDays,
  trainingApi,
} from './training'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))
vi.mock('./client', () => ({ default: api }))

describe('training api', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
  })

  // create-training.dto.ts TRAINING_TYPES
  it('lists the backend training type codes', () => {
    expect(TRAINING_TYPES).toEqual(['military', 'political', 'fire', 'first_aid', 'other'])
  })

  // training-plan.dto.ts DAYS: maxDecimalPlaces 1, with the Min/Max of each field
  it.each([
    [0.5, 0.5, 365, true],
    [365, 0.5, 365, true],
    [7.5, 0.5, 365, true],
    [0.4, 0.5, 365, false],
    [365.5, 0.5, 365, false],
    [366, 0.5, 366, true],
    [1.25, 0.5, 365, false],
    [Number.NaN, 0.5, 365, false],
    [Number.POSITIVE_INFINITY, 0.5, 365, false],
  ])('isDayAmount(%s, %s, %s) is %s', (value, min, max, expected) => {
    expect(isDayAmount(value, min, max)).toBe(expected)
  })

  // training-plans.service.ts spanDays: calendar days from start to end inclusive
  it('counts the calendar days of a span inclusively, across a month end', () => {
    expect(sessionSpanDays('2026-06-01', '2026-06-15')).toBe(15)
    expect(sessionSpanDays('2026-12-31', '2026-12-31')).toBe(1)
    expect(sessionSpanDays('2026-02-27', '2026-03-02')).toBe(4)
  })

  // training-plans.service.ts recordAttendance: the plan is checked before the start date
  it.each([
    [{ planStatus: 'draft', status: 'upcoming' }, 'training_plan_not_active'],
    [{ planStatus: 'completed', status: 'completed' }, 'training_plan_not_active'],
    [{ planStatus: 'active', status: 'upcoming' }, 'training_session_not_started'],
    [{ planStatus: 'active', status: 'ongoing' }, null],
    [{ planStatus: 'active', status: 'completed' }, null],
  ] as const)('attendanceBlocker(%o) is %s', (session, expected) => {
    expect(attendanceBlocker(session)).toBe(expected)
  })

  // training-plan-codes.ts TRAINING_PLAN_TRANSITIONS
  it('moves a plan forward only', () => {
    expect(nextPlanStatus('draft')).toBe('active')
    expect(nextPlanStatus('active')).toBe('completed')
    expect(nextPlanStatus('completed')).toBeNull()
  })

  it('calls the plan endpoints', async () => {
    api.get.mockResolvedValueOnce({ data: [{ id: 'p1' }] })
    await expect(trainingApi.listPlans({ year: 2026, status: 'active' })).resolves.toEqual([{ id: 'p1' }])
    expect(api.get).toHaveBeenCalledWith('/training/plans', { params: { year: 2026, status: 'active' } })

    api.post.mockResolvedValueOnce({ data: { id: 'p2' } })
    await expect(trainingApi.createPlan({ year: 2026, type: 'fire', requiredDays: 2 })).resolves.toEqual({ id: 'p2' })
    expect(api.post).toHaveBeenCalledWith('/training/plans', { year: 2026, type: 'fire', requiredDays: 2 })

    api.patch.mockResolvedValueOnce({ data: { id: 'p2', status: 'active' } })
    await expect(trainingApi.updatePlanStatus('p2', 'active')).resolves.toEqual({ id: 'p2', status: 'active' })
    expect(api.patch).toHaveBeenCalledWith('/training/plans/p2/status', { status: 'active' })
  })

  it('calls the session and attendance endpoints', async () => {
    api.get.mockResolvedValueOnce({ data: [{ id: 's1' }] })
    await expect(trainingApi.listSessions({ planId: 'p1' })).resolves.toEqual([{ id: 's1' }])
    expect(api.get).toHaveBeenCalledWith('/training/sessions', { params: { planId: 'p1' } })

    const body = { planId: 'p1', name: 'Đợt 1', startDate: '2026-06-01', endDate: '2026-06-02', location: 'Sân', daysCount: 2 }
    api.post.mockResolvedValueOnce({ data: { id: 's2' } })
    await expect(trainingApi.createSession(body)).resolves.toEqual({ id: 's2' })
    expect(api.post).toHaveBeenCalledWith('/training/sessions', body)

    api.get.mockResolvedValueOnce({ data: [{ id: 'm1' }] })
    await expect(trainingApi.sessionMembers('s2')).resolves.toEqual([{ id: 'm1' }])
    expect(api.get).toHaveBeenCalledWith('/training/sessions/s2/members')

    api.post.mockResolvedValueOnce({ data: { id: 's2', attendancePercent: 100 } })
    await expect(trainingApi.recordAttendance('s2', [{ memberId: 'm1', attended: true }])).resolves.toEqual({ id: 's2', attendancePercent: 100 })
    expect(api.post).toHaveBeenCalledWith('/training/sessions/s2/attendance', { attendance: [{ memberId: 'm1', attended: true }] })
  })

  it('still lists the training records of one member', async () => {
    api.get.mockResolvedValueOnce({ data: { data: [], total: 0, page: 1, limit: 100 } })
    await expect(trainingApi.listRecords({ militiaId: 'm1', year: 2026, limit: 100 })).resolves.toEqual({ data: [], total: 0, page: 1, limit: 100 })
    expect(api.get).toHaveBeenCalledWith('/training', { params: { militiaId: 'm1', year: 2026, limit: 100 } })
  })
})
