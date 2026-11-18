// Unit Tests: upload purposes
//   POST /files/upload `purpose` IsIn(FILE_PURPOSES) = general, task_report, work_report, official_document, task,
//   militia_profile (Web/backend/src/files/files.service.ts FILE_RELATED_TYPES, files.controller.ts).
// Run: flutter test test/unit_file_purpose_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/files/files.dart';

void main() {
  test('UT-FPUR-01: every purpose the backend accepts, with its wire value', () {
    expect({for (final p in FilePurpose.values) p: p.wire}, {
      FilePurpose.general: 'general',
      FilePurpose.taskReport: 'task_report',
      FilePurpose.workReport: 'work_report',
      FilePurpose.officialDocument: 'official_document',
      FilePurpose.task: 'task',
      FilePurpose.militiaProfile: 'militia_profile',
    });
  });

  test('UT-FPUR-02: wire values are unique', () {
    expect(FilePurpose.values.map((p) => p.wire).toSet(), hasLength(FilePurpose.values.length));
  });
}
