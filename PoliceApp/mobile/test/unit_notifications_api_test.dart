// Unit Tests: NotificationsApi against Web/backend NotificationsController
//   GET   /notifications?page=&limit=   → {data, total, page, limit}   (notifications.controller.ts:40-87)
//   PATCH /notifications/:id/read       → {ok: true}                   (notifications.controller.ts:89-107)
//   POST  /notifications/read-all       → {updated: n}                 (notifications.controller.ts:109-122)
// Run: flutter test test/unit_notifications_api_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/notifications/models/notification_models.dart';
import 'package:police_app/features/notifications/providers/notifications_provider.dart';
import 'package:police_app/l10n/failure_texts.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

(NotificationsApi, FakeAdapter) _api(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (NotificationsApi(dio), adapter);
}

final _page = {
  'data': [
    {
      'id': 'n1',
      'type': 'task',
      'title': 'New task',
      'body': 'Patrol block 3',
      'entityType': 'task',
      'entityId': 't1',
      'isRead': false,
      'readAt': null,
      'createdAt': '2026-09-14T01:00:00.000Z',
    },
    {
      'id': 'n2',
      'type': 'leave',
      'title': 'Leave request',
      'body': 'Approved',
      'entityType': null,
      'entityId': null,
      'isRead': true,
      'readAt': '2026-09-14T02:30:00.000Z',
      'createdAt': '2026-09-13T08:00:00.000Z',
    },
  ],
  'total': 3,
  'page': 1,
  'limit': 2,
};

void main() {
  group('NotificationsApi', () {
    test('UT-NOTIF-01: parses the {data,total,page,limit} envelope with isRead/readAt', () async {
      final (api, _) = _api((_) => jsonBody(200, _page));

      final page = await api.fetch(page: 1, limit: 2);

      expect(page.total, 3);
      expect(page.page, 1);
      expect(page.limit, 2);
      expect(page.hasMore, isTrue);
      expect(page.items, hasLength(2));
      final first = page.items.first;
      expect(first.id, 'n1');
      expect(first.type, 'task');
      expect(first.title, 'New task');
      expect(first.body, 'Patrol block 3');
      expect(first.entityId, 't1');
      expect(first.isRead, isFalse);
      expect(first.readAt, isNull);
      expect(first.createdAt, DateTime.utc(2026, 9, 14, 1));
      final second = page.items.last;
      expect(second.isRead, isTrue);
      expect(second.readAt, DateTime.utc(2026, 9, 14, 2, 30));
    });

    test('UT-NOTIF-02: sends page and limit as query parameters', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {'data': [], 'total': 0, 'page': 2, 'limit': 20}));

      final page = await api.fetch(page: 2, limit: 20);

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/notifications');
      expect(req.queryParameters, {'page': 2, 'limit': 20});
      expect(page.items, isEmpty);
      expect(page.hasMore, isFalse);
    });

    test('UT-NOTIF-03: mark one read uses PATCH /notifications/:id/read', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {'ok': true}));

      await api.markRead('n1');

      final req = adapter.requests.single;
      expect(req.method, 'PATCH');
      expect(req.path, '/notifications/n1/read');
    });

    test('UT-NOTIF-04: mark all read uses POST /notifications/read-all and returns the count', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {'updated': 4}));

      final updated = await api.markAllRead();

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/notifications/read-all');
      expect(updated, 4);
    });

    test('UT-NOTIF-05: 404 notification_not_found reaches the UI as its code', () async {
      final (api, _) = _api((_) => jsonBody(404, {
            'code': 'E003',
            'message': 'notification_not_found',
            'statusCode': 404,
          }));

      Object? error;
      try {
        await api.markRead('n9');
      } catch (e) {
        error = e;
      }
      expect(error, isA<DioException>());
      final failure = AppFailure.from(error!);
      expect(failure.code, 'notification_not_found');
      expect(failure.status, 404);
      expect(failureText(viL10n, failure), viL10n.errorNotificationNotFound);
    });

    test('UT-NOTIF-06: markedRead keeps the row and sets readAt', () {
      final n = AppNotification.fromJson((_page['data'] as List)[0] as Map<String, dynamic>);
      final at = DateTime.utc(2026, 9, 14, 3);
      final read = n.markedRead(at);
      expect(read.isRead, isTrue);
      expect(read.readAt, at);
      expect(read.id, n.id);
      expect(n.isRead, isFalse);
    });

    test('UT-NOTIF-07: a body that is not the envelope, or a row without an id, is unreadable data', () {
      expect(() => NotificationPage.fromJson([1, 2]), throwsFormatException);
      expect(
        () => NotificationPage.fromJson({
          'data': [
            {'type': 'task', 'title': 'x'},
          ],
        }),
        throwsFormatException,
      );
      expect(AppFailure.from(const FormatException('x')).code, AppFailure.badResponse);
    });

    test('UT-NOTIF-08: notificationsApiProvider talks through the app Dio', () async {
      final adapter = FakeAdapter((_) => jsonBody(200, {'updated': 2}));
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
      final container = ProviderContainer(overrides: [dioProvider.overrideWithValue(dio)]);
      addTearDown(container.dispose);

      final updated = await container.read(notificationsApiProvider).markAllRead();

      expect(updated, 2);
      expect(adapter.requests.single.path, '/notifications/read-all');
    });
  });
}
