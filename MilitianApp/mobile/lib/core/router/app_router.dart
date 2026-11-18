import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/models/login_response.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/auth/screens/forgot_password_screen.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/otp_screen.dart';
import '../../features/auth/screens/mfa_enroll_screen.dart';
import '../../features/auth/screens/recovery_codes_screen.dart';
import '../../features/profile/screens/security_screen.dart';
import '../../features/profile/screens/change_password_screen.dart';
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
import '../../features/training/training_screen.dart';
import '../../shared/widgets/main_shell.dart';
import 'routes.dart';

final routerProvider = Provider<GoRouter>((ref) {
  // One router for the app's lifetime: a new GoRouter restarts at the splash screen, so
  // rebuilding it on every AuthState (loading, errors, second-factor steps) would drop the
  // user out of the sign-in flow. The redirect re-runs when the signed-in flag changes.
  final signedIn = ValueNotifier<bool>(ref.read(authStateProvider).isAuthenticated);
  ref.listen<AuthState>(
    authStateProvider,
    (previous, next) => signedIn.value = next.isAuthenticated,
  );
  ref.onDispose(signedIn.dispose);

  return GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: signedIn,
    redirect: (context, state) {
      final isLoggedIn = signedIn.value;
      final isAuthRoute = state.matchedLocation == Routes.login ||
          state.matchedLocation == Routes.otpVerify ||
          state.matchedLocation == Routes.mfaSetup ||
          state.matchedLocation == Routes.recoveryCodes;

      // Open to signed-out users without sending signed-in users away
      final isPublic = isAuthRoute || state.matchedLocation == Routes.forgotPassword;
      if (!isLoggedIn && !isPublic) return Routes.login;
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
        path: Routes.forgotPassword,
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: Routes.otpVerify,
        builder: (context, state) => otpScreenFromExtra(state.extra),
      ),
      GoRoute(
        path: Routes.mfaSetup,
        builder: (context, state) => mfaEnrollScreenFromExtra(state.extra),
      ),
      GoRoute(
        path: Routes.recoveryCodes,
        builder: (context, state) => recoveryCodesScreenFromExtra(state.extra),
      ),
      GoRoute(
        path: Routes.security,
        builder: (context, state) => const SecurityScreen(),
      ),
      GoRoute(
        path: Routes.changePassword,
        builder: (context, state) => const ChangePasswordScreen(),
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
      GoRoute(
        path: Routes.training,
        builder: (context, state) => const TrainingScreen(),
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
              final title = state.extra;
              return ChatScreen(conversationId: id, title: title is String ? title : null);
            },
          ),
        ],
      ),
    ],
  );
});

/// MFA_REQUIRED sign-in step; [extra] is the LoginResponse from the login screen or its
/// mfaToken.
Widget otpScreenFromExtra(Object? extra) {
  if (extra is LoginResponse) {
    return OtpScreen(
      mfaToken: extra.mfaToken ?? '',
      methods: extra.methods.isEmpty ? MfaMethod.all : extra.methods,
    );
  }
  return OtpScreen(mfaToken: extra is String ? extra : '');
}

/// MFA_SETUP_REQUIRED sign-in step; [extra] is the LoginResponse or its mfaToken.
Widget mfaEnrollScreenFromExtra(Object? extra) => MfaEnrollScreen(
      mfaToken: extra is LoginResponse ? extra.mfaToken ?? '' : (extra is String ? extra : ''),
    );

/// [extra] is a [RecoveryCodesArgs] or a plain list of codes.
Widget recoveryCodesScreenFromExtra(Object? extra) {
  if (extra is RecoveryCodesArgs) {
    return RecoveryCodesScreen(codes: extra.codes, completesLogin: extra.completesLogin);
  }
  return RecoveryCodesScreen(
    codes: extra is List ? extra.whereType<String>().toList() : const [],
  );
}

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
    try {
      // Leave once the stored session has been checked, however long secure storage takes
      await ref.read(authStateProvider.notifier).ready;
    } catch (e) {
      // An unreadable stored session counts as signed out
      debugPrint('[Splash] stored session check failed: $e');
    }
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
