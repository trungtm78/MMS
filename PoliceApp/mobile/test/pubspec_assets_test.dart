// Every asset folder or file declared in pubspec.yaml must exist: `flutter build`
// stops with "unable to find directory entry in pubspec.yaml" on a clean checkout
// otherwise (git does not keep empty folders).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The entries listed under `flutter: assets:` in pubspec.yaml.
List<String> declaredAssets(String pubspec) {
  final entries = <String>[];
  var inAssets = false;
  var assetsIndent = 0;
  for (final line in pubspec.split(RegExp(r'\r?\n'))) {
    final trimmed = line.trimLeft();
    final indent = line.length - trimmed.length;
    if (trimmed.startsWith('assets:')) {
      inAssets = true;
      assetsIndent = indent;
      continue;
    }
    if (!inAssets || trimmed.isEmpty || trimmed.startsWith('#')) continue;
    if (indent <= assetsIndent && !trimmed.startsWith('-')) {
      inAssets = false;
      continue;
    }
    if (trimmed.startsWith('- ')) {
      entries.add(trimmed.substring(2).trim().replaceAll(RegExp(r'''^["']|["']$'''), ''));
    }
  }
  return entries;
}

void main() {
  test('declares only asset paths that exist', () {
    final missing = declaredAssets(File('pubspec.yaml').readAsStringSync())
        .where((entry) => entry.endsWith('/')
            ? !Directory(entry).existsSync()
            : !File(entry).existsSync())
        .toList();

    expect(missing, isEmpty, reason: 'pubspec.yaml declares missing assets');
  });
}
