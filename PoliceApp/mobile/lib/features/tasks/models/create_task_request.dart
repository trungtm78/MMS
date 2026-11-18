import '../../../shared/errors/app_failure.dart';
import '../../../shared/utils/json_number.dart';

/// Priorities accepted by CreateTaskDto (Web/backend/src/tasks/tasks.controller.ts)
const taskPriorities = ['low', 'medium', 'high', 'urgent'];

/// CreateTaskDto.locationName @Length(1, 500)
const maxTaskLocationNameLength = 500;

/// CreateTaskDto.attachmentIds @ArrayMaxSize(10) @ArrayUnique (TASK_ATTACHMENTS_PER_REQUEST): ids from
/// POST /files/upload with purpose task (or general)
const maxTaskAttachments = 10;

/// Body for POST /tasks. The global ValidationPipe rejects unknown fields
/// (forbidNonWhitelisted); the location goes in locationName / locationLat / locationLng.
/// A value the backend would refuse throws [AppFailure] with an app code (texts: failure_texts.dart).
Map<String, dynamic> buildCreateTaskBody({
  required String title,
  String description = '',
  String locationName = '',
  double? locationLat,
  double? locationLng,
  required String priority,
  DateTime? deadline,
  required String assigneeMilitiaId,
  List<String> attachmentIds = const [],
}) {
  if (!taskPriorities.contains(priority)) {
    throw const AppFailure(AppFailure.taskPriorityInvalid);
  }
  final name = locationName.trim();
  if (name.length > maxTaskLocationNameLength) {
    throw const AppFailure(AppFailure.taskLocationNameTooLong, args: {'max': maxTaskLocationNameLength});
  }
  if ((locationLat == null) != (locationLng == null)) {
    throw const AppFailure(AppFailure.taskCoordinatesIncomplete);
  }
  if (locationLat != null && (locationLat < -90 || locationLat > 90)) {
    throw const AppFailure(AppFailure.taskLatitudeOutOfRange);
  }
  if (locationLng != null && (locationLng < -180 || locationLng > 180)) {
    throw const AppFailure(AppFailure.taskLongitudeOutOfRange);
  }
  if (attachmentIds.length > maxTaskAttachments) {
    throw const AppFailure(AppFailure.attachmentsTooMany, args: {'max': maxTaskAttachments});
  }
  if (attachmentIds.toSet().length != attachmentIds.length) throw const AppFailure('duplicate_file_ids');
  final desc = description.trim();
  return {
    'title': title.trim(),
    if (desc.isNotEmpty) 'description': desc,
    'priority': priority,
    if (deadline != null) 'deadline': deadline.toUtc().toIso8601String(),
    if (name.isNotEmpty) 'locationName': name,
    if (locationLat != null) 'locationLat': locationLat,
    if (locationLng != null) 'locationLng': locationLng,
    'assigneeMilitiaId': assigneeMilitiaId,
    if (attachmentIds.isNotEmpty) 'attachmentIds': List<String>.of(attachmentIds),
  };
}

/// Task location for display from GET /tasks/:id: the name, with coordinates when present; null when
/// the task has no location. Coordinates are NUMERIC: JSON numbers or numeric strings.
String? taskLocationLabel(Map<String, dynamic> task) {
  final rawName = task['locationName'];
  final name = rawName is String ? rawName.trim() : '';
  final lat = jsonNumber(task['locationLat']);
  final lng = jsonNumber(task['locationLng']);
  final coords = lat != null && lng != null ? '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}' : null;
  if (name.isNotEmpty) return coords == null ? name : '$name ($coords)';
  return coords;
}
