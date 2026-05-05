import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/shared/utils/string_utils.dart';

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
      expect(initials('\t\n'), '?');
    });

    test('handles leading whitespace', () {
      expect(initials('  Trần'), 'T');
    });
  });

  group('lastWord()', () {
    test('returns last word for multi-word name', () {
      expect(lastWord('Nguyễn Văn An'), 'An');
      expect(lastWord('Trần Thị Bình'), 'Bình');
    });

    test('returns the only word if single', () {
      expect(lastWord('An'), 'An');
    });

    test('returns fallback for null/empty', () {
      expect(lastWord(null), '');
      expect(lastWord(''), '');
      expect(lastWord('   '), '');
    });

    test('handles multiple spaces', () {
      expect(lastWord('Nguyễn   Văn   An'), 'An');
    });
  });
}
