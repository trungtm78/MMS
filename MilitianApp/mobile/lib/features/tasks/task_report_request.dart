/// SubmitReportDto limits (Web/backend/src/tasks/tasks.controller.ts:109-133)
const maxTaskReportDescriptionLength = 1000;
const maxTaskReportLocationLength = 200;

/// Body of POST /tasks/:id/report. Only fields the app can fill truthfully are sent:
/// never photoIds (POST /files/upload returns a filename, which fails @IsUUID) or
/// audioNoteUrl (voice recording is not available). Throws [ArgumentError] with a Vietnamese
/// message when the backend would reject the input.
Map<String, dynamic> buildTaskReportBody({
  required String description,
  DateTime? completedAt,
  String location = '',
}) {
  final text = description.trim();
  if (text.isEmpty) {
    throw ArgumentError.value(description, 'description', 'Vui lòng nhập mô tả kết quả.');
  }
  if (text.length > maxTaskReportDescriptionLength) {
    throw ArgumentError.value(
        description, 'description', 'Mô tả tối đa $maxTaskReportDescriptionLength ký tự.');
  }
  final place = location.trim();
  if (place.length > maxTaskReportLocationLength) {
    throw ArgumentError.value(location, 'location', 'Vị trí tối đa $maxTaskReportLocationLength ký tự.');
  }
  return {
    'description': text,
    if (completedAt != null) 'completedAt': completedAt.toUtc().toIso8601String(),
    if (place.isNotEmpty) 'location': place,
  };
}
