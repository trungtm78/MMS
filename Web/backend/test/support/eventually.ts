/**
 * Polls a condition that settles asynchronously (a server noticing a closed connection, a
 * pool draining) and fails once the deadline passes. No fixed sleep: it returns as soon as
 * the condition holds.
 */
export async function eventually(
  check: () => Promise<boolean>,
  description: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error(`${description} did not happen within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
