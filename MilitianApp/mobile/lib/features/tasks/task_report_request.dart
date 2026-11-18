import 'tasks_exception.dart';

/// SubmitReportDto limits (Web/backend/src/tasks/tasks.controller.ts): description @Length(1, 1000),
/// location @Length(0, 200), photoIds @ArrayMaxSize(10) @ArrayUnique
const maxTaskReportDescriptionLength = 1000;
const maxTaskReportLocationLength = 200;
const maxTaskReportPhotos = 10;

/// Body of POST /tasks/:id/report. [photoIds] are ids from POST /files/upload (purpose task_report),
/// sent in display order. audioNoteUrl is never sent: there is no voice upload route. Throws a
/// [TasksException] with the issue when the backend would refuse the input.
Map<String, dynamic> buildTaskReportBody({
  required String description,
  DateTime? completedAt,
  String location = '',
  List<String> photoIds = const [],
}) {
  final text = description.trim();
  if (text.isEmpty) throw const TasksException(TasksIssue.reportDescriptionRequired);
  if (text.length > maxTaskReportDescriptionLength) {
    throw const TasksException(TasksIssue.reportDescriptionTooLong);
  }
  final place = location.trim();
  if (place.length > maxTaskReportLocationLength) throw const TasksException(TasksIssue.reportLocationTooLong);
  if (photoIds.length > maxTaskReportPhotos) throw const TasksException(TasksIssue.reportTooManyPhotos);
  if (photoIds.toSet().length != photoIds.length) throw const TasksException(TasksIssue.reportDuplicatePhotos);
  return {
    'description': text,
    if (completedAt != null) 'completedAt': completedAt.toUtc().toIso8601String(),
    if (place.isNotEmpty) 'location': place,
    if (photoIds.isNotEmpty) 'photoIds': List<String>.of(photoIds),
  };
}
