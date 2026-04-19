import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/otp_screen.dart';
import '../../features/auth/screens/mfa_setup_screen.dart';
import '../../features/auth/screens/recovery_codes_screen.dart';
import '../../features/home/screens/home_screen.dart';
import '../../features/attendance/screens/checkin_screen.dart';
import '../../features/tasks/screens/tasks_list_screen.dart';
import '../../features/tasks/screens/task_detail_screen.dart';
import '../../features/tasks/screens/task_report_screen.dart';
import '../../features/notifications/screens/notifications_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/profile/screens/settings_screen.dart';
import '../../features/leave/screens/leave_request_screen.dart';
import '../../features/incident/screens/sos_screen.dart';
import '../../features/incident/screens/incident_report_screen.dart';
import '../../features/chat/screens/conversations_screen.dart';
import '../../features/chat/screens/chat_screen.dart';
import '../../features/leave/screens/my_requests_screen.dart';
import '../../features/kpi/screens/kpi_screen.dart';
import '../../shared/widgets/main_shell.dart';
import 'routes.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: Routes.splash,
    redirect: (context, state) {
      final isLoggedIn = authState.isAuthenticated;
      final isAuthRoute = state.matchedLocation == Routes.login ||
          state.matchedLocation == Routes.otpVerify ||
          state.matchedLocation == Routes.mfaSetup ||
          state.matchedLocation == Routes.recoveryCodes;

      if (!isLoggedIn && !isAuthRoute) return Routes.login;
      if (isLoggedIn && state.matchedLocation == Routes.login) {
        return Routes.home;
      }
      return null;
    },
    routes: [
      GoRoute(
        path: Routes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: Routes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: Routes.otpVerify,
        builder: (context, state) {
          final tempToken = state.extra as String? ?? '';
          return OtpScreen(tempToken: tempToken);
        },
      ),
      GoRoute(
        path: Routes.mfaSetup,
        builder: (context, state) {
          final tempToken = state.extra as String? ?? '';
          return MfaSetupScreen(tempToken: tempToken);
        },
      ),
      GoRoute(
        path: Routes.recoveryCodes,
        builder: (context, state) {
          final codes = state.extra as List<String>? ?? [];
          return RecoveryCodesScreen(codes: codes);
        },
      ),
      // Main shell with bottom nav
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: Routes.home,
            builder: (context, state) => const HomeScreen(),
          ),
          GoRoute(
            path: Routes.checkin,
            builder: (context, state) => const CheckinScreen(),
          ),
          GoRoute(
            path: Routes.tasks,
            builder: (context, state) => const TasksListScreen(),
            routes: [
              GoRoute(
                path: ':id',
                builder: (context, state) {
                  final id = state.pathParameters['id']!;
                  return TaskDetailScreen(taskId: id);
                },
                routes: [
                  GoRoute(
                    path: 'report',
                    builder: (context, state) {
                      final id = state.pathParameters['id']!;
                      return TaskReportScreen(taskId: id);
                    },
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: Routes.notifications,
            builder: (context, state) => const NotificationsScreen(),
          ),
          GoRoute(
            path: Routes.profile,
            builder: (context, state) => const ProfileScreen(),
          ),
          GoRoute(
            path: Routes.settings,
            builder: (context, state) => const SettingsScreen(),
          ),
        ],
      ),
      GoRoute(
        path: Routes.leaveRequest,
        builder: (context, state) => const LeaveRequestScreen(),
      ),
      GoRoute(
        path: Routes.myRequests,
        builder: (context, state) => const MyRequestsScreen(),
      ),
      GoRoute(
        path: Routes.kpi,
        builder: (context, state) => const KpiScreen(),
      ),
      GoRoute(path: Routes.sos, builder: (context, state) => const SosScreen()),
      GoRoute(
        path: Routes.incidentReport,
        builder: (context, state) => const IncidentReportScreen(),
      ),
      GoRoute(
        path: Routes.chat,
        builder: (context, state) => const ConversationsScreen(),
        routes: [
          GoRoute(
            path: ':conversationId',
            builder: (context, state) {
              final id = state.pathParameters['conversationId']!;
              return ChatScreen(conversationId: id);
            },
          ),
        ],
      ),
    ],
  );
});

// Splash screen — redirects based on auth state once provider resolves
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _navigate();
  }

  Future<void> _navigate() async {
    // Give the auth provider time to read from secure storage
    await Future.delayed(const Duration(milliseconds: 300));
    if (!mounted) return;
    final isAuthenticated = ref.read(authStateProvider).isAuthenticated;
    if (isAuthenticated) {
      context.go(Routes.home);
    } else {
      context.go(Routes.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
