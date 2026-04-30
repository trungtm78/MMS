// Global Playwright teardown: remove E2E test users
import { Client } from 'pg'

const E2E_USERNAMES = ['e2e_police_ward', 'e2e_militia', 'e2e_admin', 'e2e_staff']

export default async function globalTeardown() {
  const c = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5433'),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'MMS',
  })
  await c.connect()

  // Clean up E2E quick-created militia records
  await c.query("DELETE FROM militia_profiles WHERE militia_code LIKE 'QS-E2E-%'")

  for (const username of E2E_USERNAMES) {
    const r = await c.query<{ id: string }>('SELECT id FROM users WHERE username=$1', [username])
    if (r.rows[0]) {
      const id = r.rows[0].id
      await c.query('DELETE FROM user_roles WHERE user_id=$1', [id])
      await c.query('DELETE FROM sessions WHERE user_id=$1', [id])
      // Clean up E2E-created tasks before deleting user (avoid FK constraint)
      await c.query('DELETE FROM task_assignments WHERE assigned_by=$1 OR assignee_id=$1', [id])
      await c.query('DELETE FROM tasks WHERE created_by=$1', [id])
      await c.query('DELETE FROM users WHERE id=$1', [id])
      console.log(`[E2E Teardown] Removed ${username}`)
    }
  }

  await c.end()
}
