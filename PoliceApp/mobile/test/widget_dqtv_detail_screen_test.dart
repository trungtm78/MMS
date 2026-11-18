// Widget Tests: militia member detail screen (CA)
//   GET /militia/:id            → the profile itself: id, userId, militiaCode, fullName, phone, email,
//                                 rank, status, unitCode, unitName (militia.service.ts getMilitiaById)
//   GET /kpi/current?userId=    → CurrentScoreResult itself: score, totalScore, maxScore (10), ...
//                                 userId is the member's USER id (kpi.controller.ts getCurrent)
// Run: flutter test test/widget_dqtv_detail_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/dqtv/screens/dqtv_detail_screen.dart';
import 'package:police_app/shared/files/files.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

Map<String, Object?> _profile({String? userId = 'u-1', String status = 'active'}) => {
      'id': 'mp-1',
      'userId': userId,
      'militiaCode': 'DQ-001',
      'fullName': 'Nguyen Van A',
      'phone': '0909000000',
      'email': 'a@example.com',
      'rank': 'Private',
      'status': status,
      'avatarUrl': null,
      'unitCode': 'KP1',
      'unitName': 'Block 1',
    };

const _kpi = {
  'score': 8.5,
  'totalScore': 8.5,
  'change': 0.5,
  'rank': 2,
  'rankInUnit': 1,
  'unitSize': 4,
  'month': 9,
  'year': 2026,
  'attendanceScore': 9,
  'taskScore': 8,
  'maxScore': 10,
};

ResponseBody _error(int status, String code) =>
    jsonBody(status, {'code': 'E000', 'message': code, 'statusCode': status});

Future<FakeAdapter> _pump(WidgetTester tester, ResponseBody Function(RequestOptions) handler) async {
  tester.view.physicalSize = const Size(900, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final router = GoRouter(initialLocation: '/ca/dqtv/mp-1', routes: [
    GoRoute(
      path: '/ca/dqtv/:id',
      builder: (context, state) => DqtvDetailScreen(userId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/ca/evaluate/:id',
      builder: (context, state) => Scaffold(body: Text('evaluate ${state.pathParameters['id']}')),
    ),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

final _documents = [
  fileView('f1', name: 'id-card.jpg'),
  fileView('f2', name: 'contract.pdf', mimeType: 'application/pdf'),
];

ResponseBody _ok(RequestOptions o) => switch (o.path) {
      '/kpi/current' => jsonBody(200, _kpi),
      '/militia/mp-1/documents' => jsonBody(200, _documents),
      '/files/f1' => pngBody(o),
      _ => jsonBody(200, _profile()),
    };

void main() {
  testWidgets('WT-DQTV-01: shows the profile and the KPI of the member user account', (tester) async {
    final adapter = await _pump(tester, _ok);

    expect(adapter.requests.first.path, '/militia/mp-1');
    final kpi = adapter.requests.singleWhere((r) => r.path == '/kpi/current');
    expect(kpi.queryParameters, {'userId': 'u-1'});

    expect(find.text(viL10n.dqtvDetailTitle), findsOneWidget);
    expect(find.text('Nguyen Van A'), findsOneWidget);
    expect(find.text(viL10n.dqtvStatusActive), findsOneWidget);
    expect(find.text('a@example.com'), findsOneWidget);
    expect(find.text('0909000000'), findsOneWidget);
    expect(find.text(viL10n.dqtvDetailRank), findsOneWidget);
    expect(find.text('Private'), findsOneWidget);
    expect(find.text('Block 1'), findsOneWidget);
    expect(find.text(viL10n.dqtvDetailSectionKpi), findsOneWidget);
    expect(find.text('8.5'), findsOneWidget);
    expect(find.text(viL10n.dqtvDetailKpiOutOf('10')), findsOneWidget);
  });

  testWidgets('WT-DQTV-02: a KPI the caller may not see is explained, the profile stays', (tester) async {
    await _pump(tester, (o) => o.path == '/kpi/current' ? _error(403, 'kpi_not_visible') : _ok(o));

    expect(find.text('Nguyen Van A'), findsOneWidget);
    expect(find.text(viL10n.dqtvDetailKpiFailed(viL10n.dqtvErrorKpiNotVisible)), findsOneWidget);
  });

  testWidgets('WT-DQTV-03: a member without a user account has no KPI to ask for', (tester) async {
    final adapter = await _pump(
      tester,
      (o) => o.path.endsWith('/documents') ? _ok(o) : jsonBody(200, _profile(userId: null, status: 'inactive')),
    );

    // The profile and its documents; no KPI (image thumbnails download on their own)
    expect(adapter.requests.map((r) => r.path).where((path) => !path.startsWith('/files/')),
        ['/militia/mp-1', '/militia/mp-1/documents']);
    expect(find.text(viL10n.dqtvStatusInactive), findsOneWidget);
    expect(find.text(viL10n.dqtvDetailSectionKpi), findsNothing);
  });

  testWidgets('WT-DQTV-04: a month without evaluations shows no score', (tester) async {
    await _pump(
      tester,
      (o) => o.path == '/kpi/current'
          ? jsonBody(200, {..._kpi, 'score': null, 'totalScore': null})
          : _ok(o),
    );

    expect(find.text(viL10n.dqtvDetailSectionKpi), findsOneWidget);
    expect(find.text('-'), findsOneWidget);
  });

  testWidgets('WT-DQTV-05: a failed profile load says why, and retry loads it', (tester) async {
    var fail = true;
    await _pump(tester, (o) => fail ? _error(404, 'militia_not_found') : _ok(o));

    expect(find.text(viL10n.dqtvDetailLoadFailed(viL10n.dqtvErrorMilitiaNotFound)), findsOneWidget);

    fail = false;
    await tester.tap(find.widgetWithText(ElevatedButton, viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text('Nguyen Van A'), findsOneWidget);
  });

  testWidgets('WT-DQTV-07: KPI scores sent as numeric strings read the same', (tester) async {
    await _pump(
      tester,
      (o) => o.path == '/kpi/current' ? jsonBody(200, {..._kpi, 'totalScore': '8.50', 'maxScore': '10'}) : _ok(o),
    );

    expect(find.text('8.5'), findsOneWidget);
    expect(find.text(viL10n.dqtvDetailKpiOutOf('10')), findsOneWidget);
  });

  testWidgets('WT-DQTV-08: the profile documents are listed, images as thumbnails', (tester) async {
    final adapter = await _pump(tester, _ok);

    expect(adapter.requests.where((r) => r.path == '/militia/mp-1/documents'), hasLength(1));
    expect(find.text(viL10n.dqtvDocumentsTitle), findsOneWidget);
    expect(find.byType(AuthenticatedImage), findsOneWidget);
    expect(find.text('contract.pdf'), findsOneWidget);
  });

  testWidgets('WT-DQTV-09: documents failing to load say why; retry shows that none are attached', (tester) async {
    var fail = true;
    await _pump(tester, (o) {
      if (o.path == '/militia/mp-1/documents') return fail ? _error(403, 'insufficient_role') : jsonBody(200, const []);
      return _ok(o);
    });

    expect(find.text('Nguyen Van A'), findsOneWidget);
    expect(find.text(viL10n.dqtvDocumentsLoadFailed(viL10n.errorForbidden)), findsOneWidget);

    fail = false;
    await tester.tap(find.widgetWithText(TextButton, viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.dqtvDocumentsEmpty), findsOneWidget);
  });

  testWidgets('WT-DQTV-10: a documents answer that is not a list is reported as unreadable', (tester) async {
    await _pump(tester, (o) => o.path == '/militia/mp-1/documents' ? jsonBody(200, {'data': []}) : _ok(o));

    expect(find.text(viL10n.dqtvDocumentsLoadFailed(viL10n.errorBadResponse)), findsOneWidget);
  });

  testWidgets('WT-DQTV-06: the evaluate button opens the evaluation of this member', (tester) async {
    await _pump(tester, _ok);

    await tester.tap(find.text(viL10n.dqtvDetailEvaluate));
    await tester.pumpAndSettle();

    expect(find.text('evaluate mp-1'), findsOneWidget);
  });
}
