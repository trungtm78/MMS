import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/utils/api_failure.dart';
import '../../auth/providers/auth_provider.dart';
import '../task_status.dart';

/// A task call that failed. [failure] is a failed API call, worded by the screen with errorTextFor
/// (lib/l10n/error_texts.dart); [message] is the text of a local check.
class TasksException implements Exception, HasApiFailure {
  const TasksException(String this.message, {this.statusCode}) : failure = null;

  TasksException.api(ApiFailure this.failure)
      : message = null,
        statusCode = failure.status;

  final String? message;

  @override
  final ApiFailure? failure;

  final int? statusCode;

  @override
  String toString() => message ?? 'TasksException($failure)';
}

/// REST client for Web/backend/src/tasks/tasks.controller.ts.
class TasksRepository {
  TasksRepository(this._dio);

  final Dio _dio;

  /// listTasksPaginated clamps limit to 1..100 (tasks.service.ts:416)
  static const pageSize = 100;

  /// Upper bound on pages read, so a misbehaving server cannot keep the app looping
  static const maxPages = 50;

  /// Statuses the app sets with PATCH /tasks/:id/progress
  static const _settableStatuses = {TaskStatus.inProgress, TaskStatus.completed};

  static const _malformed = TasksException('Dữ liệu nhiệm vụ không đúng định dạng.');

  /// Every task assigned to [userId], newest first. GET /tasks is not scoped to the caller and
  /// returns one row per assignment (tasks.service.ts:402-448), so rows are kept when assigneeId is
  /// [userId] and de-duplicated by id; without a user id every task is kept once. Pages are read
  /// until one comes back short.
  Future<List<Map<String, dynamic>>> myTasks({String? userId}) async {
    final rows = <Map<String, dynamic>>[];
    for (var page = 1; page <= maxPages; page++) {
      final data = await _page(page);
      rows.addAll(data);
      if (data.length < pageSize) break;
    }
    final me = userId?.trim() ?? '';
    final seen = <String>{};
    return [
      for (final row in rows)
        if (row['id'] != null &&
            (me.isEmpty || row['assigneeId']?.toString() == me) &&
            seen.add(row['id'].toString()))
          row,
    ];
  }

  Future<List<Map<String, dynamic>>> _page(int page) async {
    final body = await _call(
      () => _dio.get(ApiConstants.tasks, queryParameters: {'page': page, 'limit': pageSize}),
    );
    if (body is! Map || body['data'] is! List) throw _malformed;
    return (body['data'] as List).whereType<Map>().map((r) => Map<String, dynamic>.from(r)).toList();
  }

  /// GET /tasks/:id → the task, no envelope
  Future<Map<String, dynamic>> task(String id) async =>
      _task(await _call(() => _dio.get(ApiConstants.taskById.replaceFirst('{id}', id))));

  /// POST /tasks/:id/accept → the task (tasks.service.ts:171-191)
  Future<Map<String, dynamic>> accept(String id) async =>
      _task(await _call(() => _dio.post(ApiConstants.acceptTask.replaceFirst('{id}', id))));

  /// PATCH /tasks/:id/progress {progress, status, note} → the task. [status] must be a backend code
  /// the assignee may set (in_progress or completed).
  Future<Map<String, dynamic>> updateStatus(String id, String status) async {
    if (!_settableStatuses.contains(status)) throw const TasksException('Trạng thái không hợp lệ.');
    return _task(await _call(() => _dio.patch(
          ApiConstants.updateTaskProgress.replaceFirst('{id}', id),
          data: {
            'progress': status == TaskStatus.completed ? 100 : 0,
            'status': status,
            'note': 'Cập nhật trạng thái: ${taskStatusLabel(status)}',
          },
        )));
  }

  static Map<String, dynamic> _task(Object? body) {
    if (body is! Map) throw _malformed;
    return Map<String, dynamic>.from(body);
  }

  static Future<Object?> _call(Future<Response<dynamic>> Function() request) async {
    try {
      return (await request()).data;
    } on DioException catch (e) {
      throw TasksException.api(ApiFailure.from(e));
    }
  }
}

final tasksRepositoryProvider = Provider<TasksRepository>((ref) {
  return TasksRepository(DioClient.getInstance(ref.watch(secureStorageProvider)));
});

/// The count on the bottom-nav task badge and the home card: the caller's tasks in the "Chờ" tab
/// (not started, deadline not passed), from every page of GET /tasks. 0 when they cannot be
/// loaded, so no badge is shown.
final waitingTaskCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final storage = ref.watch(secureStorageProvider);
  final repo = ref.watch(tasksRepositoryProvider);
  try {
    final tasks = await repo.myTasks(userId: await storage.getUserId());
    return countTaskTabs(tasks, DateTime.now())[TaskTab.waiting] ?? 0;
  } catch (_) {
    return 0;
  }
});
