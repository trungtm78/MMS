import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

class DemoController {}
const demoHandler = () => undefined;

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () => demoHandler,
    getClass: () => DemoController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const requireRoles = (roles: string[] | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  afterEach(() => jest.restoreAllMocks());

  it('allows routes without role metadata', () => {
    requireRoles(undefined);

    expect(guard.canActivate(contextFor({ role: 'dqtv' }))).toBe(true);
  });

  it('allows a user whose primary role is required', () => {
    requireRoles(['police_ward']);

    expect(guard.canActivate(contextFor({ role: 'police_ward' }))).toBe(true);
  });

  // Route permissions are not hierarchical, so a user holding several roles is
  // authorized by any of them, not only by the one chosen as primary
  it('allows a user holding any required role among several', () => {
    requireRoles(['audit_reader']);

    expect(
      guard.canActivate(
        contextFor({
          role: 'police_ward',
          roles: ['police_ward', 'audit_reader'],
        }),
      ),
    ).toBe(true);
  });

  it('refuses a user holding none of the required roles', () => {
    requireRoles(['police_ward']);

    expect(() =>
      guard.canActivate(contextFor({ role: 'dqtv', roles: ['dqtv'] })),
    ).toThrow(new ForbiddenException('insufficient_role'));
  });

  it('ignores a roles claim that is not a list of strings', () => {
    requireRoles(['system_admin']);

    expect(() =>
      guard.canActivate(contextFor({ role: 'dqtv', roles: 'system_admin' })),
    ).toThrow(ForbiddenException);
  });

  it('refuses unauthenticated requests', () => {
    requireRoles(['system_admin']);

    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
