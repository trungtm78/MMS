import '../../shared/utils/api_failure.dart';

/// Why a task call was not made or its answer could not be used, other than an API error. Worded by
/// tasksIssueText (lib/features/tasks/tasks_texts.dart).
enum TasksIssue {
  /// The answer was not the task, the page or the report the route returns
  malformedResponse,

  /// SubmitReportDto.description is empty once trimmed
  reportDescriptionRequired,

  /// SubmitReportDto.description is over maxTaskReportDescriptionLength
  reportDescriptionTooLong,

  /// SubmitReportDto.location is over maxTaskReportLocationLength
  reportLocationTooLong,

  /// SubmitReportDto.photoIds holds more than maxTaskReportPhotos ids
  reportTooManyPhotos,

  /// SubmitReportDto.photoIds holds an id twice (@ArrayUnique)
  reportDuplicatePhotos,
}

/// A task call that failed: [issue] for a local check or an unusable answer, [failure] for a failed
/// API call (worded by tasksErrorText, which falls back to the one error table).
class TasksException implements Exception, HasApiFailure {
  const TasksException(TasksIssue this.issue) : failure = null;

  TasksException.api(ApiFailure this.failure) : issue = null;

  final TasksIssue? issue;

  @override
  final ApiFailure? failure;

  int? get statusCode => failure?.status;

  @override
  String toString() => 'TasksException(${issue?.name ?? failure})';
}
