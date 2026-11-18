// Production servers run on UTC while the ward works on Vietnamese calendar days. These
// instants sit on either side of that gap. Both Jest configs run with TZ=UTC
// (utc-timezone.global-setup.ts), so date code cannot pass just because the developer
// machine is in Vietnam.

/** 1 October 2026 01:30 in Vietnam, still 30 September in UTC. */
export const VN_1_OCTOBER_0130 = new Date('2026-09-30T18:30:00Z');

/** 1 January 2027 00:30 in Vietnam, still 31 December 2026 in UTC. */
export const VN_NEW_YEAR_0030 = new Date('2026-12-31T17:30:00Z');

/** Registers beforeEach/afterEach hooks that run each test with the clock at `now`. */
export function useUtcServerClock(now: Date): void {
  beforeEach(() => {
    if (new Date(0).getTimezoneOffset() !== 0) {
      throw new Error(
        'Unit tests must run with TZ=UTC; use the Jest config globalSetup',
      );
    }
    jest.useFakeTimers({
      now,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'queueMicrotask',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });
}
