// Defensive readers for auth response fields: a mistyped optional field never throws.

String? nonBlankString(Object? value) =>
    value is String && value.trim().isNotEmpty ? value : null;

DateTime? parseDateTime(Object? value) => value is String ? DateTime.tryParse(value) : null;

int? intOrNull(Object? value) => value is num ? value.toInt() : null;

List<String> stringList(Object? value) =>
    value is List ? value.whereType<String>().toList() : const [];
