import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/notification_models.dart';

/// REST client for Web/backend/src/notifications/notifications.controller.ts.
/// Errors are rethrown as [DioException] (or FormatException for unreadable data); the UI shows
/// them with failureText(context.l10n, AppFailure.from(error)).
class NotificationsApi {
  NotificationsApi(this._dio);

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
    await _dio.patch(ApiConstants.notificationRead.replaceFirst('{id}', id));
  }

  /// POST /notifications/read-all → number of receipts marked read
  Future<int> markAllRead() async {
    final res = await _dio.post(ApiConstants.notificationReadAll);
    final data = res.data;
    final updated = data is Map ? data['updated'] : null;
    return updated is num ? updated.toInt() : 0;
  }
}

final notificationsApiProvider = Provider<NotificationsApi>((ref) {
  return NotificationsApi(ref.watch(dioProvider));
});
