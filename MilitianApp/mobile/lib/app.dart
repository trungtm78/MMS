import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/constants/app_colors.dart';
import 'core/constants/api_constants.dart';
import 'core/network/dio_client.dart';
import 'features/auth/providers/auth_provider.dart';
import 'shared/services/push_notification_service.dart';
import 'shared/services/websocket_service.dart';

/// Global navigator key — used for push notification routing when app is
/// in foreground or resumed from background.
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

class App extends ConsumerStatefulWidget {
  const App({super.key});

  @override
  ConsumerState<App> createState() => _AppState();
}

class _AppState extends ConsumerState<App> {
  bool _servicesInitialized = false;

  @override
  void initState() {
    super.initState();
    // Init push notifications once on app start (permission prompt, token fetch)
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(pushNotificationServiceProvider).initialize();
      // Wire push notification routing into GoRouter
      final router = ref.read(routerProvider);
      PushNotificationService.setRouteCallback((path) {
        router.push(path);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    // Wire auth state → connect/disconnect services
    ref.listen<AuthState>(authStateProvider, (previous, next) {
      final wasAuthenticated = previous?.isAuthenticated ?? false;
      final isAuthenticated = next.isAuthenticated;

      if (!wasAuthenticated && isAuthenticated && !_servicesInitialized) {
        _servicesInitialized = true;
        // Connect WebSocket after login
        ref.read(webSocketServiceProvider).connect();
        // Register FCM token with backend
        _registerFcmToken();
      } else if (wasAuthenticated && !isAuthenticated) {
        _servicesInitialized = false;
        // Disconnect WebSocket on logout
        ref.read(webSocketServiceProvider).disconnect();
      }
    });

    return MaterialApp.router(
      title: 'Dân Quân Tự Vệ',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      // Provide navigatorKey so push notification service can route
      // Note: GoRouter manages its own navigator internally; we hook via
      // the router's observer pattern instead of navigatorKey on MaterialApp.
      // See _routeFromPayload in push_notification_service.dart.
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.secondary,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: AppColors.background,
        appBarTheme: const AppBarTheme(
          elevation: 0,
          centerTitle: true,
          backgroundColor: Colors.transparent,
          foregroundColor: AppColors.textPrimary,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            minimumSize: const Size(double.infinity, 48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppColors.divider),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppColors.divider),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppColors.secondary, width: 2),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppColors.error),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 14,
          ),
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 2,
          shadowColor: Colors.black12,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  Future<void> _registerFcmToken() async {
    try {
      final token = await ref.read(pushNotificationServiceProvider).getToken();
      if (token == null) return;
      final storage = ref.read(secureStorageProvider);
      final accessToken = await storage.getAccessToken();
      if (accessToken == null) return;

      // POST FCM token to backend — best-effort, silent fail
      final dio = DioClient.getInstance(storage);
      await dio.post(
        ApiConstants.fcmToken,
        data: {'token': token, 'platform': _platformName()},
      );
    } catch (_) {
      // Silent fail — token will be re-registered on next launch
    }
  }

  String _platformName() {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return 'unknown';
  }
}
