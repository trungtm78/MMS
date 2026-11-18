/// Where a task takes place, from the locationName / locationLat / locationLng fields of
/// GET /tasks and GET /tasks/:id (Web/backend/src/tasks/tasks.service.ts:148-158, 402-436).
/// 'Name (lat, lng)', just the name or just the coordinates; null when there is neither.
String? taskLocationText(Map<String, dynamic> task) {
  final rawName = task['locationName'];
  final name = rawName is String ? rawName.trim() : '';
  final lat = task['locationLat'];
  final lng = task['locationLng'];
  final coordinates =
      lat is num && lng is num ? '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}' : null;
  if (name.isEmpty) return coordinates;
  return coordinates == null ? name : '$name ($coordinates)';
}
