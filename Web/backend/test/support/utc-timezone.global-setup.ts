// Runs before Jest starts its workers, which inherit the environment. Production servers
// run on UTC; without this, date code that reads the host timezone passes on developer
// machines set to Vietnam time and fails in production around midnight.
// (Assigning process.env.TZ inside a test file does not work: tests run in a sandbox
// with a copy of process.env.)
export default function utcTimezone(): void {
  process.env.TZ = 'UTC';
}
