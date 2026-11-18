import '../../shared/utils/number_format.dart';

/// Where a task takes place, from the locationName / locationLat / locationLng fields of
/// GET /tasks and GET /tasks/:id (Web/backend/src/tasks/task-sql.ts taskRowSelect). Coordinates are
/// JSON numbers (location_lat::float8); a numeric string reads the same.
/// 'Name (lat, lng)', just the name or just the coordinates; null when there is neither.
String? taskLocationText(Map<String, dynamic> task) {
  final rawName = task['locationName'];
  final name = rawName is String ? rawName.trim() : '';
  final lat = parseDecimal(task['locationLat']);
  final lng = parseDecimal(task['locationLng']);
  final coordinates =
      lat != null && lng != null ? '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}' : null;
  if (name.isEmpty) return coordinates;
  return coordinates == null ? name : '$name ($coordinates)';
}
