// Unit Tests: which screens each signed-in role can open
// Leave reviewers now include ca_ward, ca_area and ca_officer
// (Web/backend/src/leave/leave.service.ts:56-64), so they must reach /ca/approvals.
// Run: flutter test test/unit_route_guard_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/router/route_guard.dart';
import 'package:police_app/core/router/routes.dart';
import 'package:police_app/features/auth/models/auth_models.dart';

void main() {
  test('UT-ROUTE-01: every leave reviewer role reaches the approvals screen', () {
    for (final code in ['ca_officer', 'ca_ward', 'ca_area', 'police_ward', 'police_area']) {
      final role = UserInfo(id: 'u', username: 'u', fullName: 'U', status: 'active', roles: [code]).appRole;
      expect(role, 'ca', reason: code);
      expect(
        appRouteRedirect(isAuthenticated: true, role: role, location: Routes.caApprovals),
        isNull,
        reason: code,
      );
    }
  });

  test('UT-ROUTE-02: DQTV and signed-out users are sent elsewhere', () {
    expect(appRouteRedirect(isAuthenticated: true, role: 'dqtv', location: Routes.caApprovals),
        Routes.dqtvHome);
    expect(appRouteRedirect(isAuthenticated: false, role: '', location: Routes.caApprovals),
        Routes.login);
    expect(appRouteRedirect(isAuthenticated: true, role: 'ca', location: Routes.login), Routes.caHome);
    expect(appRouteRedirect(isAuthenticated: false, role: '', location: Routes.login), isNull);
  });

  test('UT-ROUTE-03: the forgot-password screen opens while signed out', () {
    expect(appRouteRedirect(isAuthenticated: false, role: '', location: Routes.forgotPassword), isNull);
  });
}
