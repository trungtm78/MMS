// Widget Tests: the bottom navigation shell, the profile screen and the settings screen
//   - shell: tab labels from the resources, the active tab follows the location, taps navigate, the
//     task badge counts the caller's waiting tasks (GET /tasks, tasks_repository.dart)
//   - profile: GET /users/me {data} fills the card; quick actions and menu open their routes; logout
//     calls POST /auth/logout and opens the login screen
//   - settings: biometric switch when the device supports it, change-password entry, push opt-in
// Text is asserted through the resources (viL10n).
// Run: flutter test test/widget_profile_shell_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/core/router/routes.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';
import 'package:militian_app/features/profile/screens/profile_screen.dart';
import 'package:militian_app/features/profile/screens/settings_screen.dart';
import 'package:militian_app/features/tasks/repositories/tasks_repository.dart';
import 'package:militian_app/shared/services/push_notification_service.dart';
import 'package:militian_app/shared/widgets/main_shell.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

class _FakePush implements PushNotificationService {
  int initialized = 0;
  int deleted = 0;

  @override
  Future<void> initialize() async => initialized++;

  @override
  Future<void> deleteToken() async => deleted++;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Widget _page(String path) => Scaffold(body: Text('PAGE $path'));

void _mockBiometrics(WidgetTester tester) {
  const channel = MethodChannel('plugins.flutter.io/local_auth');
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
    return switch (call.method) {
      'getAvailableBiometrics' => ['fingerprint'],
      'isDeviceSupported' => true,
      _ => null,
    };
  });
  addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
}

void main() {
  group('MainShell', () {
    Future<GoRouter> pumpShell(WidgetTester tester, {String initial = Routes.home, int waiting = 0}) async {
      final rows = [
        for (var i = 0; i < waiting; i++) backendTaskRow('t$i', 'pending', deadline: '2099-01-01T00:00:00.000Z'),
      ];
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = FakeAdapter((o) {
          final page = o.queryParameters['page'] as int;
          final from = (page - 1) * TasksRepository.pageSize;
          return jsonBody(200, backendPage(rows.skip(from).take(TasksRepository.pageSize).toList()));
        });
      final router = GoRouter(
        initialLocation: initial,
        routes: [
          ShellRoute(
            builder: (context, state, child) => MainShell(child: child),
            routes: [
              for (final path in [
                Routes.home,
                Routes.checkin,
                Routes.tasks,
                Routes.notifications,
                Routes.profile,
                Routes.settings,
              ])
                GoRoute(path: path, builder: (context, state) => _page(path)),
            ],
          ),
        ],
      );
      await tester.pumpWidget(ProviderScope(
        overrides: [
          secureStorageProvider.overrideWithValue(MemoryStorage()..userId = 'u-me'),
          tasksRepositoryProvider.overrideWithValue(TasksRepository(dio)),
        ],
        child: localizedRouterApp(router),
      ));
      await tester.pumpAndSettle();
      return router;
    }

    int currentIndex(WidgetTester tester) =>
        tester.widget<BottomNavigationBar>(find.byType(BottomNavigationBar)).currentIndex;

    testWidgets('WT-SHELL-01: labelled tabs follow the location and navigate', (tester) async {
      await pumpShell(tester);

      expect(currentIndex(tester), 0);
      const tabs = [
        (Routes.checkin, 1),
        (Routes.tasks, 2),
        (Routes.notifications, 3),
        (Routes.profile, 4),
        (Routes.home, 0),
      ];
      final labels = {
        Routes.home: viL10n.shellNavHome,
        Routes.checkin: viL10n.shellNavCheckin,
        Routes.tasks: viL10n.shellNavTasks,
        Routes.notifications: viL10n.shellNavNotifications,
        Routes.profile: viL10n.shellNavProfile,
      };
      for (final (path, index) in tabs) {
        await tester.tap(find.text(labels[path]!));
        await tester.pumpAndSettle();
        expect(find.text('PAGE $path'), findsOneWidget, reason: path);
        expect(currentIndex(tester), index, reason: path);
      }
    });

    testWidgets('WT-SHELL-02: settings belongs to the profile tab', (tester) async {
      await pumpShell(tester, initial: Routes.settings);
      expect(currentIndex(tester), 4);
    });

    testWidgets('WT-SHELL-03: the task badge counts waiting tasks and caps at 99+', (tester) async {
      await pumpShell(tester);
      expect(find.byType(Badge), findsNothing);

      await pumpShell(tester, waiting: 2);
      expect(find.widgetWithText(Badge, '2'), findsOneWidget);

      await pumpShell(tester, waiting: 105);
      expect(find.widgetWithText(Badge, '99+'), findsOneWidget);
    });
  });

  group('ProfileScreen', () {
    Future<(GoRouter, FakeAdapter, MemoryStorage)> pumpProfile(
      WidgetTester tester, {
      ResponseBody Function(RequestOptions)? profile,
    }) async {
      final storage = MemoryStorage(roles: ['dqtv']);
      final adapter = FakeAdapter(routeTable({
        'GET /users/me': profile ??
            (_) => jsonBody(200, {
                  'data': {
                    'fullName': 'Nguyen Van An',
                    'rank': 'Binh nhat',
                    'position': 'Chien si',
                    'unit': 'Phu Dinh',
                    'phone': '0901234567',
                    'email': 'an@example.com',
                  },
                }),
        'POST /auth/logout': noContent,
      }));
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
      final router = GoRouter(
        initialLocation: Routes.profile,
        routes: [
          GoRoute(path: Routes.profile, builder: (context, state) => const ProfileScreen()),
          for (final path in [Routes.login, Routes.settings, Routes.security, Routes.leaveRequest, Routes.myRequests])
            GoRoute(path: path, builder: (context, state) => _page(path)),
        ],
      );
      await tester.pumpWidget(ProviderScope(
        overrides: [
          secureStorageProvider.overrideWithValue(storage),
          apiDioProvider.overrideWithValue(dio),
          authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(storage, dio: dio)),
        ],
        child: localizedRouterApp(router),
      ));
      await tester.pumpAndSettle();
      return (router, adapter, storage);
    }

    testWidgets('WT-PROFILE-01: the fetched profile fills the card under resource labels', (tester) async {
      final (_, adapter, _) = await pumpProfile(tester);

      expect(adapter.requests.first.path, '/users/me');
      expect(find.text(viL10n.profileScreenTitle), findsOneWidget);
      expect(find.text('Nguyen Van An'), findsOneWidget);
      expect(find.text('NA'), findsOneWidget);
      expect(find.text('Binh nhat · Chien si'), findsOneWidget);
      expect(find.text(viL10n.profileScreenStatusActive), findsOneWidget);
      for (final text in [
        viL10n.profileScreenStatSeniorityLabel,
        viL10n.profileScreenStatSeniorityValue,
        viL10n.profileScreenStatKpiLabel,
        viL10n.profileScreenStatRankLabel,
        viL10n.profileScreenPersonalInfoTitle,
        viL10n.profileScreenPhoneLabel,
        '0901234567',
        viL10n.profileScreenEmailLabel,
        'an@example.com',
        viL10n.profileScreenUnitLabel,
        'Phu Dinh',
        viL10n.profileScreenWorkInfoTitle,
        viL10n.profileScreenNeighborhoodLabel,
        viL10n.profileScreenNeighborhoodValue,
        viL10n.profileScreenAreaPoliceLabel,
        viL10n.profileScreenAreaPoliceValue,
        viL10n.profileScreenJoinedLabel,
        viL10n.profileScreenPositionLabel,
        viL10n.profileScreenQuickWorkHistory,
        viL10n.profileScreenQuickHotline,
        viL10n.profileScreenMenuAbout,
        viL10n.profileScreenMenuSupport,
        viL10n.profileScreenLogout,
      ]) {
        expect(find.text(text), findsOneWidget, reason: text);
      }
    });

    testWidgets('WT-PROFILE-02: quick actions and the menu open their screens', (tester) async {
      final (router, _, _) = await pumpProfile(tester);
      final targets = {
        viL10n.profileScreenQuickLeaveRequest: Routes.leaveRequest,
        viL10n.profileScreenQuickMyRequests: Routes.myRequests,
        viL10n.profileScreenMenuSettings: Routes.settings,
        viL10n.profileScreenMenuSecurity: Routes.security,
      };
      for (final entry in targets.entries) {
        await _tap(tester, find.text(entry.key));
        expect(find.text('PAGE ${entry.value}'), findsOneWidget, reason: entry.key);
        router.pop();
        await tester.pumpAndSettle();
      }
      expect(find.byType(ProfileScreen), findsOneWidget);
    });

    testWidgets('WT-PROFILE-03: logout ends the session and opens the login screen', (tester) async {
      final (_, adapter, storage) = await pumpProfile(tester);

      await _tap(tester, find.text(viL10n.profileScreenLogout));

      expect(adapter.requests.last.path, '/auth/logout');
      expect(find.text('PAGE ${Routes.login}'), findsOneWidget);
      expect(storage.access, isNull);
    });

    testWidgets('WT-PROFILE-04: without a profile answer the placeholders are shown', (tester) async {
      await pumpProfile(tester, profile: (_) => jsonBody(500, backendError(500, 'Internal server error')));

      expect(find.text('—'), findsWidgets);
      expect(find.text(viL10n.profileScreenStatusActive), findsOneWidget);
    });
  });

  group('SettingsScreen', () {
    Future<(MemoryStorage, _FakePush)> pumpSettings(WidgetTester tester, {MemoryStorage? storage}) async {
      final store = storage ?? MemoryStorage(roles: ['dqtv']);
      final push = _FakePush();
      final router = GoRouter(
        initialLocation: Routes.settings,
        routes: [
          GoRoute(path: Routes.settings, builder: (context, state) => const SettingsScreen()),
          GoRoute(path: Routes.changePassword, builder: (context, state) => _page(Routes.changePassword)),
        ],
      );
      await tester.pumpWidget(ProviderScope(
        overrides: [
          secureStorageProvider.overrideWithValue(store),
          pushNotificationServiceProvider.overrideWithValue(push),
        ],
        child: localizedRouterApp(router),
      ));
      await tester.pumpAndSettle();
      return (store, push);
    }

    testWidgets('WT-SETTINGS-01: sections, and push notifications can be turned off and on', (tester) async {
      final (storage, push) = await pumpSettings(tester);

      expect(find.text(viL10n.profileSettingsTitle), findsOneWidget);
      expect(find.text(viL10n.profileSettingsSectionSecurity), findsOneWidget);
      expect(find.text(viL10n.profileSettingsSectionNotifications), findsOneWidget);
      expect(find.text(viL10n.profileSettingsBiometricTitle), findsNothing);
      expect(find.text(viL10n.profileSettingsPushTitle), findsOneWidget);
      expect(find.text(viL10n.profileSettingsPushOn), findsOneWidget);

      await _tap(tester, find.text(viL10n.profileSettingsPushTitle));

      expect(find.text(viL10n.profileSettingsPushOff), findsOneWidget);
      expect(storage.other['push_notifications_enabled'], 'false');
      expect(push.deleted, 1);

      await _tap(tester, find.text(viL10n.profileSettingsPushTitle));

      expect(find.text(viL10n.profileSettingsPushOn), findsOneWidget);
      expect(storage.other['push_notifications_enabled'], 'true');
      expect(push.initialized, 1);
    });

    testWidgets('WT-SETTINGS-02: the change-password entry opens its screen', (tester) async {
      await pumpSettings(tester);

      expect(find.text(viL10n.profileSettingsChangePasswordSubtitle), findsOneWidget);
      await _tap(tester, find.text(viL10n.profileSettingsChangePasswordTitle));

      expect(find.text('PAGE ${Routes.changePassword}'), findsOneWidget);
    });

    testWidgets('WT-SETTINGS-03: with biometrics on the device the switch turns biometric sign-in on',
        (tester) async {
      _mockBiometrics(tester);
      final (storage, _) = await pumpSettings(
        tester,
        storage: MemoryStorage(roles: ['dqtv'])..other['push_notifications_enabled'] = 'false',
      );

      expect(find.text(viL10n.profileSettingsPushOff), findsOneWidget);
      expect(find.text(viL10n.profileSettingsBiometricSubtitle), findsOneWidget);
      await _tap(tester, find.text(viL10n.profileSettingsBiometricTitle));

      expect(storage.biometric, isTrue);
    });
  });
}
