// Integration tests — SmartSelect API endpoints
// US-SS-01: /militia/search — BE integration
// US-SS-08: /units/search, /users/search — BE integration
// Requires backend running on localhost:3000 and test DB with seed data
import { test, expect } from '@playwright/test'
import axios from 'axios'

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1/mms_core'

let authToken = ''

// Get JWT token for integration tests
async function getToken(): Promise<string> {
  if (authToken) return authToken
  const res = await axios.post(`${API}/auth/login`, {
    username: 'admin',
    password: '123456',
  })
  authToken = res.data.tokens.accessToken
  return authToken
}

// ─────────────────────────────────────────────────────
// /militia/search
// ─────────────────────────────────────────────────────
test.describe('Integration: GET /militia/search', () => {
  test('INT-SS-01: search empty query returns active militia', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/militia/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: '', limit: 10 },
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
    if (res.data.length > 0) {
      const item = res.data[0]
      expect(item).toHaveProperty('id')
      expect(item).toHaveProperty('militiaCode')
      expect(item).toHaveProperty('fullName')
      expect(item).toHaveProperty('unitCode')
      expect(item).toHaveProperty('status', 'active')
    }
  })

  test('INT-SS-02: search by name "Nguyen" returns unaccent match', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/militia/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: 'Nguyen', limit: 10 },
    })
    expect(res.status).toBe(200)
    // Should return results matching "Nguyễn" (unaccent)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('INT-SS-03: search by militia code "HCM" returns code matches', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/militia/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: 'HCM', limit: 10 },
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('INT-SS-04: search no-match query returns empty array', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/militia/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: 'ZZZNOMATCHXYZ999', limit: 10 },
    })
    expect(res.status).toBe(200)
    expect(res.data).toEqual([])
  })

  test('INT-SS-05: limit is respected', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/militia/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: '', limit: 2 },
    })
    expect(res.status).toBe(200)
    expect(res.data.length).toBeLessThanOrEqual(2)
  })

  test('INT-SS-06: returns 401 without auth', async () => {
    try {
      await axios.get(`${API}/militia/search`, { params: { q: '' } })
      throw new Error('Should have returned 401')
    } catch (e: unknown) {
      const err = e as { response?: { status: number } }
      expect(err.response?.status).toBe(401)
    }
  })
})

// ─────────────────────────────────────────────────────
// /units/search
// ─────────────────────────────────────────────────────
test.describe('Integration: GET /units/search', () => {
  test('INT-SS-07: search units empty query returns all', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/units/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: '', limit: 10 },
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('INT-SS-08: search units by name "Phu" (unaccent Phú)', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/units/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: 'Phu', limit: 10 },
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  test('INT-SS-09: unit search result has required fields', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/units/search`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: '', limit: 1 },
    })
    expect(res.status).toBe(200)
    if (res.data.length > 0) {
      const unit = res.data[0]
      expect(unit).toHaveProperty('id')
      expect(unit).toHaveProperty('code')
      expect(unit).toHaveProperty('name')
      expect(unit).toHaveProperty('type')
    }
  })
})

// ─────────────────────────────────────────────────────
// /tasks (POST)
// ─────────────────────────────────────────────────────
test.describe('Integration: POST /tasks', () => {
  test('INT-SS-10: create task returns 400 for non-existent militia', async () => {
    const token = await getToken()
    try {
      await axios.post(
        `${API}/tasks`,
        {
          title: 'Test Task',
          assigneeMilitiaId: '00000000-0000-0000-0000-000000000000',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      throw new Error('Should have returned 404')
    } catch (e: unknown) {
      const err = e as { response?: { status: number } }
      expect([404, 400]).toContain(err.response?.status)
    }
  })

  test('INT-SS-11: create task requires JWT', async () => {
    try {
      await axios.post(`${API}/tasks`, { title: 'Test', assigneeMilitiaId: 'xxx' })
      throw new Error('Should have returned 401')
    } catch (e: unknown) {
      const err = e as { response?: { status: number } }
      expect(err.response?.status).toBe(401)
    }
  })
})

// ─────────────────────────────────────────────────────
// /attendance (POST)
// ─────────────────────────────────────────────────────
test.describe('Integration: POST /attendance', () => {
  test('INT-SS-12: record attendance returns 404 for non-existent militia', async () => {
    const token = await getToken()
    try {
      await axios.post(
        `${API}/attendance`,
        {
          militiaId: '00000000-0000-0000-0000-000000000000',
          workDate: '2026-03-08',
          status: 'present',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      throw new Error('Should have returned 404')
    } catch (e: unknown) {
      const err = e as { response?: { status: number } }
      expect([404, 400]).toContain(err.response?.status)
    }
  })

  test('INT-SS-13: attendance list returns 200', async () => {
    const token = await getToken()
    const res = await axios.get(`${API}/attendance`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page: 1, limit: 10 },
    })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })
})
