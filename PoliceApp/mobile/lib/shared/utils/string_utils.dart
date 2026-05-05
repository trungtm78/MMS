/// Safe string utilities to avoid common null/empty crashes.

/// Returns the first character of [name] uppercased, or [fallback]
/// if name is null/empty/whitespace-only. Never throws.
String initials(String? name, {String fallback = '?'}) {
  if (name == null) return fallback;
  final trimmed = name.trim();
  if (trimmed.isEmpty) return fallback;
  return trimmed.substring(0, 1).toUpperCase();
}

/// Returns the last word of [name] (e.g. "Nguyễn Văn An" → "An").
/// Returns [fallback] if name is null/empty/whitespace-only. Never throws.
String lastWord(String? name, {String fallback = ''}) {
  if (name == null) return fallback;
  final trimmed = name.trim();
  if (trimmed.isEmpty) return fallback;
  final parts = trimmed.split(RegExp(r'\s+'));
  return parts.last;
}
