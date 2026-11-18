import '../../../shared/errors/app_failure.dart';
import '../../../shared/files/uploaded_file.dart';

/// SubmitReportDto (Web/backend/src/tasks/tasks.controller.ts:121-147): description @Length(1, 1000),
/// location @Length(0, 200), photoIds @ArrayMaxSize(10) @ArrayUnique, each an upload id
const maxTaskReportDescriptionLength = 1000;
const maxTaskReportLocationLength = 200;
const maxTaskReportPhotos = 10;

/// Why the description would be refused, or null
AppFailure? taskReportDescriptionFailure(String description) {
  final text = description.trim();
  if (text.isEmpty) return const AppFailure(AppFailure.taskReportDescriptionRequired);
  if (text.length > maxTaskReportDescriptionLength) {
    return const AppFailure(AppFailure.taskReportDescriptionTooLong, args: {'max': maxTaskReportDescriptionLength});
  }
  return null;
}

/// Why the location would be refused, or null
AppFailure? taskReportLocationFailure(String location) => location.trim().length > maxTaskReportLocationLength
    ? const AppFailure(AppFailure.taskLocationNameTooLong, args: {'max': maxTaskReportLocationLength})
    : null;

/// Body for POST /tasks/:id/report; a value the backend would refuse throws [AppFailure]
Map<String, dynamic> buildTaskReportBody({
  required String description,
  String location = '',
  List<String> photoIds = const [],
}) {
  final failure = taskReportDescriptionFailure(description) ?? taskReportLocationFailure(location);
  if (failure != null) throw failure;
  if (photoIds.length > maxTaskReportPhotos) {
    throw const AppFailure(AppFailure.attachmentsTooMany, args: {'max': maxTaskReportPhotos});
  }
  if (photoIds.toSet().length != photoIds.length) throw const AppFailure('duplicate_file_ids');
  final place = location.trim();
  return {
    'description': description.trim(),
    if (place.isNotEmpty) 'location': place,
    if (photoIds.isNotEmpty) 'photoIds': List<String>.of(photoIds),
  };
}

/// The answer to POST /tasks/:id/report (tasks.service.ts submitReport): the report with the photos
/// it now holds
class TaskReportResult {
  const TaskReportResult({required this.id, required this.taskId, this.submittedAt, this.photos = const []});

  final String id;
  final String taskId;
  final DateTime? submittedAt;
  final List<UploadedFile> photos;

  factory TaskReportResult.fromJson(Object? body) {
    // Not shown to users: AppFailure.from turns it into AppFailure.badResponse
    if (body is! Map || body['id'] == null) throw const FormatException('POST /tasks/:id/report: expected {id, ...}');
    final submittedAt = body['submittedAt'];
    return TaskReportResult(
      id: body['id'].toString(),
      taskId: '${body['taskId'] ?? ''}',
      submittedAt: submittedAt is String ? DateTime.tryParse(submittedAt) : null,
      photos: UploadedFile.listFromJson(body['photos']),
    );
  }
}
