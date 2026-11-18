// Unit Tests: failure texts of reports, approvals, attendance and files (lib/l10n/failure_texts.dart)
//   files codes: Web/backend/src/files (upload.interceptor.ts, files.controller.ts, files.service.ts)
//   app codes: local checks in lib/features/{reports,approvals}/providers and lib/shared/files
// Run: flutter test test/unit_reports_failure_texts_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/l10n/failure_texts.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/l10n.dart';

String _text(String code, [Map<String, Object> args = const {}]) =>
    failureText(viL10n, AppFailure(code, args: args));

void main() {
  test('UT-RFT-01: every files code the backend sends has its own text', () {
    final texts = {
      'file_required': viL10n.filesErrorFileRequired,
      'file_empty': viL10n.filesErrorFileEmpty,
      'file_field_invalid': viL10n.filesErrorFileFieldInvalid,
      'multipart_malformed': viL10n.filesErrorMultipartMalformed,
      'file_too_large': viL10n.filesErrorFileTooLarge,
      'file_type_not_allowed': viL10n.filesErrorFileTypeNotAllowed,
      'file_not_found': viL10n.filesErrorFileNotFound,
      'duplicate_file_ids': viL10n.filesErrorDuplicateFileIds,
      'file_purpose_mismatch': viL10n.filesErrorFilePurposeMismatch,
      'file_already_attached': viL10n.filesErrorFileAlreadyAttached,
    };
    for (final entry in texts.entries) {
      expect(codeText(viL10n, entry.key), entry.value, reason: entry.key);
    }
    expect(texts.values.toSet(), hasLength(texts.length), reason: 'each code says something different');
  });

  test('UT-RFT-02: app codes of local checks have texts, with their limits', () {
    expect(_text(AppFailure.photoAccessDenied), viL10n.filesErrorPhotoAccessDenied);
    expect(_text(AppFailure.photoPickFailed), viL10n.filesErrorPhotoPickFailed);
    expect(_text(AppFailure.reportTypeInvalid), viL10n.reportsErrorTypeInvalid);
    expect(_text(AppFailure.reviewStatusInvalid), viL10n.reportsErrorReviewStatusInvalid);
    expect(_text(AppFailure.dateFilterInvalid), viL10n.reportsErrorDateFilterInvalid);
    expect(_text(AppFailure.reportTitleRequired), viL10n.reportsErrorTitleRequired);
    expect(_text(AppFailure.reportContentRequired), viL10n.reportsErrorContentRequired);
    expect(_text(AppFailure.reportTitleTooLong, {'max': 255}), viL10n.reportsErrorTitleTooLong(255));
    expect(_text(AppFailure.reportContentTooLong, {'max': 10000}), viL10n.reportsErrorContentTooLong(10000));
    expect(_text(AppFailure.reportLocationTooLong, {'max': 255}), viL10n.reportsErrorLocationTooLong(255));
    expect(_text(AppFailure.reviewNoteTooLong, {'max': 1000}), viL10n.reportsErrorReviewNoteTooLong(1000));
    expect(_text(AppFailure.attachmentsTooMany, {'max': 10}), viL10n.reportsErrorAttachmentsTooMany(10));
    expect(_text(AppFailure.leaveReasonTooLong, {'max': 1000}), viL10n.approvalsErrorReasonTooLong(1000));
  });

  test('UT-RFT-03: a limit that arrives without its value still reads', () {
    expect(_text(AppFailure.reportTitleTooLong), viL10n.reportsErrorTitleTooLong(0));
    expect(_text(AppFailure.attachmentsTooMany, {'max': 'ten'}), viL10n.reportsErrorAttachmentsTooMany(0));
  });
}
