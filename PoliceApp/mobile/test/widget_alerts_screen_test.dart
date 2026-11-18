// Widget Tests: SOS alerts screen (CA)
//   GET   /sos?status=active|resolved → {data, total, page, limit, counts: {active, resolved}}: the
//         caller's scope, active first; rows carry code, incidentType, severity, title, message,
//         locationName, status, statusGroup, reporterName, createdAt (sos-alerts.service.ts)
//   PATCH /sos/:id/status {status, resolutionNote?} → 404 incident_not_found outside the scope,
//         409 invalid_status_transition (sos.service.ts updateStatus, incident-values.ts)
// Run: flutter test test/widget_alerts_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:police_app/features/alerts/screens/alerts_screen.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Map<String, Object?> _alert(String id, String status, String severity, String type) => {
      'id': id,
      'code': 'SOS-20260914-$id',
      'incidentType': type,
      'severity': severity,
      'title': 'Alert $id',
      'message': 'Message $id',
      'lat': null,
      'lng': null,
      'locationName': null,
      'status': status,
      'statusGroup': status == 'resolved' || status == 'closed' ? 'resolved' : 'active',
      'reporterId': 'u-1',
      'reporterName': 'Nguyen Van A',
      'assignedTo': null,
      'resolutionNote': null,
      'createdAt': '2026-09-14T01:05:00.000Z',
      'updatedAt': '2026-09-14T01:05:00.000Z',
      'resolvedAt': null,
    };

class _Backend {
  int listStatus = 200;
  int patchStatus = 200;
  String patchCode = '';
  bool countsAsText = false;
  List<Map<String, Object?>> active = [
    _alert('A1', 'open', 'urgent', 'sos'),
    _alert('A2', 'acknowledged', 'high', 'fire'),
  ];
  List<Map<String, Object?>> resolved = [_alert('A3', 'resolved', 'medium', 'utility')];

  ResponseBody handle(RequestOptions o) {
    if (o.method == 'PATCH') {
      return patchStatus == 200
          ? jsonBody(200, {'id': 'A1', 'status': 'resolved'})
          : jsonBody(patchStatus, {'code': 'E000', 'message': patchCode, 'statusCode': patchStatus});
    }
    if (listStatus != 200) return jsonBody(listStatus, {'statusCode': listStatus});
    final rows = o.queryParameters['status'] == 'resolved' ? resolved : active;
    return jsonBody(200, {
      'data': rows,
      'total': rows.length,
      'page': 1,
      'limit': 20,
      'counts': countsAsText ? {'active': '3', 'resolved': '5'} : {'active': 3, 'resolved': 5},
    });
  }
}

Future<FakeAdapter> _pump(WidgetTester tester, _Backend backend) async {
  tester.view.physicalSize = const Size(900, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(backend.handle);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: localizedApp(const AlertsScreen()),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _resolveFirst(WidgetTester tester, {String note = ''}) async {
  await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.alertsResolveButton).first);
  expect(find.text(viL10n.alertsResolveDialogTitle), findsOneWidget);
  if (note.isNotEmpty) await tester.enterText(find.byType(TextField), note);
  await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.alertsResolveConfirm));
}

List<RequestOptions> _patches(FakeAdapter adapter) => adapter.requests.where((r) => r.method == 'PATCH').toList();

void main() {
  testWidgets('WT-ALR-01: lists the active alerts with their type, severity and code', (tester) async {
    final adapter = await _pump(tester, _Backend());

    expect(adapter.requests.map((r) => r.queryParameters['status']), unorderedEquals(['active', 'resolved']));
    expect(adapter.requests.every((r) => r.path == '/sos'), isTrue);
    expect(find.text(viL10n.alertsTitle), findsOneWidget);
    // The tab counts the whole scope, not the page
    expect(find.text(viL10n.alertsTabActive(3)), findsOneWidget);
    expect(find.text(viL10n.alertsTabResolved), findsOneWidget);
    expect(find.text('Alert A1'), findsOneWidget);
    expect(find.text('Message A2'), findsOneWidget);
    expect(find.text(viL10n.alertsSeverityUrgent), findsOneWidget);
    expect(find.text(viL10n.alertsSeverityHigh), findsOneWidget);
    expect(find.text(viL10n.alertsTypeSos), findsOneWidget);
    expect(find.text(viL10n.alertsTypeFire), findsOneWidget);
    expect(find.text('SOS-20260914-A1'), findsOneWidget);
    final time = DateFormat('HH:mm').format(DateTime.utc(2026, 9, 14, 1, 5).toLocal());
    expect(find.text(time), findsNWidgets(2));
    expect(find.widgetWithText(ElevatedButton, viL10n.alertsResolveButton), findsNWidgets(2));
  });

  testWidgets('WT-ALR-02: the handled tab lists resolved alerts without an action', (tester) async {
    await _pump(tester, _Backend());

    await _tap(tester, find.text(viL10n.alertsTabResolved));

    expect(find.text('Alert A3'), findsOneWidget);
    expect(find.text(viL10n.alertsTypeUtility), findsOneWidget);
    expect(find.text(viL10n.alertsSeverityMedium), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, viL10n.alertsResolveButton), findsNothing);
  });

  testWidgets('WT-ALR-03: resolving sends the note and reloads the lists', (tester) async {
    final adapter = await _pump(tester, _Backend());

    await _resolveFirst(tester, note: ' Handled on site ');

    final patch = _patches(adapter).single;
    expect(patch.path, '/sos/A1/status');
    expect(patch.data, {'status': 'resolved', 'resolutionNote': 'Handled on site'});
    expect(find.text(viL10n.alertsResolved), findsOneWidget);
    expect(adapter.requests.where((r) => r.method == 'GET'), hasLength(4));
  });

  testWidgets('WT-ALR-04: resolving without a note sends only the status; cancel sends nothing', (tester) async {
    final adapter = await _pump(tester, _Backend());

    await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.alertsResolveButton).first);
    await _tap(tester, find.widgetWithText(TextButton, viL10n.alertsResolveCancel));
    expect(_patches(adapter), isEmpty);

    await _resolveFirst(tester);
    expect(_patches(adapter).single.data, {'status': 'resolved'});
  });

  testWidgets('WT-ALR-05: an alert moved on meanwhile is explained', (tester) async {
    await _pump(
      tester,
      _Backend()
        ..patchStatus = 409
        ..patchCode = 'invalid_status_transition',
    );

    await _resolveFirst(tester);

    expect(find.text(viL10n.alertsResolveFailed(viL10n.alertsErrorInvalidStatusTransition)), findsOneWidget);
  });

  testWidgets('WT-ALR-06: an alert outside the caller scope is explained', (tester) async {
    await _pump(
      tester,
      _Backend()
        ..patchStatus = 404
        ..patchCode = 'incident_not_found',
    );

    await _resolveFirst(tester);

    expect(find.text(viL10n.alertsResolveFailed(viL10n.alertsErrorIncidentNotFound)), findsOneWidget);
  });

  testWidgets('WT-ALR-08: counts sent as numeric strings read the same', (tester) async {
    await _pump(tester, _Backend()..countsAsText = true);

    expect(find.text(viL10n.alertsTabActive(3)), findsOneWidget);
  });

  testWidgets('WT-ALR-07: a failed load says why; retry and reload load again', (tester) async {
    final backend = _Backend()..listStatus = 500;
    final adapter = await _pump(tester, backend);

    expect(find.text(viL10n.alertsLoadFailed(viL10n.errorServer)), findsOneWidget);

    backend
      ..listStatus = 200
      ..active = [];
    await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.commonRetry));
    expect(find.text(viL10n.alertsEmpty), findsOneWidget);

    await _tap(tester, find.byTooltip(viL10n.alertsRefreshTooltip));
    expect(adapter.requests, hasLength(6));
  });
}
