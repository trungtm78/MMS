import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/forgot_password_screen.dart';
import '../../features/auth/screens/otp_screen.dart';
import '../../features/auth/screens/mfa_setup_screen.dart';
import '../../features/home/screens/home_ca_screen.dart';
import '../../features/dqtv_home/screens/dqtv_home_screen.dart';
import '../../features/dqtv/screens/dqtv_list_screen.dart';
import '../../features/dqtv/screens/dqtv_detail_screen.dart';
import '../../features/gps/screens/gps_tracking_screen.dart';
import '../../features/tasks/screens/create_task_screen.dart';
import '../../features/tasks/screens/tasks_screen_dqtv.dart';
import '../../features/tasks/screens/task_detail_screen.dart';
import '../../features/attendance/screens/checkin_screen.dart';
import '../../features/reports/screens/report_work_screen.dart';
import '../../features/reports/screens/team_reports_screen.dart';
import '../../features/approvals/screens/approvals_screen.dart';
import '../../features/approvals/screens/chi_tieu_evaluation_screen.dart';
import '../../features/alerts/screens/alerts_screen.dart';
import '../../features/profile/screens/profile_ca_screen.dart';
import '../../features/profile/screens/profile_dqtv_screen.dart';
import '../../features/notifications/screens/notifications_screen.dart';
import '../../shared/widgets/main_shell_ca.dart';
import '../../shared/widgets/main_shell_dqtv.dart';
import 'routes.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: Routes.login,
    redirect: (context, state) {
      final isAuth = authState.isAuthenticated;
      final role = authState.role;
      final loc = state.matchedLocation;

      // Allow auth routes always
      final authRoutes = [Routes.login, Routes.otp, Routes.mfaSetup, Routes.recoveryCodes];
      if (authRoutes.contains(loc)) {
        // If already authenticated, redirect to proper home
        if (isAuth) {
          return role == 'ca' ? Routes.caHome : Routes.dqtvHome;
        }
        return null;
      }

      // Not authenticated — force login
      if (!isAuth) return Routes.login;

      // Role mismatch guard
      if (role == 'ca' && loc.startsWith('/dqtv/')) return Routes.caHome;
      if (role == 'dqtv' && loc.startsWith('/ca/')) return Routes.dqtvHome;

      return null;
    },
    routes: [
      // ─── Auth Routes ────────────────────────────────────────────────────
      GoRoute(
        path: Routes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: Routes.otp,
        builder: (context, state) => OtpScreen(tempToken: state.extra as String? ?? ''),
      ),
      GoRoute(
        path: Routes.mfaSetup,
        builder: (context, state) => MfaSetupScreen(tempToken: state.extra as String? ?? ''),
      ),
      GoRoute(
        path: Routes.recoveryCodes,
        builder: (context, state) => const _PlaceholderScreen(title: 'Recovery Codes'),
      ),
      GoRoute(
        path: Routes.forgotPassword,
        builder: (context, state) => const ForgotPasswordScreen(),
      ),

      // ─── CA Shell ────────────────────────────────────────────────────────
      ShellRoute(
        builder: (context, state, child) => MainShellCA(child: child),
        routes: [
          GoRoute(
            path: Routes.caHome,
            builder: (context, state) => const HomeCAScreen(),
          ),
          GoRoute(
            path: Routes.caDqtvList,
            builder: (context, state) => const DQTVListScreen(),
            routes: [
              GoRoute(
                path: ':id',
                builder: (context, state) => DqtvDetailScreen(userId: state.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: Routes.caMap,
            builder: (context, state) => const GpsTrackingScreen(),
          ),
          GoRoute(
            path: Routes.caTaskCreate,
            builder: (context, state) => const CreateTaskScreen(),
          ),
          GoRoute(
            path: Routes.caProfile,
            builder: (context, state) => const ProfileCAScreen(),
          ),
        ],
      ),

      // ─── CA Fullscreen (outside shell) ───────────────────────────────────
      GoRoute(
        path: Routes.caApprovals,
        builder: (context, state) => const ApprovalsScreen(),
      ),
      GoRoute(
        path: Routes.caEvaluate,
        builder: (context, state) => ChiTieuEvaluationScreen(
          userId: state.pathParameters['userId']!,
        ),
      ),
      GoRoute(
        path: Routes.caReports,
        builder: (context, state) => const TeamReportsScreen(),
      ),
      GoRoute(
        path: Routes.caAlerts,
        builder: (context, state) => const AlertsScreen(),
      ),
      GoRoute(
        path: Routes.caNotifications,
        builder: (context, state) => const NotificationsScreen(),
      ),

      // ─── DQTV Shell ──────────────────────────────────────────────────────
      ShellRoute(
        builder: (context, state, child) => MainShellDQTV(child: child),
        routes: [
          GoRoute(
            path: Routes.dqtvHome,
            builder: (context, state) => const DQTVHomeScreen(),
          ),
          GoRoute(
            path: Routes.dqtvTasks,
            builder: (context, state) => const MyTasksScreen(),
            routes: [
              GoRoute(
                path: ':id',
                builder: (context, state) => TaskDetailScreen(taskId: state.pathParameters['id']!),
              ),
            ],
          ),
          GoRoute(
            path: Routes.dqtvCheckIn,
            builder: (context, state) => const CheckInScreen(),
          ),
          GoRoute(
            path: Routes.dqtvReport,
            builder: (context, state) => const ReportWorkScreen(),
          ),
          GoRoute(
            path: Routes.dqtvProfile,
            builder: (context, state) => const ProfileDqtvScreen(),
          ),
        ],
      ),

      // ─── DQTV Fullscreen ─────────────────────────────────────────────────
      GoRoute(
        path: Routes.dqtvNotifications,
        builder: (context, state) => const NotificationsScreen(),
      ),
    ],
  );
});

/// Temporary placeholder for routes not yet fully implemented
class _PlaceholderScreen extends StatelessWidget {
  final String title;
  const _PlaceholderScreen({required this.title});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text(title, style: const TextStyle(fontSize: 18))),
    );
  }
}
