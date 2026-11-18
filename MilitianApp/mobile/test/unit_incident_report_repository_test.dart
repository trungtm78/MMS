// Unit Tests: work report submission (MilitianApp's incident report)
// Backend: POST /work-reports (Web/backend/src/work-reports/work-reports.controller.ts create)
//   CreateWorkReportBodyDto (work-reports.dto.ts): reportType ∈ daily|incident|monthly, title 1..255,
//   content 1..10000, location ≤ 255, attachmentIds ≤ 10 unique UUIDs from POST /files/upload
//   (purpose work_report). The answer adds attachments [{id, url, name, mimeType, size}].
//   Linking refusals (files.service.ts attach): 400 file_not_found | duplicate_file_ids |
//   file_purpose_mismatch | file_type_not_allowed; 409 file_already_attached.
//   Global ValidationPipe (src/main.ts) → 400 validation_failed for any other field.
// Local checks carry an IncidentReportIssue; incidentReportErrorText words issues and refusals.
// Run: flutter test test/unit_incident_report_repository_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/incident/incident_report_texts.dart';
import 'package:militian_app/features/incident/repositories/incident_report_repository.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _l = viL10n;

(IncidentReportRepository, FakeAdapter) _repo(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (IncidentReportRepository(dio), adapter);
}

Matcher _issue(IncidentReportIssue issue) => throwsA(isA<IncidentReportException>()
    .having((e) => e.issue, 'issue', issue)
    .having((e) => e.failure, 'failure', isNull));

Future<IncidentReportException> _refusal(ResponseBody Function(RequestOptions) handler) async {
  final (repo, _) = _repo(handler);
  try {
    await repo.submit(title: 't', content: 'c', location: 'l');
  } on IncidentReportException catch (e) {
    return e;
  }
  throw StateError('the report was accepted');
}

void main() {
  test('UT-INC-01: posts reportType incident with title, content and location; no attachments, no field', () async {
    final (repo, adapter) = _repo((_) => jsonBody(201, {
          'id': 'r1',
          'reportType': 'incident',
          'title': 'Market patrol',
          'content': 'Small fire found',
          'location': '10.7, 106.6 (GPS)',
          'reviewStatus': 'pending',
          'createdAt': '2026-09-14T01:00:00.000Z',
          'attachments': [],
        }));

    final saved = await repo.submit(
      title: ' Market patrol ',
      content: ' Small fire found ',
      location: ' 10.7, 106.6 (GPS) ',
    );

    final req = adapter.requests.single;
    expect(req.method, 'POST');
    expect(req.path, '/work-reports');
    expect(req.data, {
      'reportType': 'incident',
      'title': 'Market patrol',
      'content': 'Small fire found',
      'location': '10.7, 106.6 (GPS)',
    });
    expect(IncidentReportRepository.reportType, 'incident');
    expect(saved['id'], 'r1');
  });

  test('UT-INC-08: uploaded photos are sent as attachmentIds, in order', () async {
    final (repo, adapter) = _repo((o) => jsonBody(201, {
          'id': 'r2',
          'attachments': [
            for (final id in (o.data as Map)['attachmentIds'] as List)
              {'id': id, 'url': '/api/v1/mms_core/files/$id', 'name': '$id.jpg', 'mimeType': 'image/jpeg', 'size': 10},
          ],
        }));

    final saved = await repo.submit(title: 't', content: 'c', location: 'l', attachmentIds: ['f2', 'f1']);

    expect((adapter.requests.single.data as Map)['attachmentIds'], ['f2', 'f1']);
    expect((saved['attachments'] as List).map((a) => (a as Map)['id']), ['f2', 'f1']);
  });

  test('UT-INC-02: required fields are checked before any request', () async {
    final (repo, adapter) = _repo((_) => jsonBody(201, {}));

    await expectLater(repo.submit(title: '  ', content: 'c', location: 'l'), _issue(IncidentReportIssue.titleRequired));
    await expectLater(repo.submit(title: 't', content: '  ', location: 'l'), _issue(IncidentReportIssue.contentRequired));
    await expectLater(repo.submit(title: 't', content: 'c', location: ' '), _issue(IncidentReportIssue.locationRequired));
    expect(adapter.requests, isEmpty);
  });

  test('UT-INC-03: backend length limits are checked before any request', () async {
    final (repo, adapter) = _repo((_) => jsonBody(201, {}));

    await expectLater(
        repo.submit(title: 't' * 256, content: 'c', location: 'l'), _issue(IncidentReportIssue.titleTooLong));
    await expectLater(
        repo.submit(title: 't', content: 'c' * 10001, location: 'l'), _issue(IncidentReportIssue.contentTooLong));
    await expectLater(
        repo.submit(title: 't', content: 'c', location: 'l' * 256), _issue(IncidentReportIssue.locationTooLong));
    expect(adapter.requests, isEmpty);

    await repo.submit(title: 't' * 255, content: 'c' * 10000, location: 'l' * 255);
    expect(adapter.requests, hasLength(1));
  });

  test('UT-INC-09: more than 10 or repeated attachments are refused before any request', () async {
    final (repo, adapter) = _repo((_) => jsonBody(201, {}));
    expect(IncidentReportRepository.maxAttachments, 10);

    await expectLater(
      repo.submit(title: 't', content: 'c', location: 'l', attachmentIds: [for (var i = 0; i < 11; i++) 'f$i']),
      _issue(IncidentReportIssue.tooManyAttachments),
    );
    await expectLater(
      repo.submit(title: 't', content: 'c', location: 'l', attachmentIds: ['f1', 'f2', 'f1']),
      _issue(IncidentReportIssue.duplicateAttachments),
    );
    expect(adapter.requests, isEmpty);
  });

  test('UT-INC-04: a 400 the error table does not know is worded as an invalid report', () async {
    final e = await _refusal((_) => jsonBody(400, {'code': 'E001', 'message': 'Bad Request Exception', 'statusCode': 400}));
    expect(e.failure?.status, 400);
    expect(e.statusCode, 400);
    expect(incidentReportErrorText(_l, e), _l.incidentReportInvalid);
  });

  test('UT-INC-07: 400 validation_failed shows the first class-validator message', () async {
    // http-exception.filter.ts: message 'validation_failed' + errors[]
    final e = await _refusal((_) => jsonBody(400, {
          'code': 'E001',
          'message': 'validation_failed',
          'errors': [
            'location must be shorter than or equal to 255 characters',
            'title should not be empty',
          ],
          'statusCode': 400,
        }));
    expect(incidentReportErrorText(_l, e),
        _l.incidentReportInvalidDetail('location must be shorter than or equal to 255 characters'));

    final bare = await _refusal((_) => jsonBody(400, {'message': 'validation_failed', 'statusCode': 400}));
    expect(incidentReportErrorText(_l, bare), _l.incidentReportInvalid);
  });

  test('UT-INC-05: a 5xx is worded as a report that was not sent', () async {
    final e = await _refusal((_) => jsonBody(500, {'code': 'E005', 'message': 'Internal server error', 'statusCode': 500}));
    expect(e.statusCode, 500);
    expect(incidentReportErrorText(_l, e), _l.incidentReportServerError);
  });

  test('UT-INC-06: a network failure is kept as its kind', () async {
    final e = await _refusal((o) => throw DioException(requestOptions: o, type: DioExceptionType.connectionError));
    expect(e.failure?.kind, FailureKind.connection);
    expect(e.issue, isNull);
    expect(e.statusCode, isNull);
    expect(incidentReportErrorText(_l, e), _l.errorNetworkConnection);
  });

  test('UT-INC-10: attachment refusals keep their code and are worded by the error table', () async {
    for (final (status, code, text) in [
      (400, 'file_not_found', _l.errorFileNotFound),
      (400, 'duplicate_file_ids', _l.errorFileDuplicateIds),
      (400, 'file_purpose_mismatch', _l.errorFilePurposeMismatch),
      (400, 'file_type_not_allowed', _l.errorFileTypeNotAllowed),
      (409, 'file_already_attached', _l.errorFileAlreadyAttached),
    ]) {
      final e = await _refusal((_) => jsonBody(status, backendError(status, code)));
      expect(e.failure?.code, code);
      expect(incidentReportErrorText(_l, e), text, reason: code);
    }
  });

  test('UT-INC-11: every local issue has its own text', () {
    final texts = {
      for (final issue in IncidentReportIssue.values)
        issue: incidentReportErrorText(_l, IncidentReportException(issue)),
    };
    expect(texts.values.toSet(), hasLength(IncidentReportIssue.values.length));
    expect(texts[IncidentReportIssue.titleTooLong], _l.incidentReportIssueTitleTooLong(255));
    expect(texts[IncidentReportIssue.contentTooLong], _l.incidentReportIssueContentTooLong(10000));
    expect(texts[IncidentReportIssue.tooManyAttachments], _l.incidentReportIssueTooManyAttachments(10));
    expect(incidentReportErrorText(_l, StateError('x')), _l.errorUnexpected);
    expect(const IncidentReportException(IncidentReportIssue.titleRequired).toString(), contains('titleRequired'));
    expect(IncidentReportException.api(const ApiFailure(status: 500)).toString(), contains('500'));
  });
}
