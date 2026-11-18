// Widget Tests: TeamReportsScreen — a CA officer reviews the team's work reports
//   GET   /work-reports?reviewStatus=&from=&to=&page=&limit=  (list, and limit=1 for the counts)
//   GET   /work-reports/:id → one report with its attachments (T20)
//   GET   /files/:id → attachment content, with the session's token (T20)
//   PATCH /work-reports/:id/review {reviewStatus, reviewNote?}
// Run: flutter test test/widget_team_reports_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:police_app/features/reports/models/work_report.dart';
import 'package:police_app/features/reports/screens/team_reports_screen.dart';
import 'package:police_app/shared/files/files.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

Map<String, Object?> _report(
  String id, {
  String status = 'pending',
  String type = 'incident',
  String? author = 'Nguyen Van A',
  String? location = 'Phu Dinh market',
  String content = 'Content of the report',
  String? reviewNote,
  String? reviewedAt,
  List<Map<String, Object?>> attachments = const [],
}) =>
    {
      'id': id,
      'reportType': type,
      'title': 'Title $id',
      'content': content,
      'location': location,
      'period': null,
      'reviewStatus': status,
      'reviewNote': reviewNote,
      'createdBy': 'u-dqtv',
      'authorName': author,
      'createdAt': '2026-09-14T01:00:00.000Z',
      'reviewedAt': reviewedAt,
      'reviewedBy': null,
      'attachments': attachments,
    };

/// The work-report and file routes the screen calls
class _Server {
  List<Map<String, Object?>> rows = [];
  int? total;
  Map<String, int> counts = {};
  ResponseBody? Function(RequestOptions o)? onList;
  ResponseBody Function(RequestOptions o)? onReview;
  ResponseBody Function(RequestOptions o)? onDetail;
  late FakeAdapter adapter;

  /// The list requests (the counts ask for one row)
  List<RequestOptions> get lists => [
        for (final r in adapter.requests)
          if (r.path == '/work-reports' && r.queryParameters['limit'] != 1) r,
      ];
  List<RequestOptions> get counted => [
        for (final r in adapter.requests)
          if (r.path == '/work-reports' && r.queryParameters['limit'] == 1) r,
      ];
  List<RequestOptions> get reviews => [for (final r in adapter.requests) if (r.method == 'PATCH') r];

  ResponseBody handle(RequestOptions o) {
    if (o.path.startsWith('/files/')) return pngBody();
    if (o.method == 'PATCH') return onReview?.call(o) ?? jsonBody(200, {'id': 'r'});
    if (o.path != '/work-reports') {
      return onDetail?.call(o) ?? jsonBody(200, rows.firstWhere((r) => o.path == '/work-reports/${r['id']}'));
    }
    final q = o.queryParameters;
    if (q['limit'] == 1) {
      return jsonBody(200, {'data': [], 'total': counts[q['reviewStatus']] ?? 0, 'page': 1, 'limit': 1});
    }
    return onList?.call(o) ??
        jsonBody(200, {'data': rows, 'total': total ?? rows.length, 'page': q['page'], 'limit': 20});
  }
}

Future<_Server> _pump(WidgetTester tester, _Server server, {Future<void> Function(RequestOptions)? gate}) async {
  useTallSurface(tester);
  server.adapter = FakeAdapter(server.handle, gate: gate);
  await tester.pumpWidget(scopedApp(fakeDio(server.adapter), const TeamReportsScreen()));
  await tester.pumpAndSettle();
  return server;
}

Finder _inDialog(String text) => find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

void main() {
  testWidgets("WT-TEAM-01: the month's reports load with their counts; cards show the report and its photos",
      (tester) async {
    final server = _Server()
      ..rows = [
        _report('r1', attachments: [fileView('f1'), fileView('f2', name: 'plan.pdf', mimeType: 'application/pdf')]),
        _report('r2', status: 'approved', type: 'daily', author: null, location: null, reviewNote: 'Good work'),
      ]
      ..counts = {'pending': 5, 'approved': 7};

    await _pump(tester, server);

    final month = reportPeriodRange('month');
    expect(server.lists.single.queryParameters, {'page': 1, 'limit': 20, 'from': month.from, 'to': month.to});
    expect(server.counted.map((r) => r.queryParameters['reviewStatus']), unorderedEquals(['pending', 'approved']));
    expect(find.text(viL10n.reportsTeamTitle), findsOneWidget);
    expect(find.text(viL10n.reportsTeamSummaryFiltered), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('5'), findsOneWidget);
    expect(find.text('7'), findsOneWidget);
    expect(find.text('Nguyen Van A'), findsOneWidget);
    expect(find.text(viL10n.reportsTeamAuthorUnknown), findsOneWidget);
    expect(find.text(viL10n.reportsTypeIncident), findsOneWidget);
    expect(find.text(viL10n.reportsTypeDaily), findsOneWidget);
    expect(find.text('Title r1'), findsOneWidget);
    expect(find.text('Phu Dinh market'), findsOneWidget);
    expect(find.text(viL10n.reportsTeamNoLocation), findsOneWidget);
    expect(find.text(viL10n.reportsTeamReviewNote('Good work')), findsOneWidget);
    expect(find.byType(AuthenticatedImage), findsOneWidget);
    expect(find.text('plan.pdf'), findsOneWidget);
    expect(server.adapter.requests.where((r) => r.path == '/files/f1'), hasLength(1));
    // Only the pending report can be reviewed
    expect(find.text(viL10n.reportsTeamApprove), findsOneWidget);
  });

  testWidgets('WT-TEAM-02: the period and status filters reload from the server', (tester) async {
    final server = await _pump(tester, _Server()..rows = [_report('r1')]);

    await tester.tap(find.text(viL10n.reportsTeamPeriodWeek));
    await tester.pumpAndSettle();
    final week = reportPeriodRange('week');
    expect(server.lists.last.queryParameters, {'page': 1, 'limit': 20, 'from': week.from, 'to': week.to});
    expect(server.counted.last.queryParameters['from'], week.from);

    await tester.tap(find.widgetWithText(ChoiceChip, viL10n.reportsReviewStatusRejected));
    await tester.pumpAndSettle();
    expect(server.lists.last.queryParameters['reviewStatus'], 'rejected');

    await tester.tap(find.widgetWithText(ChoiceChip, viL10n.reportsTeamFilterAll));
    await tester.pumpAndSettle();
    expect(server.lists.last.queryParameters.containsKey('reviewStatus'), isFalse);

    await tester.tap(find.text(viL10n.reportsTeamPeriodMonth));
    await tester.pumpAndSettle();
    expect(server.lists.last.queryParameters['from'], reportPeriodRange('month').from);
  });

  testWidgets('WT-TEAM-03: approving with a note and rejecting send the review, confirm it and reload',
      (tester) async {
    final server = await _pump(tester, _Server()..rows = [_report('r1')]);

    await tester.tap(find.text(viL10n.reportsTeamApprove));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.reportsTeamReviewDialogApproveTitle), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, viL10n.reportsTeamReviewDialogApproveNote), 'Checked on site');
    await tester.tap(_inDialog(viL10n.reportsTeamApprove));
    await tester.pumpAndSettle();

    expect(server.reviews.single.path, '/work-reports/r1/review');
    expect(server.reviews.single.data, {'reviewStatus': 'approved', 'reviewNote': 'Checked on site'});
    expect(find.text(viL10n.reportsTeamApproved), findsOneWidget);
    expect(server.lists, hasLength(2));

    await dismissSnackBars(tester);
    await tester.tap(find.text(viL10n.reportsTeamReject));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.reportsTeamReviewDialogRejectTitle), findsOneWidget);
    expect(find.text(viL10n.reportsTeamReviewDialogRejectNote), findsOneWidget);
    await tester.tap(find.text(viL10n.reportsTeamReviewDialogCancel));
    await tester.pumpAndSettle();
    expect(server.reviews, hasLength(1));

    await tester.tap(find.text(viL10n.reportsTeamReject));
    await tester.pumpAndSettle();
    await tester.tap(_inDialog(viL10n.reportsTeamReject));
    await tester.pumpAndSettle();

    expect(server.reviews.last.data, {'reviewStatus': 'rejected'});
    expect(find.text(viL10n.reportsTeamRejected), findsOneWidget);
  });

  testWidgets('WT-TEAM-04: a review in progress disables the card; a conflict shows why and reloads',
      (tester) async {
    final server = _Server()..rows = [_report('r1')];
    final release = Completer<void>();
    server.onReview = (_) => errorBody(409, 'work_report_already_reviewed');
    await _pump(tester, server, gate: (o) => o.method == 'PATCH' ? release.future : Future<void>.value());

    await tester.tap(find.text(viL10n.reportsTeamApprove));
    await tester.pumpAndSettle();
    await tester.tap(_inDialog(viL10n.reportsTeamApprove));
    await pumpUntil(tester, () => server.reviews.isNotEmpty);

    expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, viL10n.reportsTeamReject)).onPressed,
        isNull);

    release.complete();
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorWorkReportAlreadyReviewed), findsOneWidget);
    expect(server.lists, hasLength(2));

    await dismissSnackBars(tester);
    server.onReview = (_) => errorBody(403, 'cannot_review_own_report');
    await tester.tap(find.text(viL10n.reportsTeamApprove));
    await tester.pumpAndSettle();
    await tester.tap(_inDialog(viL10n.reportsTeamApprove));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorCannotReviewOwnReport), findsOneWidget);
    expect(server.lists, hasLength(2));
  });

  testWidgets('WT-TEAM-05: a failed load says why and retries into the empty state', (tester) async {
    final server = _Server();
    var fail = true;
    server.onList = (_) => fail ? errorBody(403, 'no_access') : null;
    await _pump(tester, server);

    expect(find.text(viL10n.reportsTeamLoadError(viL10n.errorForbidden)), findsOneWidget);

    fail = false;
    await tester.tap(find.text(viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.reportsTeamEmpty), findsOneWidget);
    expect(find.text(viL10n.reportsTeamLoadError(viL10n.errorForbidden)), findsNothing);
  });

  testWidgets('WT-TEAM-06: load more appends the next page once; a failed page says why and can be retried',
      (tester) async {
    final server = _Server()
      ..rows = [_report('r1'), _report('r2')]
      ..total = 3;
    var failPage = true;
    final release = Completer<void>();
    server.onList = (o) {
      if (o.queryParameters['page'] != 2) return null;
      if (failPage) return errorBody(500, 'boom');
      return jsonBody(200, {
        'data': [_report('r2'), _report('r3')],
        'total': 3,
        'page': 2,
        'limit': 20,
      });
    };
    await _pump(tester, server,
        gate: (o) => o.queryParameters['page'] == 2 && !failPage ? release.future : Future<void>.value());

    await tester.tap(find.text(viL10n.reportsTeamLoadMore(2, 3)));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorServer), findsOneWidget);
    expect(find.text(viL10n.reportsTeamLoadMore(2, 3)), findsOneWidget);

    failPage = false;
    await tester.tap(find.text(viL10n.reportsTeamLoadMore(2, 3)));
    await pumpUntil(tester, () => server.lists.length == 3);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    release.complete();
    await tester.pumpAndSettle();

    expect(server.lists.last.queryParameters['page'], 2);
    expect(find.text('Title r1'), findsOneWidget);
    expect(find.text('Title r2'), findsOneWidget);
    expect(find.text('Title r3'), findsOneWidget);
    expect(find.text(viL10n.reportsTeamLoadMore(3, 3)), findsNothing);
  });

  testWidgets('WT-TEAM-07: a report opens its detail from GET /work-reports/:id, with every attachment',
      (tester) async {
    final server = _Server()..rows = [_report('r1', content: 'Short')];
    var detailCalls = 0;
    server.onDetail = (o) => ++detailCalls == 1
        ? errorBody(404, 'work_report_not_found')
        : jsonBody(200, _report('r1',
            status: 'rejected',
            location: null,
            author: null,
            content: 'Full content of the report',
            reviewNote: 'Blurry photo',
            reviewedAt: '2026-09-15T02:00:00.000Z',
            attachments: [fileView('f1'), fileView('f3')]));
    await _pump(tester, server);

    await tester.tap(find.text('Title r1'));
    await tester.pumpAndSettle();

    expect(server.adapter.requests.where((r) => r.path == '/work-reports/r1'), hasLength(1));
    expect(find.text(viL10n.reportsDetailTitle), findsOneWidget);
    expect(find.text(viL10n.errorWorkReportNotFound), findsOneWidget);
    expect(find.text(viL10n.reportsDetailNoAttachments), findsOneWidget);

    await tester.tap(find.text(viL10n.commonRetry));
    await tester.pumpAndSettle();

    final sheet = find.byType(BottomSheet);
    expect(find.descendant(of: sheet, matching: find.text('Full content of the report')), findsOneWidget);
    expect(find.descendant(of: sheet, matching: find.text(viL10n.reportsDetailReviewNote('Blurry photo'))),
        findsOneWidget);
    expect(find.descendant(of: sheet, matching: find.text(viL10n.reportsDetailNoLocation)), findsOneWidget);
    expect(find.descendant(of: sheet, matching: find.text(viL10n.reportsDetailAuthorUnknown)), findsOneWidget);
    expect(
      find.text(viL10n.reportsDetailReviewedAt(
          DateFormat('dd/MM/yyyy HH:mm').format(DateTime.utc(2026, 9, 15, 2).toLocal()))),
      findsOneWidget,
    );
    expect(find.text(viL10n.reportsDetailAttachments(2)), findsOneWidget);
    expect(find.descendant(of: sheet, matching: find.byType(AuthenticatedImage)), findsNWidgets(2));

    await tester.tap(find.byTooltip(viL10n.reportsDetailClose));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.reportsDetailTitle), findsNothing);
  });
}
