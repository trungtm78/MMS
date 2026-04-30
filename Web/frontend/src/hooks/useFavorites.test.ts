// Unit tests for useFavorites hook
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFavorites } from './useFavorites'

describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  test('starts with empty favorites when localStorage is empty', () => {
    const { result } = renderHook(() => useFavorites('user-1'))
    expect(result.current.favorites).toEqual([])
  })

  test('toggle adds a route to favorites', () => {
    const { result } = renderHook(() => useFavorites('user-1'))
    act(() => {
      result.current.toggle('dashboard')
    })
    expect(result.current.favorites).toContain('dashboard')
  })

  test('toggle twice removes the route', () => {
    const { result } = renderHook(() => useFavorites('user-1'))
    act(() => {
      result.current.toggle('dashboard')
    })
    act(() => {
      result.current.toggle('dashboard')
    })
    expect(result.current.favorites).not.toContain('dashboard')
  })

  test('remove removes a specific route', () => {
    const { result } = renderHook(() => useFavorites('user-1'))
    act(() => {
      result.current.toggle('tasks')
      result.current.toggle('reports')
    })
    act(() => {
      result.current.remove('tasks')
    })
    expect(result.current.favorites).not.toContain('tasks')
    expect(result.current.favorites).toContain('reports')
  })

  test('isFavorite returns true after adding', () => {
    const { result } = renderHook(() => useFavorites('user-1'))
    act(() => {
      result.current.toggle('gps-tracking')
    })
    expect(result.current.isFavorite('gps-tracking')).toBe(true)
    expect(result.current.isFavorite('payroll')).toBe(false)
  })

  test('persists favorites to localStorage with correct key', () => {
    const { result } = renderHook(() => useFavorites('user-42'))
    act(() => {
      result.current.toggle('militia-list')
    })
    const stored = JSON.parse(localStorage.getItem('mms-favorites-user-42') ?? '[]')
    expect(stored).toContain('militia-list')
  })

  test('different userIds use different localStorage keys', () => {
    const { result: resultA } = renderHook(() => useFavorites('alice'))
    const { result: resultB } = renderHook(() => useFavorites('bob'))

    act(() => {
      resultA.current.toggle('attendance')
    })
    act(() => {
      resultB.current.toggle('payroll')
    })

    expect(JSON.parse(localStorage.getItem('mms-favorites-alice') ?? '[]')).toContain('attendance')
    expect(JSON.parse(localStorage.getItem('mms-favorites-alice') ?? '[]')).not.toContain('payroll')
    expect(JSON.parse(localStorage.getItem('mms-favorites-bob') ?? '[]')).toContain('payroll')
    expect(JSON.parse(localStorage.getItem('mms-favorites-bob') ?? '[]')).not.toContain('attendance')
  })
})
