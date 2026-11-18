// Widget Tests: CA home dashboard
//   GET /users/me                        → the profile itself (users.controller.ts:85, users.service.ts:55-74)
//   GET /tasks?status=pending&limit=3    → {data, total, page, limit}; tasks are created pending
//                                          (tasks.service.ts:166), rows carry overdue (task-sql.ts:21)
//   GET /sos?status=active&limit=3       → {data, total, page, limit, counts: {active, resolved}}
//                                          (sos-alerts.service.ts:22-30, 133-141)
//   GET /gps/live                        → a plain array of {id, fullName, lat, lng, status: online|offline|
//                                          moving, ...} (gps.controller.ts:73-77, gps.service.ts:27-50, 129-136)
//   GET /dashboard/stats                 → {totalMilitia, activeToday, pendingTasks, pendingApprovals,
//                                          activeSosAlerts} (dashboard.service.ts:13-19, 313-360)
// Each call fails on its own: its section says why, the rest of the dashboard stays.
// Run: flutter test test/widget_home_ca_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/core/router/routes.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/home/screens/home_ca_screen.dart';
import 'package:police_app/shared/widgets/app_logo.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Map<String, Object?> _task(String id, {bool overdue = false}) => {
      'id': id,
      'code': 'TASK-20260914-$id',
      'title': 'Task $id',
      'status': 'pending',
      'priority': 'medium',
      'overdue': overdue,
      'deadline': '2026-09-20T01:00:00.000Z',
    };

Map<String, Object?> _alert(String id) =>
    {'id': id, 'code': 'SOS-20260914-$id', 'severity': 'urgent', 'title': 'Alert $id', 'message': 'Message $id'};

Map<String, Object?> _member(String id, String status) => {
      'id': id,
      'militiaId': id,
      'userId': 'u-$id',
      'name': 'Member $id',
      'fullName': 'Member $id',
      'unitCode': 'KP1',
      'lat': 10.72,
      'lng': 106.64,
      'accuracy': null,
      'lastUpdate': '2026-09-14T01:00:00.000Z',
      'lastSeenAt': '2026-09-14T01:00:00.000Z',
      'status': status,
    };

ResponseBody _status(int status, [String? code]) =>
    jsonBody(status, {'statusCode': status, if (code != null) 'message': code});

class _Backend {
  ResponseBody Function()? me;
  ResponseBody Function()? tasks;
  ResponseBody Function()? sos;
  ResponseBody Function()? gps;
  ResponseBody Function()? stats;

  ResponseBody handle(RequestOptions o) => switch (o.path) {
        '/users/me' => me?.call() ?? jsonBody(200, {'id': 'u-1', 'username': 'ca01', 'fullName': 'Le Van C'}),
        '/tasks' => tasks?.call() ??
            jsonBody(200, {
              'data': [_task('T1', overdue: true), _task('T2')],
              'total': 5,
              'page': 1,
              'limit': 3,
            }),
        '/sos' => sos?.call() ??
            jsonBody(200, {
              'data': [_alert('A1'), _alert('A2')],
              'total': 3,
              'page': 1,
              'limit': 3,
              'counts': {'active': 3, 'resolved': 8},
            }),
        '/gps/live' =>
          gps?.call() ?? jsonBody(200, [_member('m1', 'online'), _member('m2', 'moving'), _member('m3', 'offline')]),
        '/dashboard/stats' => stats?.call() ??
            jsonBody(200, {
              'totalMilitia': 20,
              'activeToday': 7,
              'pendingTasks': 6,
              'pendingApprovals': 4,
              'activeSosAlerts': 9,
            }),
        _ => _status(404),
      };
}

Future<(FakeAdapter, GoRouter)> _pump(WidgetTester tester, _Backend backend) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(backend.handle);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  Widget target(String path) => Scaffold(body: Text('route $path'));
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (context, state) => const HomeCAScreen()),
    for (final path in [
      Routes.caNotifications,
      Routes.caAlerts,
      Routes.caCompliance,
      Routes.caTrainingMgmt,
      Routes.caApprovals,
      Routes.caTaskCreate,
    ])
      GoRoute(path: path, builder: (context, state) => target(path)),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return (adapter, router);
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-HOME-01: the dashboard reads every endpoint in its current shape', (tester) async {
    final (adapter, _) = await _pump(tester, _Backend());

    final byPath = {for (final r in adapter.requests) r.path: r.queryParameters};
    expect(byPath.keys, unorderedEquals(['/users/me', '/tasks', '/sos', '/gps/live', '/dashboard/stats']));
    expect(byPath['/tasks'], {'status': 'pending', 'limit': 3});
    expect(byPath['/sos'], {'status': 'active', 'limit': 3});

    expect(find.text(viL10n.homeCaTitle), findsOneWidget);
    expect(find.text(viL10n.homeCaGreeting('Le Van C')), findsOneWidget);
    // The greeting card carries the Công an badge
    expect(find.byType(AppLogo), findsOneWidget);
    expect(find.byIcon(Icons.local_police), findsNothing);
    // Counters from the stats; the SOS badge counts the active alerts of the scope, as the alerts tab
    expect(find.text('7'), findsOneWidget);
    expect(find.text('6'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text(viL10n.homeCaKpiSos), findsOneWidget);
    expect(find.text(viL10n.homeCaAlertsTitle(3)), findsOneWidget);
    expect(find.text('Alert A1'), findsOneWidget);
    expect(find.text('Message A2'), findsOneWidget);
    expect(find.text(viL10n.homeCaTasksTitle), findsOneWidget);
    expect(find.text('Task T1'), findsOneWidget);
    expect(find.text(viL10n.tasksStatusPending), findsNWidgets(2));
    expect(find.text(viL10n.tasksStatusOverdue), findsOneWidget);
    expect(find.text(viL10n.homeCaStatsFailed(viL10n.errorServer)), findsNothing);
  });

  testWidgets('WT-HOME-02: without the stats the counters come from the lists and the reason is shown',
      (tester) async {
    await _pump(tester, _Backend()..stats = (() => _status(500)));

    expect(find.text(viL10n.homeCaStatsFailed(viL10n.errorServer)), findsOneWidget);
    // Online or moving members on GPS, the pending task total, no approvals count, the active SOS count
    expect(find.text('2'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
    expect(find.text('-'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('Alert A1'), findsOneWidget);
    expect(find.text('Task T2'), findsOneWidget);
  });

  testWidgets('WT-HOME-03: counters sent as numeric strings read the same', (tester) async {
    await _pump(
      tester,
      _Backend()
        ..stats = (() => jsonBody(200, {'activeToday': '7', 'pendingTasks': '6', 'pendingApprovals': '4'}))
        ..sos = (() => jsonBody(200, {
              'data': [_alert('A1')],
              'counts': {'active': '3'},
            })),
    );

    expect(find.text('7'), findsOneWidget);
    expect(find.text('6'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('WT-HOME-04: SOS alerts failing are explained, the rest stays, and retry reloads', (tester) async {
    final backend = _Backend()..sos = (() => _status(403));
    final (adapter, _) = await _pump(tester, backend);

    expect(find.text(viL10n.homeCaAlertsFailed(viL10n.errorForbidden)), findsOneWidget);
    expect(find.text('Task T1'), findsOneWidget);
    expect(find.text(viL10n.homeCaGreeting('Le Van C')), findsOneWidget);

    backend.sos = null;
    await _tap(tester, find.widgetWithText(TextButton, viL10n.commonRetry));

    expect(find.text('Alert A1'), findsOneWidget);
    expect(adapter.requests, hasLength(10));
  });

  testWidgets('WT-HOME-05: tasks failing are explained with the backend reason', (tester) async {
    await _pump(tester, _Backend()..tasks = (() => _status(400, 'invalid_status')));

    expect(find.text(viL10n.homeCaTasksFailed(viL10n.commonErrorInvalidStatus)), findsOneWidget);
    expect(find.text('Alert A1'), findsOneWidget);
  });

  testWidgets('WT-HOME-06: no alerts and no pending tasks show empty sections', (tester) async {
    await _pump(
      tester,
      _Backend()
        ..sos = (() => jsonBody(200, {'data': [], 'total': 0, 'page': 1, 'limit': 3, 'counts': {'active': 0}}))
        ..tasks = (() => jsonBody(200, {'data': [], 'total': 0, 'page': 1, 'limit': 3}))
        ..stats = (() => jsonBody(200, {'activeToday': 1, 'pendingTasks': 0, 'pendingApprovals': 0, 'activeSosAlerts': 0})),
    );

    expect(find.text(viL10n.homeCaTasksEmpty), findsOneWidget);
    expect(find.text(viL10n.homeCaAlertsTitle(0)), findsNothing);
    expect(find.text(viL10n.homeCaKpiSos), findsNothing);
  });

  testWidgets('WT-HOME-07: when every call fails the reason is shown, and retry loads the dashboard',
      (tester) async {
    final backend = _Backend()
      ..me = (() => _status(500))
      ..tasks = (() => _status(500))
      ..sos = (() => _status(500))
      ..gps = (() => _status(500))
      ..stats = (() => _status(500));
    await _pump(tester, backend);

    expect(find.text(viL10n.homeCaLoadFailed(viL10n.errorServer)), findsOneWidget);

    backend
      ..me = null
      ..tasks = null
      ..sos = null
      ..gps = null
      ..stats = null;
    await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.commonRetry));

    expect(find.text(viL10n.homeCaGreeting('Le Van C')), findsOneWidget);
  });

  testWidgets('WT-HOME-08: without the profile the greeting has no name, the dashboard stays', (tester) async {
    await _pump(tester, _Backend()..me = (() => _status(401)));

    expect(find.text(viL10n.homeCaGreetingAnonymous), findsOneWidget);
    expect(find.text('Alert A1'), findsOneWidget);
  });

  testWidgets('WT-HOME-09: answers in an old or unexpected shape are reported, not crashed on', (tester) async {
    await _pump(
      tester,
      _Backend()
        // GET /gps/live used to be read as {data: [...]}; SOS as a bare list
        ..gps = (() => jsonBody(200, {'data': []}))
        ..sos = (() => jsonBody(200, [_alert('A1')]))
        ..stats = (() => _status(500)),
    );

    expect(find.text(viL10n.homeCaAlertsFailed(viL10n.errorBadResponse)), findsOneWidget);
    // No stats and no readable GPS: nothing to count members on duty with
    expect(find.text('-'), findsNWidgets(2));
    expect(find.text('Task T1'), findsOneWidget);
  });

  testWidgets('WT-HOME-10: every entry opens its screen', (tester) async {
    final (_, router) = await _pump(tester, _Backend());

    final targets = <Finder, String>{
      find.byTooltip(viL10n.homeCaNotificationsTooltip): Routes.caNotifications,
      find.text(viL10n.homeCaSeeAll): Routes.caAlerts,
      find.text('Alert A1'): Routes.caAlerts,
      find.text(viL10n.homeCaQuickCompliance): Routes.caCompliance,
      find.text(viL10n.homeCaQuickTraining): Routes.caTrainingMgmt,
      find.text(viL10n.homeCaQuickApprovals): Routes.caApprovals,
      find.text(viL10n.homeCaTasksCreate): Routes.caTaskCreate,
    };
    for (final entry in targets.entries) {
      await _tap(tester, entry.key);
      expect(find.text('route ${entry.value}'), findsOneWidget, reason: entry.value);
      router.pop();
      await tester.pumpAndSettle();
    }
  });
}
