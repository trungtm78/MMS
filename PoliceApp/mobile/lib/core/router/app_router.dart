import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/models/auth_models.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/screens/security_screen.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/forgot_password_screen.dart';
import '../../features/auth/screens/otp_screen.dart';
import '../../features/auth/screens/mfa_setup_screen.dart';
import '../../features/auth/screens/recovery_codes_screen.dart';
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
import '../../features/reports/screens/unit_compliance_screen.dart';
import '../../features/training/training_management_screen.dart';
import '../../features/alerts/screens/alerts_screen.dart';
import '../../features/profile/screens/profile_ca_screen.dart';
import '../../features/profile/screens/profile_dqtv_screen.dart';
import '../../features/notifications/screens/notifications_screen.dart';
import '../../features/chat/screens/conversations_screen.dart';
import '../../features/chat/screens/chat_screen.dart';
import '../../shared/widgets/main_shell_ca.dart';
import '../../shared/widgets/main_shell_dqtv.dart';
import 'route_guard.dart';
import 'routes.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  // One router for the app's lifetime, re-evaluated when sign-in state changes. Rebuilding
  // it on every auth state change reset navigation to the login screen — for example while
  // an MFA code was being checked.
  final authChanges = ValueNotifier<int>(0);
  ref.listen<AuthState>(authStateProvider, (previous, next) {
    if (previous?.isAuthenticated != next.isAuthenticated || previous?.role != next.role) {
      authChanges.value++;
    }
  });
  ref.onDispose(authChanges.dispose);

  return GoRouter(
    initialLocation: Routes.login,
    refreshListenable: authChanges,
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);
      return appRouteRedirect(
        isAuthenticated: auth.isAuthenticated,
        role: auth.role,
        location: state.matchedLocation,
      );
    },
    routes: [
      // ─── Auth Routes ────────────────────────────────────────────────────
      GoRoute(
        path: Routes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      // extra: the MFA_REQUIRED / MFA_SETUP_REQUIRED LoginResponse from the login screen
      GoRoute(
        path: Routes.otp,
        builder: (context, state) {
          final extra = state.extra;
          if (extra is LoginResponse) {
            return OtpScreen(
              mfaToken: extra.mfaToken ?? '',
              methods: extra.methods.isEmpty ? const [mfaMethodTotp] : extra.methods,
            );
          }
          return OtpScreen(mfaToken: extra is String ? extra : '');
        },
      ),
      GoRoute(
        path: Routes.mfaSetup,
        builder: (context, state) {
          final extra = state.extra;
          final token = extra is LoginResponse ? extra.mfaToken : extra is String ? extra : null;
          return MfaSetupScreen(mfaToken: token ?? '');
        },
      ),
      GoRoute(
        path: Routes.recoveryCodes,
        builder: (context, state) {
          final extra = state.extra;
          if (extra is RecoveryCodesArgs) {
            return RecoveryCodesScreen(codes: extra.codes, completesLogin: extra.completesLogin);
          }
          return RecoveryCodesScreen(codes: extra is List<String> ? extra : const <String>[]);
        },
      ),
      GoRoute(
        path: Routes.security,
        builder: (context, state) => const SecurityScreen(),
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
          GoRoute(
            path: Routes.caChat,
            builder: (context, state) => const ConversationsScreen(),
            routes: [
              GoRoute(
                path: ':id',
                builder: (context, state) => ChatScreen(
                  conversationId: state.pathParameters['id']!,
                ),
              ),
            ],
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
      GoRoute(
        path: Routes.caCompliance,
        builder: (context, state) => const UnitComplianceScreen(),
      ),
      GoRoute(
        path: Routes.caTrainingMgmt,
        builder: (context, state) => const TrainingManagementScreen(),
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
