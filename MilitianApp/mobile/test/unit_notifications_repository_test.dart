// Unit Tests: NotificationsRepository against Web/backend NotificationsController
//   GET    /notifications?page=&limit=   → {data, total, page, limit}
//   PATCH  /notifications/:id/read       → {ok: true}
//   POST   /notifications/read-all       → {updated: n}
//   DELETE /notifications/:id            → {ok: true}; 404 notification_not_found
//   (Web/backend/src/notifications/notifications.controller.ts)
// The model and repository carry no display text: an unreadable answer is a FormatException the
// screen words (notificationsScreenMalformed).
// Run: flutter test test/unit_notifications_repository_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/notifications/models/app_notification.dart';
import 'package:militian_app/features/notifications/repositories/notifications_repository.dart';
import 'package:militian_app/l10n/error_texts.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

(NotificationsRepository, FakeAdapter) _repo(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (NotificationsRepository(dio), adapter);
}

final _row = <String, dynamic>{
  'id': 'n1',
  'type': 'task',
  'title': 'New task',
  'body': 'Patrol ward 3',
  'entityType': 'task',
  'entityId': 't1',
  'isRead': false,
  'readAt': null,
  'createdAt': '2026-09-14T01:00:00.000Z',
};

void main() {
  test('UT-MNOTIF-01: parses the envelope with isRead/readAt/createdAt', () async {
    final (repo, _) = _repo((_) => jsonBody(200, {
          'data': [
            _row,
            {..._row, 'id': 'n2', 'isRead': true, 'readAt': '2026-09-14T02:30:00.000Z'},
          ],
          'total': 5,
          'page': 1,
          'limit': 2,
        }));

    final page = await repo.fetch(page: 1, limit: 2);

    expect(page.total, 5);
    expect(page.hasMore, isTrue);
    expect(page.items.first.isRead, isFalse);
    expect(page.items.first.readAt, isNull);
    expect(page.items.first.body, 'Patrol ward 3');
    expect(page.items.first.createdAt, DateTime.utc(2026, 9, 14, 1));
    expect(page.items.last.isRead, isTrue);
    expect(page.items.last.readAt, DateTime.utc(2026, 9, 14, 2, 30));
  });

  test('UT-MNOTIF-02: sends page and limit', () async {
    final (repo, adapter) = _repo((_) => jsonBody(200, {'data': [], 'total': 0, 'page': 3, 'limit': 20}));

    await repo.fetch(page: 3, limit: 20);

    expect(adapter.requests.single.method, 'GET');
    expect(adapter.requests.single.path, '/notifications');
    expect(adapter.requests.single.queryParameters, {'page': 3, 'limit': 20});
  });

  test('UT-MNOTIF-03: mark one read is PATCH /notifications/:id/read', () async {
    final (repo, adapter) = _repo((_) => jsonBody(200, {'ok': true}));

    await repo.markRead('n1');

    expect(adapter.requests.single.method, 'PATCH');
    expect(adapter.requests.single.path, '/notifications/n1/read');
  });

  test('UT-MNOTIF-04: mark all read is POST /notifications/read-all', () async {
    final (repo, adapter) = _repo((_) => jsonBody(200, {'updated': 7}));

    final updated = await repo.markAllRead();

    expect(adapter.requests.single.method, 'POST');
    expect(adapter.requests.single.path, '/notifications/read-all');
    expect(updated, 7);

    final (bare, _) = _repo((_) => jsonBody(200, {'ok': true}));
    expect(await bare.markAllRead(), 0);
  });

  test('UT-MNOTIF-05: 404 notification_not_found keeps its code for the error table', () async {
    final (repo, _) = _repo((_) => jsonBody(404, {'code': 'E003', 'message': 'notification_not_found', 'statusCode': 404}));
    Object? error;
    try {
      await repo.markRead('n9');
    } catch (e) {
      error = e;
    }
    expect(error, isA<DioException>());
    expect(ApiFailure.from(error!).code, 'notification_not_found');
    expect(errorTextFor(viL10n, error), viL10n.errorNotificationNotFound);
  });

  test('UT-MNOTIF-06: markedRead sets isRead and readAt', () {
    final n = AppNotification.fromJson(_row);
    final at = DateTime.utc(2026, 9, 14, 3);
    final read = n.markedRead(at);
    expect(read.isRead, isTrue);
    expect(read.readAt, at);
    expect(n.isRead, isFalse);
  });

  test('UT-MNOTIF-07: a body that is not the envelope is a FormatException', () {
    expect(() => NotificationPage.fromJson([_row]), throwsFormatException);
  });

  // DELETE /notifications/:id → {ok: true}; 404 notification_not_found when it is not
  // the caller's (notifications.controller.ts)
  test('UT-MNOTIF-08: delete is DELETE /notifications/:id', () async {
    final (repo, adapter) = _repo((_) => jsonBody(200, {'ok': true}));

    await repo.delete('n1');

    expect(adapter.requests.single.method, 'DELETE');
    expect(adapter.requests.single.path, '/notifications/n1');
  });

  test('UT-MNOTIF-09: a 404 on delete means the notification is already gone', () async {
    final (repo, _) = _repo((_) => jsonBody(404, {'code': 'E003', 'message': 'notification_not_found', 'statusCode': 404}));
    Object? notFound;
    try {
      await repo.delete('n9');
    } catch (e) {
      notFound = e;
    }
    expect(notFound, isA<DioException>());
    expect(notificationAlreadyGone(notFound!), isTrue);

    final (failing, _) = _repo((_) => jsonBody(500, {'code': 'E005', 'message': 'Internal server error', 'statusCode': 500}));
    Object? serverError;
    try {
      await failing.delete('n1');
    } catch (e) {
      serverError = e;
    }
    expect(notificationAlreadyGone(serverError!), isFalse);
    expect(errorTextFor(viL10n, serverError), viL10n.errorStatusServer);

    expect(
      notificationAlreadyGone(DioException(
        requestOptions: RequestOptions(path: '/notifications/n1'),
        type: DioExceptionType.connectionError,
      )),
      isFalse,
    );
    expect(notificationAlreadyGone(Exception('x')), isFalse);
  });

  test('UT-MNOTIF-10: unreadable answers carry a diagnostic, not display text', () {
    Object? missingId;
    try {
      AppNotification.fromJson({..._row}..remove('id'));
    } catch (e) {
      missingId = e;
    }
    expect(missingId, isA<FormatException>().having((e) => e.message, 'message', 'notification without id'));

    Object? notEnvelope;
    try {
      NotificationPage.fromJson('x');
    } catch (e) {
      notEnvelope = e;
    }
    expect(notEnvelope,
        isA<FormatException>().having((e) => e.message, 'message', 'notification list: not a {data: [...]} envelope'));

    final page = NotificationPage.fromJson({'data': [_row], 'total': 'x', 'page': null});
    expect((page.total, page.page, page.limit), (1, 1, 1));
  });
}
