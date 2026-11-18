// Widget Tests: ApprovalsScreen — leave requests to review (Web/backend/src/leave)
//   GET   /leave?status=pending|approved|rejected
//   PATCH /leave/:id/review {action: approve|reject, reason?}
//   decided rows show reviewedBy.fullName, reviewedAt and reviewNote (T20)
// Run: flutter test test/widget_approvals_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:police_app/features/approvals/screens/approvals_screen.dart';
import 'package:police_app/shared/widgets/status_badge.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

Map<String, Object?> _leave(
  String id, {
  String status = 'pending',
  String reason = 'Family matters',
  Object totalDays = '2.0',
  Map<String, Object?>? reviewedBy,
  String? reviewedAt,
  String? reviewNote,
}) =>
    {
      'id': id,
      'code': 'LEAVE-$id',
      'requesterName': 'Requester $id',
      'leaveTypeName': 'Annual leave',
      'fromDate': '2026-09-20',
      'toDate': '2026-09-21',
      'reason': reason,
      'status': status,
      'totalDays': totalDays,
      'reviewedBy': reviewedBy,
      'reviewedAt': reviewedAt,
      'reviewNote': reviewNote,
    };

/// The leave routes the screen calls, backed by editable rows
class _Server {
  final rows = <String, List<Map<String, Object?>>>{'pending': [], 'approved': [], 'rejected': []};
  ResponseBody Function(RequestOptions o)? onReview;
  ResponseBody? Function(RequestOptions o)? onList;
  late FakeAdapter adapter;

  List<RequestOptions> get lists => [for (final r in adapter.requests) if (r.method == 'GET') r];
  List<RequestOptions> get reviews => [for (final r in adapter.requests) if (r.method == 'PATCH') r];

  ResponseBody handle(RequestOptions o) {
    if (o.method == 'PATCH') return onReview?.call(o) ?? ResponseBody.fromString('', 204);
    final custom = onList?.call(o);
    if (custom != null) return custom;
    final data = rows[o.queryParameters['status']] ?? const [];
    return jsonBody(200, {'data': data, 'total': data.length, 'page': 1, 'limit': 100});
  }
}

Future<_Server> _pump(WidgetTester tester, _Server server, {Future<void> Function(RequestOptions)? gate}) async {
  server.adapter = FakeAdapter(server.handle, gate: gate);
  await tester.pumpWidget(scopedApp(fakeDio(server.adapter), const ApprovalsScreen()));
  await tester.pumpAndSettle();
  return server;
}

void main() {
  testWidgets('WT-APPR-01: the pending tab counts and lists requests with type, dates, days and reason',
      (tester) async {
    final server = _Server()..rows['pending'] = [_leave('l1'), _leave('l2', totalDays: 0.5, reason: 'Sick')];

    await _pump(tester, server);

    expect(find.text(viL10n.approvalsScreenTitle), findsOneWidget);
    expect(find.text(viL10n.approvalsScreenTabPending(2)), findsOneWidget);
    expect(server.lists.map((r) => r.queryParameters['status']),
        unorderedEquals(['pending', 'approved', 'rejected']));
    expect(find.text('Requester l1'), findsOneWidget);
    expect(find.text('LEAVE-l1'), findsOneWidget);
    expect(find.text(viL10n.approvalsScreenLeavePeriod('Annual leave', '20/09/2026', '21/09/2026', '2')),
        findsOneWidget);
    expect(find.text(viL10n.approvalsScreenLeavePeriod('Annual leave', '20/09/2026', '21/09/2026', '0,5')),
        findsOneWidget);
    expect(find.text(viL10n.approvalsScreenReason('Family matters')), findsOneWidget);
    expect(find.text(viL10n.approvalsScreenApprove), findsNWidgets(2));
    expect(find.text(viL10n.approvalsScreenReject), findsNWidgets(2));
  });

  testWidgets('WT-APPR-02: approving shows progress, sends the decision, confirms it and reloads', (tester) async {
    final server = _Server()..rows['pending'] = [_leave('l1'), _leave('l2')];
    final release = Completer<void>();
    server.onReview = (_) {
      server.rows['pending'] = [_leave('l2')];
      server.rows['approved'] = [_leave('l1', status: 'approved')];
      return ResponseBody.fromString('', 204);
    };
    await _pump(tester, server, gate: (o) => o.method == 'PATCH' ? release.future : Future<void>.value());

    await tester.tap(find.text(viL10n.approvalsScreenApprove).first);
    await pumpUntil(tester, () => server.reviews.isNotEmpty);

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    final rejects = find.widgetWithText(OutlinedButton, viL10n.approvalsScreenReject);
    expect(tester.widget<OutlinedButton>(rejects.first).onPressed, isNull);
    expect(tester.widget<OutlinedButton>(rejects.last).onPressed, isNotNull);

    release.complete();
    await tester.pumpAndSettle();

    expect(server.reviews.single.path, '/leave/l1/review');
    expect(server.reviews.single.data, {'action': 'approve'});
    expect(find.text(viL10n.approvalsScreenApproved), findsOneWidget);
    expect(find.text(viL10n.approvalsScreenTabPending(1)), findsOneWidget);
    expect(server.lists, hasLength(6));
  });

  testWidgets('WT-APPR-03: rejecting requires a reason and sends it; cancelling sends nothing', (tester) async {
    final server = _Server()..rows['pending'] = [_leave('l1')];
    await _pump(tester, server);

    await tester.tap(find.text(viL10n.approvalsScreenReject));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.approvalsRejectDialogTitle), findsOneWidget);
    expect(find.text(viL10n.approvalsRejectDialogReasonHint), findsOneWidget);
    await tester.tap(find.text(viL10n.approvalsRejectDialogCancel));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.approvalsRejectDialogTitle), findsNothing);

    await tester.tap(find.text(viL10n.approvalsScreenReject));
    await tester.pumpAndSettle();
    await tester.tap(find.text(viL10n.approvalsRejectDialogConfirm));
    await tester.pump();
    expect(find.text(viL10n.approvalsRejectDialogReasonRequired), findsOneWidget);

    await tester.enterText(
        find.widgetWithText(TextField, viL10n.approvalsRejectDialogReasonLabel), '  No replacement on duty ');
    await tester.tap(find.text(viL10n.approvalsRejectDialogConfirm));
    await tester.pumpAndSettle();

    expect(server.reviews.single.data, {'action': 'reject', 'reason': 'No replacement on duty'});
    expect(find.text(viL10n.approvalsScreenRejected), findsOneWidget);
  });

  testWidgets('WT-APPR-04: a request decided elsewhere shows why and reloads; other refusals do not reload',
      (tester) async {
    final server = _Server()..rows['pending'] = [_leave('l1')];
    server.onReview = (_) => errorBody(409, 'leave_request_not_pending');
    await _pump(tester, server);

    await tester.tap(find.text(viL10n.approvalsScreenApprove));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorLeaveRequestNotPending), findsOneWidget);
    expect(server.lists, hasLength(6));

    await dismissSnackBars(tester);
    server.onReview = (_) => errorBody(403, 'cannot_review_own_request');
    await tester.tap(find.text(viL10n.approvalsScreenApprove));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorCannotReviewOwnRequest), findsOneWidget);
    expect(server.lists, hasLength(6));
  });

  testWidgets('WT-APPR-05: decided tabs show who decided, when, and the reason given', (tester) async {
    const reviewer = {'id': 'u-ca', 'fullName': 'Le Van C'};
    final server = _Server()
      ..rows['approved'] = [
        _leave('l3',
            status: 'approved',
            reviewedBy: reviewer,
            reviewedAt: '2026-09-15T03:30:00.000Z',
            reviewNote: 'Enjoy the rest'),
        _leave('l5', status: 'approved'),
      ]
      ..rows['rejected'] = [
        _leave('l4',
            status: 'rejected',
            reviewedBy: reviewer,
            reviewedAt: '2026-09-16T08:05:00.000Z',
            reviewNote: 'No replacement on duty'),
      ];
    await _pump(tester, server);
    final at = DateFormat('dd/MM/yyyy HH:mm');

    await tester.tap(find.text(viL10n.approvalsScreenTabApproved));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.approvalsScreenReviewer('Le Van C')), findsOneWidget);
    expect(find.text(viL10n.approvalsScreenReviewedAt(at.format(DateTime.utc(2026, 9, 15, 3, 30).toLocal()))),
        findsOneWidget);
    expect(find.text(viL10n.approvalsScreenApproveNote('Enjoy the rest')), findsOneWidget);
    expect(find.descendant(of: find.byType(StatusBadge), matching: find.text(viL10n.approvalsLeaveStatusApproved)),
        findsNWidgets(2));
    expect(find.text(viL10n.approvalsScreenApprove), findsNothing);

    await tester.tap(find.text(viL10n.approvalsScreenTabRejected));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.approvalsScreenRejectReason('No replacement on duty')), findsOneWidget);
    expect(find.text(viL10n.approvalsScreenReviewedAt(at.format(DateTime.utc(2026, 9, 16, 8, 5).toLocal()))),
        findsOneWidget);
    expect(find.descendant(of: find.byType(StatusBadge), matching: find.text(viL10n.approvalsLeaveStatusRejected)),
        findsOneWidget);
  });

  // Leave types are data (migration 033 seeds annual, marriage, child_marriage, bereavement, sick,
  // maternity, unpaid; admins may add more): each row shows the name the list sends
  testWidgets('WT-APPR-07: every leave type shows as the backend names it, whatever the type', (tester) async {
    final server = _Server()
      ..rows['pending'] = [
        {..._leave('l1'), 'leaveTypeName': 'Bereavement leave'},
        {..._leave('l2'), 'leaveTypeName': 'Unpaid leave'},
        {..._leave('l3'), 'leaveTypeName': 'Type added by an admin'},
      ];

    await _pump(tester, server);

    for (final name in ['Bereavement leave', 'Unpaid leave', 'Type added by an admin']) {
      expect(find.text(viL10n.approvalsScreenLeavePeriod(name, '20/09/2026', '21/09/2026', '2')), findsOneWidget,
          reason: name);
    }
  });

  testWidgets('WT-APPR-06: a failed load says why and retries; empty tabs explain the scope; refresh reloads',
      (tester) async {
    final server = _Server();
    var fail = true;
    server.onList = (_) => fail ? errorBody(403, 'insufficient_role_to_view_approvals') : null;
    await _pump(tester, server);

    expect(find.text(viL10n.errorInsufficientRoleToViewApprovals), findsOneWidget);

    fail = false;
    await tester.tap(find.text(viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.approvalsScreenEmptyPending), findsOneWidget);
    expect(find.text(viL10n.approvalsScreenTabPending(0)), findsOneWidget);

    await tester.tap(find.text(viL10n.approvalsScreenTabApproved));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.approvalsScreenEmpty), findsOneWidget);

    final before = server.lists.length;
    await tester.tap(find.byTooltip(viL10n.approvalsScreenRefresh));
    await tester.pumpAndSettle();
    expect(server.lists, hasLength(before + 3));
  });
}
