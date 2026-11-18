/// Numbers from NUMERIC columns, which node-postgres sends as strings.
library;

/// [value] as a finite double when it is a number or a numeric string, otherwise null.
double? parseDecimal(Object? value) {
  final double? d;
  if (value is num) {
    d = value.toDouble();
  } else if (value is String) {
    d = double.tryParse(value.trim());
  } else {
    d = null;
  }
  return d != null && d.isFinite ? d : null;
}

/// Vietnamese decimal text: '10', '28,5', '1,25' — no trailing zeros.
String formatDecimal(num value, {int fractionDigits = 2}) {
  var text = value.toStringAsFixed(fractionDigits);
  if (text.contains('.')) {
    text = text.replaceFirst(RegExp(r'0+$'), '');
    if (text.endsWith('.')) text = text.substring(0, text.length - 1);
  }
  if (text == '-0') text = '0';
  return text.replaceAll('.', ',');
}

/// A count from the backend as a whole number: an int, a double without a fraction or a numeric
/// string ('18', '3.0'). BIGINT columns (COUNT(*)) may be sent as text; a string of digits is read
/// exactly, even beyond double precision. Null for fractions and anything that is not a number.
int? parseWholeNumber(Object? value) {
  if (value is int) return value;
  if (value is String) {
    final exact = int.tryParse(value.trim());
    if (exact != null) return exact;
  }
  final d = parseDecimal(value);
  return d != null && d == d.roundToDouble() ? d.toInt() : null;
}
