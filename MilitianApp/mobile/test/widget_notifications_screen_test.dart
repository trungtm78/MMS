// Widget Tests: the notifications screen
//   GET /notifications?page=&limit= → {data, total, page, limit}; PATCH /notifications/:id/read;
//   POST /notifications/read-all → {updated}; DELETE /notifications/:id (404 notification_not_found when
//   already gone) — Web/backend/src/notifications/notifications.controller.ts.
//   Marking read and deleting show at once and are undone when the call fails.
// Run: flutter test test/widget_notifications_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:militian_app/core/constants/app_strings.dart';
import 'package:militian_app/features/notifications/repositories/notifications_repository.dart';
import 'package:militian_app/features/notifications/screens/notifications_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _l = viL10n;

Map<String, dynamic> _n(String id, String type, {bool read = false}) => {
      'id': id,
      'type': type,
      'title': 'Title $id',
      'body': 'Body $id',
      'entityType': null,
      'entityId': null,
      'isRead': read,
      'readAt': read ? '2026-09-14T02:00:00.000Z' : null,
      'createdAt': '2026-09-14T01:00:00.000Z',
    };

class _Rig {
  _Rig({
    List<Map<String, dynamic>>? items,
    ResponseBody Function(RequestOptions o)? list,
  }) : _list = list {
    this.items = items ?? [];
  }

  late List<Map<String, dynamic>> items;
  final ResponseBody Function(RequestOptions o)? _list;
  ResponseBody Function(RequestOptions o) markRead = (_) => jsonBody(200, {'ok': true});
  ResponseBody Function(RequestOptions o) markAll = (_) => jsonBody(200, {'updated': 3});
  ResponseBody Function(RequestOptions o) delete = (_) => jsonBody(200, {'ok': true});
  Completer<void>? holdDelete;

  late final adapter = FakeAdapter(
    (o) {
      if (o.method == 'GET' && o.path == '/notifications') {
        return _list?.call(o) ?? jsonBody(200, backendPage(items, limit: 20));
      }
      if (o.method == 'PATCH' && o.path.endsWith('/read')) return markRead(o);
      if (o.method == 'POST' && o.path == '/notifications/read-all') return markAll(o);
      if (o.method == 'DELETE') return delete(o);
      return jsonBody(404, {'message': 'no_route ${o.method} ${o.path}'});
    },
    gate: (o) => o.method == 'DELETE' ? holdDelete?.future : null,
  );

  Iterable<RequestOptions> requests(String method) => adapter.requests.where((r) => r.method == method);

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
    await tester.pumpWidget(ProviderScope(
      overrides: [notificationsRepositoryProvider.overrideWithValue(NotificationsRepository(dio))],
      child: localizedApp(const NotificationsScreen()),
    ));
    await tester.pumpAndSettle();
  }
}

String _tab(String label, int count) => count > 0 ? _l.notificationsScreenTabWithCount(label, count) : label;

void main() {
  testWidgets('WT-NOTIF-01: the list, the unread count, the tabs and their counts', (tester) async {
    final r = _Rig(items: [
      _n('n1', 'task'),
      _n('n2', 'attendance'),
      _n('n3', 'info', read: true),
      _n('n4', 'sos'),
      _n('n5', 'message'),
      _n('n6', 'leave', read: true),
      _n('n7', 'kpi', read: true),
      _n('n8', 'alert'),
      _n('n9', 'other', read: true),
    ]);
    await r.open(tester);

    expect(find.text(_l.notificationsScreenTitle), findsOneWidget);
    expect(find.text(_l.notificationsScreenUnreadCount(5)), findsOneWidget);
    expect(find.text(_l.notificationsScreenMarkAllRead), findsOneWidget);
    expect(find.text(_tab(_l.notificationsScreenTabAll, 5)), findsOneWidget);
    expect(find.text(_tab(_l.notificationsScreenTabTask, 1)), findsOneWidget);
    expect(find.text(_tab(_l.notificationsScreenTabAttendance, 1)), findsOneWidget);
    expect(find.text(_tab(_l.notificationsScreenTabSystem, 1)), findsOneWidget);
    for (var i = 1; i <= 9; i++) {
      expect(find.text('Title n$i'), findsOneWidget);
    }
    expect(find.text(_l.notificationsScreenUrgentBadge), findsOneWidget);
    final created = DateFormat(AppStrings.datetimeFormat).format(DateTime.utc(2026, 9, 14, 1).toLocal());
    expect(find.text(created), findsNWidgets(9));

    await tester.tap(find.text(_tab(_l.notificationsScreenTabTask, 1)));
    await tester.pumpAndSettle();
    expect(find.text('Title n1'), findsOneWidget);
    expect(find.text('Title n2'), findsNothing);

    await tester.tap(find.text(_tab(_l.notificationsScreenTabSystem, 1)));
    await tester.pumpAndSettle();
    expect(find.text('Title n3'), findsOneWidget);
    expect(find.text('Title n8'), findsOneWidget);
    expect(find.text('Title n1'), findsNothing);

    await tester.tap(find.text(_tab(_l.notificationsScreenTabAttendance, 1)));
    await tester.pumpAndSettle();
    expect(find.text('Title n2'), findsOneWidget);

    await tester.tap(find.text(_tab(_l.notificationsScreenTabAll, 5)));
    await tester.pumpAndSettle();
    expect(find.text('Title n9'), findsOneWidget);
  });

  testWidgets('WT-NOTIF-02: tapping marks read at once; a failure undoes it and is worded', (tester) async {
    final r = _Rig(items: [_n('n1', 'task'), _n('n2', 'task'), _n('n3', 'task', read: true)]);
    await r.open(tester);

    await tester.tap(find.text('Title n1'));
    await tester.pumpAndSettle();
    expect(r.requests('PATCH').single.path, '/notifications/n1/read');
    expect(find.text(_l.notificationsScreenUnreadCount(1)), findsOneWidget);

    // Already read: nothing to send
    await tester.tap(find.text('Title n3'));
    await tester.pumpAndSettle();
    expect(r.requests('PATCH'), hasLength(1));

    r.markRead = (_) => jsonBody(404, backendError(404, 'notification_not_found'));
    await tester.tap(find.text('Title n2'));
    await tester.pumpAndSettle();
    expect(find.text(_l.errorNotificationNotFound), findsOneWidget);
    expect(find.text(_l.notificationsScreenUnreadCount(1)), findsOneWidget);
  });

  testWidgets('WT-NOTIF-03: read all, and a failed read all', (tester) async {
    final r = _Rig(items: [_n('n1', 'task'), _n('n2', 'attendance')]);
    await r.open(tester);

    r.markAll = (_) => jsonBody(500, backendError(500, 'Internal server error'));
    await tester.tap(find.text(_l.notificationsScreenMarkAllRead));
    await tester.pumpAndSettle();
    expect(find.text(_l.errorStatusServer), findsOneWidget);
    expect(find.text(_l.notificationsScreenUnreadCount(2)), findsOneWidget);

    r.markAll = (_) => jsonBody(200, {'updated': 2});
    await tester.tap(find.text(_l.notificationsScreenMarkAllRead));
    await tester.pumpAndSettle();
    expect(r.requests('POST'), hasLength(2));
    expect(find.text(_l.notificationsScreenNoUnread), findsOneWidget);
    expect(find.text(_l.notificationsScreenMarkAllRead), findsNothing);
    expect(find.text(_l.notificationsScreenTabAll), findsOneWidget);
  });

  testWidgets('WT-NOTIF-04: delete removes at once; already gone stays removed; a failure puts it back',
      (tester) async {
    final r = _Rig(items: [_n('n1', 'task'), _n('n2', 'task'), _n('n3', 'task')]);
    await r.open(tester);

    r.holdDelete = Completer<void>();
    await tester.tap(find.byIcon(Icons.close).first);
    await tester.pump();
    expect(find.text('Title n1'), findsNothing);
    r.holdDelete!.complete();
    r.holdDelete = null;
    await tester.pumpAndSettle();
    expect(find.text('Title n1'), findsNothing);
    expect(r.requests('DELETE').single.path, '/notifications/n1');

    r.delete = (_) => jsonBody(404, backendError(404, 'notification_not_found'));
    await tester.tap(find.byIcon(Icons.close).first);
    await tester.pumpAndSettle();
    expect(find.text('Title n2'), findsNothing);
    expect(find.byType(SnackBar), findsNothing);

    r.delete = (_) => jsonBody(500, backendError(500, 'Internal server error'));
    await tester.tap(find.byIcon(Icons.close).first);
    await tester.pumpAndSettle();
    expect(find.text('Title n3'), findsOneWidget);
    expect(find.text(_l.errorStatusServer), findsOneWidget);
  });

  testWidgets('WT-NOTIF-05: load more appends the next page; a failed page is worded', (tester) async {
    var failPage2 = true;
    final r = _Rig(list: (o) {
      final page = o.queryParameters['page'];
      if (page == 1) return jsonBody(200, backendPage([_n('n1', 'task'), _n('n2', 'task')], total: 3, limit: 20));
      if (failPage2) return jsonBody(500, backendError(500, 'Internal server error'));
      // n2 again (it moved between pages) is not shown twice
      return jsonBody(200, backendPage([_n('n2', 'task'), _n('n3', 'task')], total: 3, page: 2, limit: 20));
    });
    await r.open(tester);

    final more = find.text(_l.notificationsScreenLoadMore(2, 3));
    expect(more, findsOneWidget);
    await tester.tap(more);
    await tester.pumpAndSettle();
    expect(find.text(_l.errorStatusServer), findsOneWidget);
    expect(find.text('Title n3'), findsNothing);

    failPage2 = false;
    await tester.tap(find.text(_l.notificationsScreenLoadMore(2, 3)));
    await tester.pumpAndSettle();
    expect(find.text('Title n2'), findsOneWidget);
    expect(find.text('Title n3'), findsOneWidget);
    expect(find.textContaining('/3)'), findsNothing);
  });

  testWidgets('WT-NOTIF-06: a failed or unreadable list is worded, with a retry', (tester) async {
    var answer = jsonBody(500, backendError(500, 'Internal server error'));
    final r = _Rig(list: (_) => answer);
    await r.open(tester);

    expect(find.text(_l.notificationsScreenLoadError(_l.errorStatusServer)), findsOneWidget);
    answer = jsonBody(200, [_n('n1', 'task')]);
    await tester.tap(find.text(_l.notificationsScreenRetryButton));
    await tester.pumpAndSettle();
    expect(find.text(_l.notificationsScreenLoadError(_l.notificationsScreenMalformed)), findsOneWidget);

    answer = jsonBody(200, backendPage([_n('n1', 'task')]));
    await tester.tap(find.text(_l.notificationsScreenRetryButton));
    await tester.pumpAndSettle();
    expect(find.text('Title n1'), findsOneWidget);
  });

  testWidgets('WT-NOTIF-07: nothing to show', (tester) async {
    await _Rig().open(tester);
    expect(find.text(_l.notificationsScreenEmptyTitle), findsOneWidget);
    expect(find.text(_l.notificationsScreenEmptySubtitle), findsOneWidget);
    expect(find.text(_l.notificationsScreenNoUnread), findsOneWidget);
  });

  testWidgets('WT-NOTIF-08: pull to refresh loads the list again', (tester) async {
    var calls = 0;
    final r = _Rig(list: (_) {
      calls++;
      return jsonBody(200, backendPage([_n(calls == 1 ? 'n1' : 'n2', 'task')]));
    });
    await r.open(tester);

    // Past RefreshIndicator's arming distance (a quarter of this tall viewport)
    await tester.fling(find.text('Title n1'), const Offset(0, 1200), 1000);
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.text('Title n2'), findsOneWidget);
  });
}
