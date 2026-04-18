// Global Playwright setup: create E2E test users with known passwords
import { Client } from 'pg'
import * as bcrypt from 'bcrypt'

const E2E_USERS = [
  { username: 'e2e_police_ward', password: 'E2eTest@PW1', fullName: 'E2E CA Phường', role: 'police_ward' },
  { username: 'e2e_militia', password: 'E2eTest@DQ1', fullName: 'E2E Dân Quân', role: 'militia' },
  { username: 'e2e_admin', password: 'E2eTest@Ad1', fullName: 'E2E Admin', role: 'system_admin' },
]

export default async function globalSetup() {
  const c = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5433'),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'MMS',
  })
  await c.connect()

  for (const u of E2E_USERS) {
    // Delete if exists
    const existing = await c.query<{ id: string }>('SELECT id FROM users WHERE username=$1', [u.username])
    if (existing.rows[0]) {
      const id = existing.rows[0].id
      await c.query('DELETE FROM task_assignments WHERE assignee_id IN (SELECT id FROM users WHERE username=$1)', [u.username])
      await c.query('DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tasks WHERE created_by=$1)', [id])
      await c.query('DELETE FROM tasks WHERE created_by=$1', [id])
      await c.query('DELETE FROM user_roles WHERE user_id=$1', [id])
      await c.query('DELETE FROM sessions WHERE user_id=$1', [id])
      await c.query('DELETE FROM users WHERE id=$1', [id])
    }

    // Create user
    const hash = await bcrypt.hash(u.password, 10)
    const result = await c.query<{ id: string }>(
      `INSERT INTO users (username, password_hash, full_name, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
      [u.username, hash, u.fullName],
    )
    const userId = result.rows[0].id

    // Assign role
    const roleRes = await c.query<{ id: string }>('SELECT id FROM roles WHERE code=$1', [u.role])
    if (roleRes.rows[0]) {
      await c.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleRes.rows[0].id])
    }
    console.log(`[E2E Setup] Created ${u.username} (${u.role}) id=${userId}`)
  }

  await c.end()
}
