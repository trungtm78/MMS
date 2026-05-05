import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/shared/utils/string_utils.dart';

void main() {
  group('initials()', () {
    test('returns first letter uppercased for normal name', () {
      expect(initials('Nguyễn Văn An'), 'N');
      expect(initials('an'), 'A');
    });

    test('returns fallback for null', () {
      expect(initials(null), '?');
      expect(initials(null, fallback: 'X'), 'X');
    });

    test('returns fallback for empty/whitespace', () {
      expect(initials(''), '?');
      expect(initials('   '), '?');
    });
  });

  group('lastWord()', () {
    test('returns last word for multi-word name', () {
      expect(lastWord('Nguyễn Văn An'), 'An');
    });

    test('returns fallback for null/empty', () {
      expect(lastWord(null), '');
      expect(lastWord(''), '');
    });
  });
}
