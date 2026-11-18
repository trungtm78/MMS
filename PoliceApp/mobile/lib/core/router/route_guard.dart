import 'routes.dart';

/// Where a navigation to [location] must go instead, or null to allow it.
///
/// [role] is UserInfo.appRole: 'ca' covers police_ward, police_area, ca_ward, ca_area and
/// ca_officer — all of whom may review leave (Web/backend/src/leave/leave.service.ts:56-64) —
/// and 'dqtv' the militia roles.
String? appRouteRedirect({
  required bool isAuthenticated,
  required String role,
  required String location,
}) {
  const authRoutes = [Routes.login, Routes.otp, Routes.mfaSetup, Routes.recoveryCodes];
  if (authRoutes.contains(location)) {
    // Already signed in: go to the right home
    if (isAuthenticated) return role == 'ca' ? Routes.caHome : Routes.dqtvHome;
    return null;
  }

  // Open to signed-out users
  if (location == Routes.forgotPassword) return null;

  if (!isAuthenticated) return Routes.login;

  // Role mismatch guard
  if (role == 'ca' && location.startsWith('/dqtv/')) return Routes.caHome;
  if (role == 'dqtv' && location.startsWith('/ca/')) return Routes.dqtvHome;
  return null;
}
