// Widget Tests: "Đơn Của Tôi" — cancelling a pending leave request, and no dead buttons
//   PATCH /leave/:id/cancel → 204; 404 leave_request_not_found, 403 not_your_leave_request,
//   409 leave_request_not_pending (Web/backend/src/leave/leave.controller.ts:137-146,
//   leave.service.ts:424-446). GET /leave rows: leave.service.ts:175-190.
//   No route edits or resubmits a request (leave.controller.ts), so "Sửa & gửi lại" is not offered.
// Run: flutter test test/widget_my_requests_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/leave/repositories/leave_repository.dart';
import 'package:militian_app/features/leave/screens/my_requests_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

const _pendingId = '1f6c2b7e-0d7a-4c55-9a3e-2b8f3d9e4a10';
const _pendingCode = 'LEAVE-20260914-AAAAAA';

/// Answers like the backend and keeps the rows' state between calls.
class _LeaveBackend {
  _LeaveBackend(this.rows, {this.cancelStatus = 204, this.cancelCode, this.decidedMeanwhile});

  final List<Map<String, dynamic>> rows;
  final int cancelStatus;
  final String? cancelCode;

  /// Status someone else gave the request just before the cancel arrived
  final String? decidedMeanwhile;
  int listCalls = 0;

  ResponseBody handle(RequestOptions o) {
    if (o.method == 'GET' && o.path == '/leave') {
      listCalls++;
      return jsonBody(200, backendPage(rows));
    }
    if (o.method == 'GET' && o.path == '/leave-balances') return jsonBody(200, []);
    if (o.method == 'PATCH' && o.path.endsWith('/cancel')) {
      final row = rows.firstWhere((r) => r['id'] == o.path.split('/')[2]);
      if (decidedMeanwhile != null) row['status'] = decidedMeanwhile;
      if (cancelStatus != 204) return jsonBody(cancelStatus, backendError(cancelStatus, cancelCode!));
      row['status'] = 'cancelled';
      return noContent(o);
    }
    return jsonBody(404, {'message': 'no_route ${o.method} ${o.path}'});
  }
}

Future<FakeAdapter> _open(WidgetTester tester, _LeaveBackend backend, {Duration? cancelDelay}) async {
  final adapter = FakeAdapter(backend.handle, delayFor: (o) => o.method == 'PATCH' ? cancelDelay : null);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  // A fresh key per call: a second _open in one test must build a new screen, not reuse the old state
  await tester.pumpWidget(ProviderScope(
    key: UniqueKey(),
    overrides: [leaveRepositoryProvider.overrideWithValue(LeaveRepository(dio))],
    child: localizedApp(const MyRequestsScreen()),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

_LeaveBackend _onePending({int cancelStatus = 204, String? cancelCode, String? decidedMeanwhile}) =>
    _LeaveBackend(
      [backendLeaveRow(_pendingId, 'pending', code: _pendingCode)],
      cancelStatus: cancelStatus,
      cancelCode: cancelCode,
      decidedMeanwhile: decidedMeanwhile,
    );

Future<void> _openDetailAndConfirm(WidgetTester tester) async {
  await tester.tap(find.text(_pendingCode));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('cancel_leave')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('confirm_cancel_leave')));
}

Iterable<RequestOptions> _patches(FakeAdapter a) => a.requests.where((r) => r.method == 'PATCH');

void main() {
  testWidgets('WT-LEAVE-01: confirm → PATCH /leave/:id/cancel → success message and reloaded list',
      (tester) async {
    final backend = _onePending();
    final adapter = await _open(tester, backend);
    expect(find.text('Chờ duyệt (1)'), findsOneWidget);

    await tester.tap(find.text(_pendingCode));
    await tester.pumpAndSettle();

    // Dismissing the confirmation sends nothing
    await tester.tap(find.byKey(const Key('cancel_leave')));
    await tester.pumpAndSettle();
    expect(find.text('Hủy đơn nghỉ phép?'), findsOneWidget);
    await tester.tap(find.text('Không'));
    await tester.pumpAndSettle();
    expect(_patches(adapter), isEmpty);

    await tester.tap(find.byKey(const Key('cancel_leave')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('confirm_cancel_leave')));
    await tester.pumpAndSettle();

    expect(_patches(adapter).single.path, '/leave/$_pendingId/cancel');
    expect(backend.listCalls, 2);
    expect(find.text('Đã hủy đơn nghỉ phép.'), findsOneWidget);
    expect(find.text('Đã hủy (1)'), findsOneWidget);
    expect(find.text('Chờ duyệt'), findsOneWidget);
    expect(find.byKey(const Key('cancel_leave')), findsNothing);
  });

  testWidgets('WT-LEAVE-02: the button is disabled while the cancel runs', (tester) async {
    final backend = _onePending();
    final adapter = await _open(tester, backend, cancelDelay: const Duration(seconds: 2));

    await _openDetailAndConfirm(tester);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final button = tester.widget<ElevatedButton>(find.byKey(const Key('cancel_leave')));
    expect(button.onPressed, isNull);
    expect(
      find.descendant(of: find.byKey(const Key('cancel_leave')), matching: find.byType(CircularProgressIndicator)),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('cancel_leave')), warnIfMissed: false);
    await tester.pump();

    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();

    expect(_patches(adapter), hasLength(1));
    expect(find.text('Đã hủy đơn nghỉ phép.'), findsOneWidget);
  });

  testWidgets('WT-LEAVE-03: 409 leave_request_not_pending is explained and the list is reloaded',
      (tester) async {
    final backend = _onePending(
      cancelStatus: 409,
      cancelCode: 'leave_request_not_pending',
      decidedMeanwhile: 'approved',
    );
    await _open(tester, backend);

    await _openDetailAndConfirm(tester);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorLeaveRequestNotPending), findsOneWidget);
    expect(backend.listCalls, 2);
    expect(find.text('Đã duyệt (1)'), findsOneWidget);
  });

  testWidgets('WT-LEAVE-04: 404 reloads; 403 is explained without reloading', (tester) async {
    final gone = _onePending(cancelStatus: 404, cancelCode: 'leave_request_not_found');
    await _open(tester, gone);
    await _openDetailAndConfirm(tester);
    await tester.pumpAndSettle();
    expect(find.text(viL10n.errorLeaveRequestNotFound), findsOneWidget);
    expect(gone.listCalls, 2);

    final notMine = _onePending(cancelStatus: 403, cancelCode: 'not_your_leave_request');
    await _open(tester, notMine);
    await _openDetailAndConfirm(tester);
    await tester.pumpAndSettle();
    expect(find.text(viL10n.errorLeaveNotYourRequest), findsOneWidget);
    expect(notMine.listCalls, 1);
    expect(find.byKey(const Key('cancel_leave')), findsOneWidget);
  });

  testWidgets('WT-LEAVE-05: actions with no backend route are not shown', (tester) async {
    final backend = _LeaveBackend([
      backendLeaveRow('2a6c2b7e-0d7a-4c55-9a3e-2b8f3d9e4a11', 'rejected', code: 'LEAVE-20260914-RRRRRR'),
      backendLeaveRow('3a6c2b7e-0d7a-4c55-9a3e-2b8f3d9e4a12', 'approved', code: 'LEAVE-20260914-PPPPPP'),
    ]);
    final adapter = await _open(tester, backend);

    // The filter icon had no action
    expect(find.byIcon(Icons.filter_list), findsNothing);

    await tester.tap(find.text('Bị từ chối (1)'));
    await tester.pumpAndSettle();
    expect(find.text('Gửi lại'), findsNothing);

    await tester.tap(find.text('LEAVE-20260914-RRRRRR'));
    await tester.pumpAndSettle();
    expect(find.text('Sửa & gửi lại'), findsNothing);
    expect(find.text('Chia sẻ'), findsNothing);
    expect(find.text('Hủy đơn'), findsNothing);
    expect(find.byType(ElevatedButton), findsNothing);

    await tester.tap(find.byIcon(Icons.chevron_left));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đã duyệt (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('LEAVE-20260914-PPPPPP'));
    await tester.pumpAndSettle();
    expect(find.byType(ElevatedButton), findsNothing);
    expect(_patches(adapter), isEmpty);
  });
}
