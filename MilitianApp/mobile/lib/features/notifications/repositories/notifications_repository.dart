import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/app_notification.dart';

/// REST client for Web/backend/src/notifications/notifications.controller.ts.
/// Errors are rethrown as [DioException]; the screen words them with errorTextFor
/// (lib/l10n/error_texts.dart).
class NotificationsRepository {
  NotificationsRepository(this._dio);

  final Dio _dio;

  /// GET /notifications?page=&limit= → {data, total, page, limit}
  Future<NotificationPage> fetch({int page = 1, int limit = 20}) async {
    final res = await _dio.get(
      ApiConstants.notifications,
      queryParameters: {'page': page, 'limit': limit},
    );
    return NotificationPage.fromJson(res.data);
  }

  /// PATCH /notifications/:id/read
  Future<void> markRead(String id) async {
    await _dio.patch(ApiConstants.markNotificationRead.replaceFirst('{id}', id));
  }

  /// POST /notifications/read-all → number of receipts marked read
  Future<int> markAllRead() async {
    final res = await _dio.post(ApiConstants.markAllNotificationsRead);
    final data = res.data;
    final updated = data is Map ? data['updated'] : null;
    return updated is num ? updated.toInt() : 0;
  }

  /// DELETE /notifications/:id → {ok: true}. Removes it for the caller only; 404
  /// notification_not_found when the caller has no such notification.
  Future<void> delete(String id) async {
    await _dio.delete(ApiConstants.deleteNotification.replaceFirst('{id}', id));
  }
}

/// A failed delete that means the notification is already gone (404), so it stays removed.
bool notificationAlreadyGone(Object error) =>
    error is DioException &&
    error.type == DioExceptionType.badResponse &&
    error.response?.statusCode == 404;

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(DioClient.getInstance(ref.watch(secureStorageProvider)));
});
