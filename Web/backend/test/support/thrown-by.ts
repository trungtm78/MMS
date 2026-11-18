/** The error `fn` throws (or undefined), so a test can assert its fields with a typed matcher. */
export function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
