// Guard: display texts live in lib/l10n/app_vi.arb (gen-l10n), not inline in lib/.
// Run: flutter test test/no_hardcoded_strings_test.dart

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Written before gen-l10n and untouched since; they still hold inline Vietnamese texts.
/// Tech debt: this list may only shrink.
const _legacyFiles = {
  'lib/core/constants/app_colors.dart',
  'lib/features/approvals/screens/chi_tieu_evaluation_screen.dart',
  'lib/features/attendance/screens/checkin_screen.dart',
  'lib/features/dqtv/screens/dqtv_list_screen.dart',
  'lib/features/dqtv_home/screens/dqtv_home_screen.dart',
  'lib/features/reports/screens/unit_compliance_screen.dart',
  'lib/shared/widgets/main_shell_ca.dart',
  'lib/shared/widgets/main_shell_dqtv.dart',
};

/// A string literal holding a Vietnamese (Latin-extended) letter: U+00C0-U+024F, U+1E00-U+1EFF
final _vietnameseLiteral = RegExp(
  r"'(?:[^'\\\n]|\\.)*[\u00C0-\u024F\u1E00-\u1EFF](?:[^'\\\n]|\\.)*'"
  r'|"(?:[^"\\\n]|\\.)*[\u00C0-\u024F\u1E00-\u1EFF](?:[^"\\\n]|\\.)*"',
);

/// An ASCII literal passed straight into a display slot
final _asciiDisplayLiteral = RegExp(
  r"\bText\(\s*'[A-Za-z]"
  r"|\b(?:tooltip|labelText|hintText|helperText|semanticLabel|semanticsLabel)\s*:\s*'[A-Za-z]",
);

List<String> _inlineTexts(String path) {
  final offending = <String>[];
  final lines = File(path).readAsLinesSync();
  for (var i = 0; i < lines.length; i++) {
    final trimmed = lines[i].trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    final code = lines[i].replaceFirst(RegExp(r'\s//\s.*$'), '');
    if (_vietnameseLiteral.hasMatch(code) || _asciiDisplayLiteral.hasMatch(code)) {
      offending.add('$path:${i + 1}: $trimmed');
    }
  }
  return offending;
}

List<String> _libDartFiles() => Directory('lib')
    .listSync(recursive: true)
    .whereType<File>()
    .map((f) => f.path.replaceAll(r'\', '/'))
    .where((p) => p.endsWith('.dart') && !p.startsWith('lib/l10n/'))
    .toList()
  ..sort();

void main() {
  test('GUARD-L10N-01: no inline display texts in lib/ outside the string resources', () {
    final offending = [
      for (final path in _libDartFiles())
        if (!_legacyFiles.contains(path)) ..._inlineTexts(path),
    ];
    expect(offending, isEmpty, reason: 'Move these texts to lib/l10n/app_vi.arb:\n${offending.join('\n')}');
  });

  test('GUARD-L10N-02: every legacy file still exists and still holds inline texts', () {
    for (final path in _legacyFiles) {
      expect(File(path).existsSync(), isTrue, reason: '$path is gone: drop it from _legacyFiles');
      expect(_inlineTexts(path), isNotEmpty, reason: '$path is clean now: drop it from _legacyFiles');
    }
  });
}
