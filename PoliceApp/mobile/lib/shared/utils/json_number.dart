/// A number read from JSON. NUMERIC columns (training days, coordinates, KPI scores, amounts) arrive
/// as JSON numbers or as numeric strings, depending on the backend version; both read the same.
/// Null for anything else, NaN and infinities included.
num? jsonNumber(Object? value) {
  final number = switch (value) {
    final num n => n,
    final String s => num.tryParse(s.trim()),
    _ => null,
  };
  return number != null && number.isFinite ? number : null;
}
