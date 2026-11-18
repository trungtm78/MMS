// Widget Tests: own profile screens, CA and DQTV
//   GET /users/me              → the profile itself (users.service.ts getProfile)
//   GET /police-profile        → {badgeNumber, rank, station, department, username, fullName} (CA)
//   GET /militia/me/data-export → {profile: {militiaCode, rank, unitName, ...} | null, training, ...} (DQTV)
//   GET /kpi/current           → the score object itself: totalScore, attendanceScore, taskScore, maxScore
//   POST /auth/logout on confirmed sign-out; the security entry opens Routes.security
// Run: flutter test test/widget_profile_screens_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/core/router/routes.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/profile/screens/profile_ca_screen.dart';
import 'package:police_app/features/profile/screens/profile_dqtv_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

Map<String, Object?> _me({String fullName = 'Le Van C'}) => {
      'id': 'u-1',
      'username': 'ca01',
      'fullName': fullName,
      'email': 'c@example.com',
      'phone': null,
      'status': 'active',
      'unitScope': 'KP1',
      'role': 'ca_officer',
      'roles': ['ca_officer'],
    };

const _police = {
  'badgeNumber': '123456',
  'rank': 'Captain',
  'station': 'Ward 5',
  'department': null,
  'username': 'ca01',
  'fullName': 'Le Van C',
};

const _export = {
  'profile': {'id': 'mp-1', 'militiaCode': 'DQ-001', 'fullName': 'Le Van C', 'rank': 'Private', 'unitName': 'Block 1'},
  'training': [],
  'attendance': [],
};

const _kpi = {'score': 8.5, 'totalScore': 8.5, 'attendanceScore': 9, 'taskScore': 8, 'maxScore': 10};

ResponseBody _status(int status, [String? code]) =>
    jsonBody(status, {'statusCode': status, if (code != null) 'message': code});

class _Backend {
  int meStatus = 200;
  String fullName = 'Le Van C';
  ResponseBody Function()? police;
  ResponseBody Function()? export;
  ResponseBody Function()? kpi;
  ResponseBody Function()? documents;

  ResponseBody handle(RequestOptions o) => switch (o.path) {
        '/users/me' => meStatus == 200 ? jsonBody(200, _me(fullName: fullName)) : _status(meStatus),
        '/police-profile' => police?.call() ?? jsonBody(200, _police),
        '/militia/me/data-export' => export?.call() ?? jsonBody(200, _export),
        '/kpi/current' => kpi?.call() ?? jsonBody(200, _kpi),
        '/militia/mp-1/documents' =>
          documents?.call() ?? jsonBody(200, [fileView('d1', name: 'contract.pdf', mimeType: 'application/pdf')]),
        '/auth/logout' => jsonBody(200, {'ok': true}),
        _ => _status(404),
      };
}

Future<FakeAdapter> _pump(WidgetTester tester, Widget screen, _Backend backend) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(backend.handle);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (context, state) => screen),
    GoRoute(path: Routes.security, builder: (context, state) => const Scaffold(body: Text('security'))),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(MemoryStorage(access: null, refresh: null)),
      dioProvider.overrideWithValue(dio),
    ],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// Cancel keeps the session; confirming posts the sign-out
Future<void> _signOutFlow(WidgetTester tester, FakeAdapter adapter) async {
  final logout = find.widgetWithText(OutlinedButton, viL10n.profileLogout);
  await _tap(tester, logout);
  expect(find.text(viL10n.profileLogoutConfirmMessage), findsOneWidget);
  await _tap(tester, find.widgetWithText(TextButton, viL10n.profileLogoutConfirmCancel));
  expect(adapter.requests.where((r) => r.path == '/auth/logout'), isEmpty);

  await _tap(tester, logout);
  await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.profileLogoutConfirmOk));
  expect(adapter.requests.where((r) => r.path == '/auth/logout'), hasLength(1));
}

void main() {
  group('CA', () {
    testWidgets('WT-PROF-01: shows the account and the police service data the backend returns', (tester) async {
      final adapter = await _pump(tester, const ProfileCAScreen(), _Backend());

      expect(adapter.requests.map((r) => r.path), ['/users/me', '/police-profile']);
      expect(find.text(viL10n.profileTitle), findsOneWidget);
      expect(find.text('Le Van C'), findsOneWidget);
      expect(find.text('L'), findsOneWidget);
      expect(find.text(viL10n.profileCaRoleBadge), findsOneWidget);
      expect(find.text('ca01'), findsOneWidget);
      expect(find.text('c@example.com'), findsOneWidget);
      // No phone on file
      expect(find.text(viL10n.profileNotUpdated), findsOneWidget);
      expect(find.text(viL10n.profileCaSectionPolice), findsOneWidget);
      expect(find.text('123456'), findsOneWidget);
      expect(find.text('Captain'), findsOneWidget);
      expect(find.text('Ward 5'), findsOneWidget);
    });

    testWidgets('WT-PROF-02: the police service data failing is said, the account stays', (tester) async {
      await _pump(tester, const ProfileCAScreen(), _Backend()..police = () => _status(500));

      expect(find.text('Le Van C'), findsOneWidget);
      expect(find.text(viL10n.profileCaSectionPolice), findsNothing);
      expect(find.text(viL10n.profileCaPoliceFailed(viL10n.errorServer)), findsOneWidget);
    });

    testWidgets('WT-PROF-03: the account failing to load says why, and retry loads it', (tester) async {
      final backend = _Backend()..meStatus = 404;
      await _pump(tester, const ProfileCAScreen(), backend);

      expect(find.text(viL10n.profileLoadFailed(viL10n.errorNotFound)), findsOneWidget);

      backend.meStatus = 200;
      await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.commonRetry));

      expect(find.text('Le Van C'), findsOneWidget);
    });

    testWidgets('WT-PROF-04: sign-out asks first; security opens the MFA screen', (tester) async {
      final adapter = await _pump(tester, const ProfileCAScreen(), _Backend());

      await _signOutFlow(tester, adapter);
    });

    testWidgets('WT-PROF-05: the security entry opens the security screen', (tester) async {
      await _pump(tester, const ProfileCAScreen(), _Backend());

      await _tap(tester, find.text(viL10n.profileSecurity));

      expect(find.text('security'), findsOneWidget);
    });
  });

  group('DQTV', () {
    testWidgets('WT-PROF-06: shows the account, this month KPI and the military profile', (tester) async {
      final adapter = await _pump(tester, const ProfileDqtvScreen(), _Backend());

      expect(adapter.requests.map((r) => r.path),
          ['/users/me', '/militia/me/data-export', '/kpi/current', '/militia/mp-1/documents']);
      expect(adapter.requests.singleWhere((r) => r.path == '/kpi/current').queryParameters, isEmpty);
      expect(find.text('Le Van C'), findsOneWidget);
      expect(find.text(viL10n.profileDqtvRoleBadge), findsOneWidget);
      expect(find.text(viL10n.profileDqtvSectionKpi), findsOneWidget);
      expect(find.text('8.5'), findsOneWidget);
      expect(find.text('9'), findsOneWidget);
      expect(find.text('8'), findsOneWidget);
      expect(find.text(viL10n.profileDqtvKpiTotal), findsOneWidget);
      expect(find.text(viL10n.profileDqtvKpiAttendance), findsOneWidget);
      expect(find.text(viL10n.profileDqtvKpiTasks), findsOneWidget);
      expect(find.text(viL10n.profileDqtvSectionMilitary), findsOneWidget);
      expect(find.text('DQ-001'), findsOneWidget);
      expect(find.text('Private'), findsOneWidget);
      expect(find.text('Block 1'), findsOneWidget);
    });

    testWidgets('WT-PROF-07: the military profile and the KPI failing are each said', (tester) async {
      await _pump(
        tester,
        const ProfileDqtvScreen(),
        _Backend()
          ..export = (() => _status(500))
          ..kpi = (() => _status(403, 'kpi_not_visible')),
      );

      expect(find.text('Le Van C'), findsOneWidget);
      expect(find.text(viL10n.profileDqtvMilitiaFailed(viL10n.errorServer)), findsOneWidget);
      expect(find.text(viL10n.profileDqtvKpiFailed(viL10n.dqtvErrorKpiNotVisible)), findsOneWidget);
      expect(find.text(viL10n.profileDqtvSectionMilitary), findsNothing);
    });

    testWidgets('WT-PROF-08: no militia profile and no score yet; a blank name has a placeholder initial',
        (tester) async {
      await _pump(
        tester,
        const ProfileDqtvScreen(),
        _Backend()
          ..fullName = ''
          ..export = (() => jsonBody(200, {'profile': null, 'training': []}))
          ..kpi = (() => jsonBody(200, {'totalScore': null, 'attendanceScore': null, 'taskScore': null})),
      );

      expect(find.text('?'), findsOneWidget);
      expect(find.text(viL10n.profileDqtvSectionMilitary), findsNothing);
      expect(find.text('-'), findsNWidgets(3));
    });

    testWidgets('WT-PROF-11: the member reads the documents of their own profile, without adding any',
        (tester) async {
      await _pump(tester, const ProfileDqtvScreen(), _Backend());

      expect(find.text(viL10n.dqtvDocumentsTitle), findsOneWidget);
      expect(find.text('contract.pdf'), findsOneWidget);
      expect(find.text(viL10n.dqtvDocumentsSave), findsNothing);
      expect(find.text(viL10n.filesPickGallery), findsNothing);
    });

    testWidgets('WT-PROF-12: documents failing to load are explained; none attached is said', (tester) async {
      final backend = _Backend()..documents = (() => _status(500));
      await _pump(tester, const ProfileDqtvScreen(), backend);

      expect(find.text(viL10n.dqtvDocumentsLoadFailed(viL10n.errorServer)), findsOneWidget);

      backend.documents = () => jsonBody(200, const []);
      await _tap(tester, find.widgetWithText(TextButton, viL10n.commonRetry));

      expect(find.text(viL10n.dqtvDocumentsEmpty), findsOneWidget);
    });

    testWidgets('WT-PROF-13: KPI scores sent as numeric strings read the same', (tester) async {
      await _pump(
        tester,
        const ProfileDqtvScreen(),
        _Backend()..kpi = (() => jsonBody(200, {'totalScore': '8.50', 'attendanceScore': '9', 'taskScore': '8.0'})),
      );

      expect(find.text('8.5'), findsOneWidget);
      expect(find.text('9'), findsOneWidget);
      expect(find.text('8'), findsOneWidget);
    });

    testWidgets('WT-PROF-09: the account failing to load says why, and retry loads it', (tester) async {
      final backend = _Backend()..meStatus = 500;
      await _pump(tester, const ProfileDqtvScreen(), backend);

      expect(find.text(viL10n.profileLoadFailed(viL10n.errorServer)), findsOneWidget);

      backend.meStatus = 200;
      await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.commonRetry));

      expect(find.text('Le Van C'), findsOneWidget);
    });

    testWidgets('WT-PROF-10: sign-out asks first; the security entry opens the security screen', (tester) async {
      final adapter = await _pump(tester, const ProfileDqtvScreen(), _Backend());

      await _signOutFlow(tester, adapter);
      await _tap(tester, find.text(viL10n.profileSecurity));
      expect(find.text('security'), findsOneWidget);
    });
  });
}
