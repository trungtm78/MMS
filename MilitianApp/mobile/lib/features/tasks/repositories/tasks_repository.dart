import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/utils/api_failure.dart';
import '../../../shared/utils/number_format.dart';
import '../../auth/providers/auth_provider.dart';
import '../../files/uploaded_file.dart';
import '../task_report_request.dart';
import '../task_status.dart';
import '../tasks_exception.dart';

export '../tasks_exception.dart';

/// The files attached to a task by its author: `attachments` of GET /tasks/:id and of the accept
/// answer ([{id, url, name, mimeType, size}]); none on the rows of GET /tasks.
List<UploadedFile> taskAttachmentsOf(Map<String, dynamic> task) => UploadedFile.listFromJson(task['attachments']);

/// The answer to POST /tasks/:id/report (tasks.service.ts submitReport): the stored report with its
/// photos in display order.
class TaskReport {
  const TaskReport({required this.id, required this.taskId, this.submittedAt, this.photos = const []});

  final String id;
  final String taskId;
  final DateTime? submittedAt;
  final List<UploadedFile> photos;
}

/// REST client for Web/backend/src/tasks/tasks.controller.ts. Every route is scoped to the caller: a
/// militia member reaches only the tasks assigned to them (common/access/member-scope.ts).
/// PATCH /tasks/:id/progress is not used: starting a task is [accept], completing it is [submitReport].
class TasksRepository {
  TasksRepository(this._dio);

  final Dio _dio;

  /// listTasksPaginated clamps limit to 1..100 (tasks.service.ts)
  static const pageSize = 100;

  /// Upper bound on pages read, so a misbehaving server cannot keep the app looping
  static const maxPages = 50;

  static const _malformed = TasksException(TasksIssue.malformedResponse);

  /// Every task of the caller, newest first, from GET /tasks {data, total, page, limit}. Pages are
  /// read until `total` rows are in or a page comes back short; a task listed twice (a page boundary
  /// moved while reading) is kept once and rows without an id are skipped.
  Future<List<Map<String, dynamic>>> myTasks() async {
    final rows = <Map<String, dynamic>>[];
    for (var page = 1; page <= maxPages; page++) {
      final (data, total) = await _page(page);
      rows.addAll(data);
      if (data.length < pageSize || (total != null && rows.length >= total)) break;
    }
    final seen = <String>{};
    return [
      for (final row in rows)
        if (row['id'] != null && seen.add(row['id'].toString())) row,
    ];
  }

  Future<(List<Map<String, dynamic>>, int?)> _page(int page) async {
    final body = await _call(
      () => _dio.get(ApiConstants.tasks, queryParameters: {'page': page, 'limit': pageSize}),
    );
    if (body is! Map || body['data'] is! List) throw _malformed;
    final data = (body['data'] as List).whereType<Map>().map((r) => Map<String, dynamic>.from(r)).toList();
    return (data, parseWholeNumber(body['total']));
  }

  /// GET /tasks/:id → the task with its attachments, no envelope
  Future<Map<String, dynamic>> task(String id) async =>
      _task(await _call(() => _dio.get(ApiConstants.taskById.replaceFirst('{id}', id))));

  /// POST /tasks/:id/accept → the task, now in_progress (tasks.service.ts acceptTask)
  Future<Map<String, dynamic>> accept(String id) async =>
      _task(await _call(() => _dio.post(ApiConstants.acceptTask.replaceFirst('{id}', id))));

  /// POST /tasks/:id/report: completes the task. The body is checked first (buildTaskReportBody), so a
  /// report the backend would refuse never leaves the device.
  Future<TaskReport> submitReport(
    String id, {
    required String description,
    DateTime? completedAt,
    String location = '',
    List<String> photoIds = const [],
  }) async {
    final body = buildTaskReportBody(
      description: description,
      completedAt: completedAt,
      location: location,
      photoIds: photoIds,
    );
    final answer = await _call(() => _dio.post(ApiConstants.submitTaskReport.replaceFirst('{id}', id), data: body));
    if (answer is! Map || answer['id'] == null) throw _malformed;
    final submittedAt = answer['submittedAt'];
    return TaskReport(
      id: answer['id'].toString(),
      taskId: '${answer['taskId'] ?? id}',
      submittedAt: submittedAt is String ? DateTime.tryParse(submittedAt) : null,
      photos: UploadedFile.listFromJson(answer['photos']),
    );
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

/// The count on the bottom-nav task badge and the home card: the caller's tasks in the waiting tab
/// (not started and not late), from every page of GET /tasks. 0 when they cannot be loaded, so no
/// badge is shown.
final waitingTaskCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final repo = ref.watch(tasksRepositoryProvider);
  try {
    final tasks = await repo.myTasks();
    return countTaskTabs(tasks, DateTime.now())[TaskTab.waiting] ?? 0;
  } on TasksException {
    return 0;
  }
});
