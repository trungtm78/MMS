// Widget Tests: notifications screen
//   GET   /notifications?page=&limit=   → {data, total, page, limit}   (notifications.controller.ts:40-87)
//   PATCH /notifications/:id/read       → {ok: true} | 404 notification_not_found
//   POST  /notifications/read-all       → {updated: n}
// Texts come from lib/l10n/app_vi.arb; failures through lib/l10n/failure_texts.dart.
// Run: flutter test test/widget_notifications_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/notifications/screens/notifications_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

Map<String, Object?> _row(int i, {bool read = false, String type = 'task'}) => {
      'id': 'n$i',
      'type': type,
      'title': 'Title $i',
      'body': 'Body $i',
      'entityType': null,
      'entityId': null,
      'isRead': read,
      'readAt': read ? '2026-09-14T02:00:00.000Z' : null,
      'createdAt': '2026-09-14T01:00:00.000Z',
    };

/// GET /notifications over [rows], honouring page and limit
ResponseBody _pageOf(RequestOptions o, List<Map<String, Object?>> rows) {
  final page = o.queryParameters['page'] as int;
  final limit = o.queryParameters['limit'] as int;
  return jsonBody(200, {
    'data': rows.skip((page - 1) * limit).take(limit).toList(),
    'total': rows.length,
    'page': page,
    'limit': limit,
  });
}

ResponseBody _serverError(RequestOptions _) => jsonBody(500, {'statusCode': 500});

Future<FakeAdapter> _pump(
  WidgetTester tester,
  ResponseBody Function(RequestOptions) handler, {
  Future<void> Function(RequestOptions)? gate,
}) async {
  final adapter = FakeAdapter(handler, gate: gate);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: localizedApp(const NotificationsScreen()),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Finder _markAll() => find.widgetWithText(TextButton, viL10n.notificationsMarkAllRead);

void main() {
  testWidgets('WT-NOTIF-01: lists the notifications with a mark-all action while some are unread', (tester) async {
    await _pump(tester, (o) => _pageOf(o, [_row(1), _row(2, read: true, type: 'alert'), _row(3, type: 'leave')]));

    expect(find.text(viL10n.notificationsTitle), findsOneWidget);
    expect(find.text('Title 1'), findsOneWidget);
    expect(find.text('Body 2'), findsOneWidget);
    expect(find.text('Title 3'), findsOneWidget);
    expect(_markAll(), findsOneWidget);
    // Everything fits in one page: nothing more to load
    expect(find.text(viL10n.notificationsLoadMore(3, 3)), findsNothing);
  });

  testWidgets('WT-NOTIF-02: no notifications shows the empty state', (tester) async {
    await _pump(tester, (o) => _pageOf(o, const []));

    expect(find.text(viL10n.notificationsEmpty), findsOneWidget);
    expect(_markAll(), findsNothing);
  });

  testWidgets('WT-NOTIF-03: a failed load shows the failure text, and retry loads again', (tester) async {
    var fail = true;
    final adapter = await _pump(tester, (o) => fail ? _serverError(o) : _pageOf(o, [_row(1)]));

    expect(find.text(viL10n.notificationsLoadFailed(viL10n.errorServer)), findsOneWidget);

    fail = false;
    await tester.tap(find.widgetWithText(ElevatedButton, viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text('Title 1'), findsOneWidget);
    expect(adapter.requests.where((r) => r.path == '/notifications'), hasLength(2));
  });

  testWidgets('WT-NOTIF-04: a body that is not the envelope is reported as unreadable data', (tester) async {
    await _pump(tester, (_) => jsonBody(200, [_row(1)]));

    expect(find.text(viL10n.notificationsLoadFailed(viL10n.errorBadResponse)), findsOneWidget);
  });

  testWidgets('WT-NOTIF-05: tapping an unread notification marks it read on the server', (tester) async {
    final adapter = await _pump(tester, (o) {
      if (o.method == 'PATCH') return jsonBody(200, {'ok': true});
      return _pageOf(o, [_row(1), _row(2, read: true)]);
    });

    await tester.tap(find.text('Title 1'));
    await tester.pumpAndSettle();

    expect(adapter.requests.last.method, 'PATCH');
    expect(adapter.requests.last.path, '/notifications/n1/read');
    // No unread notification is left
    expect(_markAll(), findsNothing);

    // A read one sends nothing
    final sent = adapter.requests.length;
    await tester.tap(find.text('Title 2'));
    await tester.pumpAndSettle();
    expect(adapter.requests, hasLength(sent));
  });

  testWidgets('WT-NOTIF-06: marking read that the server refuses puts the unread state back', (tester) async {
    await _pump(tester, (o) {
      if (o.method == 'PATCH') {
        return jsonBody(404, {'code': 'E003', 'message': 'notification_not_found', 'statusCode': 404});
      }
      return _pageOf(o, [_row(1)]);
    });

    await tester.tap(find.text('Title 1'));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorNotificationNotFound), findsOneWidget);
    expect(_markAll(), findsOneWidget);
  });

  testWidgets('WT-NOTIF-07: mark all read posts read-all and clears the unread state', (tester) async {
    final adapter = await _pump(tester, (o) {
      if (o.path == '/notifications/read-all') return jsonBody(200, {'updated': 2});
      return _pageOf(o, [_row(1), _row(2)]);
    });

    await tester.tap(_markAll());
    await tester.pumpAndSettle();

    expect(adapter.requests.last.method, 'POST');
    expect(adapter.requests.last.path, '/notifications/read-all');
    expect(_markAll(), findsNothing);
  });

  testWidgets('WT-NOTIF-08: mark all read failing keeps the action and shows the failure', (tester) async {
    await _pump(tester, (o) {
      if (o.path == '/notifications/read-all') return _serverError(o);
      return _pageOf(o, [_row(1)]);
    });

    await tester.tap(_markAll());
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorServer), findsOneWidget);
    expect(_markAll(), findsOneWidget);
  });

  testWidgets('WT-NOTIF-09: load more appends the next page and disappears at the end', (tester) async {
    final rows = [for (var i = 1; i <= 21; i++) _row(i)];
    final release = Completer<void>();
    final adapter = await _pump(
      tester,
      (o) => _pageOf(o, rows),
      gate: (o) => o.queryParameters['page'] == 2 ? release.future : Future<void>.value(),
    );

    final more = find.text(viL10n.notificationsLoadMore(20, 21));
    await tester.scrollUntilVisible(more, 300);
    await tester.tap(more);
    await tester.pump();
    // While the page is on its way the button turns into a spinner
    expect(more, findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    release.complete();
    await tester.pumpAndSettle();

    expect(adapter.requests.last.queryParameters, {'page': 2, 'limit': 20});
    await tester.scrollUntilVisible(find.text('Title 21'), 300);
    expect(find.text('Title 21'), findsOneWidget);
    expect(find.textContaining(viL10n.notificationsLoadMore(21, 21)), findsNothing);
  });

  testWidgets('WT-NOTIF-10: load more failing shows the failure and keeps the button', (tester) async {
    final rows = [for (var i = 1; i <= 21; i++) _row(i)];
    await _pump(tester, (o) => o.queryParameters['page'] == 2 ? _serverError(o) : _pageOf(o, rows));

    final more = find.text(viL10n.notificationsLoadMore(20, 21));
    await tester.scrollUntilVisible(more, 300);
    await tester.tap(more);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.errorServer), findsOneWidget);
    expect(more, findsOneWidget);
  });
}
