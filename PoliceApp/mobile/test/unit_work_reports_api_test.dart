// Unit Tests: WorkReportsApi against Web/backend WorkReportsController
//   GET   /work-reports?type=&reviewStatus=&from=&to=&page=&limit= → {data, total, page, limit}
//   GET   /work-reports/:id → one report with its attachments; 404 work_report_not_found (T20)
//   POST  /work-reports {reportType, title, content, period?, location?, attachmentIds?}   (work-reports.dto.ts)
//         attachmentIds: ≤ 10 uploads with purpose=work_report; link errors 400 file_not_found,
//         duplicate_file_ids, file_purpose_mismatch, file_type_not_allowed; 409 file_already_attached
//         (files.service.ts attach). Rows carry attachments: [{id, url, name, mimeType, size}]
//   PATCH /work-reports/:id/review {reviewStatus: approved|rejected, reviewNote?}
//   errors: 404 work_report_not_found, 403 cannot_review_own_report, 409 work_report_already_reviewed
// Run: flutter test test/unit_work_reports_api_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/reports/models/work_report.dart';
import 'package:police_app/features/reports/providers/work_reports_provider.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';

(WorkReportsApi, FakeAdapter) _api(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (WorkReportsApi(dio), adapter);
}

ResponseBody _error(int status, String code) =>
    jsonBody(status, {'code': 'E002', 'message': code, 'statusCode': status});

Matcher _failure(String code, {int? status, Map<String, Object> args = const {}}) =>
    throwsA(isA<AppFailure>()
        .having((f) => f.code, 'code', code)
        .having((f) => f.status, 'status', status)
        .having((f) => f.args, 'args', args));

Map<String, Object?> _file(String id, {String mimeType = 'image/jpeg'}) => {
      'id': id,
      'url': '/api/v1/mms_core/files/$id',
      'name': '$id.jpg',
      'mimeType': mimeType,
      'size': 1024,
    };

Map<String, dynamic> _row({
  String id = 'r1',
  String status = 'pending',
  String createdAt = '2026-09-14T01:00:00.000Z',
  String? location = 'Phu Dinh market',
  List<Object?>? attachments,
}) =>
    {
      'id': id,
      'reportType': 'incident',
      'title': 'Incident - 2026-09-14',
      'content': 'A small fire was found',
      'location': location,
      'period': null,
      'reviewStatus': status,
      'reviewNote': null,
      'createdBy': 'u-dqtv',
      'authorName': 'Nguyen Van A',
      'createdAt': createdAt,
      'reviewedAt': null,
      'reviewedBy': null,
      if (attachments != null) 'attachments': attachments,
    };

void main() {
  group('WorkReportsApi.review', () {
    test('UT-WR-01: approve sends PATCH /work-reports/:id/review {reviewStatus: approved}', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {'id': 'r1', 'reviewStatus': 'approved'}));

      await api.review('r1', approve: true);

      final req = adapter.requests.single;
      expect(req.method, 'PATCH');
      expect(req.path, '/work-reports/r1/review');
      expect(req.data, {'reviewStatus': 'approved'});
    });

    test('UT-WR-02: reject sends reviewStatus rejected with a trimmed reviewNote', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {'id': 'r1', 'reviewStatus': 'rejected'}));

      await api.review('r1', approve: false, note: '  Missing photos  ');

      expect(adapter.requests.single.data, {'reviewStatus': 'rejected', 'reviewNote': 'Missing photos'});
    });

    test('UT-WR-03: 409 work_report_already_reviewed', () async {
      final (api, _) = _api((_) => _error(409, 'work_report_already_reviewed'));
      await expectLater(api.review('r1', approve: true), _failure('work_report_already_reviewed', status: 409));
    });

    test('UT-WR-04: 403 cannot_review_own_report', () async {
      final (api, _) = _api((_) => _error(403, 'cannot_review_own_report'));
      await expectLater(api.review('r1', approve: true), _failure('cannot_review_own_report', status: 403));
    });

    test('UT-WR-05: 404 work_report_not_found', () async {
      final (api, _) = _api((_) => _error(404, 'work_report_not_found'));
      await expectLater(api.review('r1', approve: false), _failure('work_report_not_found', status: 404));
    });

    test('UT-WR-06: a note over 1000 characters is refused before any request', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {}));
      await expectLater(
        api.review('r1', approve: false, note: 'x' * 1001),
        _failure(AppFailure.reviewNoteTooLong, args: {'max': 1000}),
      );
      expect(adapter.requests, isEmpty);
    });
  });

  group('WorkReportsApi.list / create', () {
    test('UT-WR-07: list sends the server filters and parses location, status, author and attachments',
        () async {
      final (api, adapter) = _api((_) => jsonBody(200, {
            'data': [
              _row(attachments: [_file('f1'), _file('f2', mimeType: 'application/pdf'), 'junk']),
              _row(id: 'r2', status: 'approved', location: null),
            ],
            'total': 2,
            'page': 1,
            'limit': 100,
          }));

      final page = await api.list(
        limit: 100,
        reviewStatus: 'pending',
        from: '2026-09-14',
        to: '2026-09-16',
      );

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/work-reports');
      expect(req.queryParameters, {
        'page': 1,
        'limit': 100,
        'reviewStatus': 'pending',
        'from': '2026-09-14',
        'to': '2026-09-16',
      });
      expect(page.total, 2);
      final first = page.items.first;
      expect(first.authorName, 'Nguyen Van A');
      expect(first.location, 'Phu Dinh market');
      expect(first.isPending, isTrue);
      expect(first.reportType, 'incident');
      expect(first.attachments.map((f) => f.id), ['f1', 'f2']);
      expect(first.attachments.first.isImage, isTrue);
      expect(first.imageAttachments.map((f) => f.id), ['f1']);
      expect(page.items.last.location, isNull);
      expect(page.items.last.reviewStatus, 'approved');
      expect(page.items.last.attachments, isEmpty);
    });

    test('UT-WR-08: create sends location and trimmed fields; blank location and no attachments are omitted',
        () async {
      final (api, adapter) = _api((_) => jsonBody(201, _row()));

      await api.create(
        reportType: 'incident',
        title: ' Incident ',
        content: ' Content ',
        location: ' Phu Dinh market ',
      );
      await api.create(reportType: 'daily', title: 'Daily', content: 'Quiet', location: '   ');

      expect(adapter.requests.first.method, 'POST');
      expect(adapter.requests.first.path, '/work-reports');
      expect(adapter.requests.first.data, {
        'reportType': 'incident',
        'title': 'Incident',
        'content': 'Content',
        'location': 'Phu Dinh market',
      });
      expect(adapter.requests.last.data, {
        'reportType': 'daily',
        'title': 'Daily',
        'content': 'Quiet',
      });
    });

    test('UT-WR-09: create refuses a report type the backend does not accept', () async {
      final (api, adapter) = _api((_) => jsonBody(201, {}));
      await expectLater(
        api.create(reportType: 'work', title: 't', content: 'c'),
        _failure(AppFailure.reportTypeInvalid),
      );
      expect(adapter.requests, isEmpty);
    });

    test('UT-WR-13: create sends attachmentIds in order and parses the attached files', () async {
      final (api, adapter) = _api((_) => jsonBody(201, _row(attachments: [_file('f2'), _file('f1')])));

      final report = await api.create(
        reportType: 'incident',
        title: 'Incident',
        content: 'Content',
        attachmentIds: ['f2', 'f1'],
      );

      expect((adapter.requests.single.data as Map)['attachmentIds'], ['f2', 'f1']);
      expect(report.attachments.map((f) => f.id), ['f2', 'f1']);
    });

    test('UT-WR-14: more than 10 attachments are refused before any request', () async {
      final (api, adapter) = _api((_) => jsonBody(201, _row()));
      await expectLater(
        api.create(
          reportType: 'daily',
          title: 'Daily',
          content: 'Quiet',
          attachmentIds: [for (var i = 0; i < 11; i++) 'f$i'],
        ),
        _failure(AppFailure.attachmentsTooMany, args: {'max': 10}),
      );
      expect(adapter.requests, isEmpty);
      expect(WorkReportsApi.maxAttachments, 10);
    });

    test('UT-WR-15: attachment link refusals keep their code and status', () async {
      const refusals = [
        (400, 'file_not_found'),
        (400, 'duplicate_file_ids'),
        (400, 'file_purpose_mismatch'),
        (400, 'file_type_not_allowed'),
        (409, 'file_already_attached'),
      ];
      for (final (status, code) in refusals) {
        final (api, _) = _api((_) => _error(status, code));
        await expectLater(
          api.create(reportType: 'daily', title: 'Daily', content: 'Quiet', attachmentIds: ['f1']),
          _failure(code, status: status),
          reason: code,
        );
      }
    });

    test('UT-WR-17: create checks title, content and location limits before any request', () async {
      final (api, adapter) = _api((_) => jsonBody(201, _row()));
      await expectLater(api.create(reportType: 'daily', title: ' ', content: 'c'),
          _failure(AppFailure.reportTitleRequired));
      await expectLater(api.create(reportType: 'daily', title: 't' * 256, content: 'c'),
          _failure(AppFailure.reportTitleTooLong, args: {'max': 255}));
      await expectLater(api.create(reportType: 'daily', title: 't', content: '  '),
          _failure(AppFailure.reportContentRequired));
      await expectLater(api.create(reportType: 'daily', title: 't', content: 'c' * 10001),
          _failure(AppFailure.reportContentTooLong, args: {'max': 10000}));
      await expectLater(api.create(reportType: 'daily', title: 't', content: 'c', location: 'l' * 256),
          _failure(AppFailure.reportLocationTooLong, args: {'max': 255}));
      expect(adapter.requests, isEmpty);
    });

    test('UT-WR-18: a 201 without a body still counts as sent; a malformed list is a bad response', () async {
      final (created, _) = _api((_) => ResponseBody.fromString('', 201));
      final report = await created.create(reportType: 'daily', title: 'Daily', content: 'Quiet');
      expect(report.reportType, 'daily');
      expect(report.isPending, isTrue);
      expect(report.attachments, isEmpty);

      final (broken, _) = _api((_) => jsonBody(200, {'items': []}));
      await expectLater(broken.list(), _failure(AppFailure.badResponse));
      final (noId, _) = _api((_) => jsonBody(200, {'data': [{'title': 'x'}], 'total': 1}));
      await expectLater(noId.list(), _failure(AppFailure.badResponse));
    });
  });

  group('WorkReportsApi.findOne', () {
    test('UT-WR-16: GET /work-reports/:id parses the report with its attachments; 404 keeps its code', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {
            ..._row(id: 'r9', status: 'rejected', attachments: [_file('f1')]),
            'reviewNote': 'Blurry photo',
            'reviewedAt': '2026-09-15T02:00:00.000Z',
          }));

      final report = await api.findOne('r9');

      expect(adapter.requests.single.method, 'GET');
      expect(adapter.requests.single.path, '/work-reports/r9');
      expect(report.id, 'r9');
      expect(report.reviewNote, 'Blurry photo');
      expect(report.reviewedAt, DateTime.utc(2026, 9, 15, 2));
      expect(report.attachments.single.url, '/api/v1/mms_core/files/f1');

      final (missing, _) = _api((_) => _error(404, 'work_report_not_found'));
      await expectLater(missing.findOne('r9'), _failure('work_report_not_found', status: 404));
      final (notAMap, _) = _api((_) => jsonBody(200, ['r9']));
      await expectLater(notAMap.findOne('r9'), _failure(AppFailure.badResponse));
    });
  });

  group('server-side period filter', () {
    test('UT-WR-10: week = Monday..today, month = 1st..today, as Vietnamese calendar days', () {
      // 2026-09-15 20:00 UTC is Wednesday 16/09 03:00 in Vietnam (UTC+7)
      final now = DateTime.utc(2026, 9, 15, 20);
      expect(reportPeriodRange('week', now), (from: '2026-09-14', to: '2026-09-16'));
      expect(reportPeriodRange('month', now), (from: '2026-09-01', to: '2026-09-16'));
      // A Monday is its own week start
      expect(reportPeriodRange('week', DateTime.utc(2026, 9, 14, 3)), (from: '2026-09-14', to: '2026-09-14'));
      expect(() => reportPeriodRange('year', now), throwsArgumentError);
    });

    test('UT-WR-11: unknown type or reviewStatus, or malformed dates, are refused before any request', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {'data': [], 'total': 0, 'page': 1, 'limit': 20}));
      await expectLater(api.list(type: 'weekly'), _failure(AppFailure.reportTypeInvalid));
      await expectLater(api.list(reviewStatus: 'reviewed'), _failure(AppFailure.reviewStatusInvalid));
      await expectLater(api.list(from: '16/09/2026'), _failure(AppFailure.dateFilterInvalid));
      await expectLater(api.list(to: '2026-02-30'), _failure(AppFailure.dateFilterInvalid));
      expect(adapter.requests, isEmpty);
    });

    // COUNT(*) is BIGINT: the total may arrive as text or as a number
    test('UT-WR-19: total, page and limit read the same from a string or a number', () async {
      for (final shape in [
        {'total': '12', 'page': '2', 'limit': '5'},
        {'total': 12, 'page': 2, 'limit': 5},
      ]) {
        final (api, _) = _api((_) => jsonBody(200, {'data': [_row()], ...shape}));
        final page = await api.list();
        expect([page.total, page.page, page.limit], [12, 2, 5], reason: '$shape');
      }
    });

    test('UT-WR-12: a row without authorName still parses; the provider uses the app Dio', () {
      final r = WorkReport.fromJson({..._row(), 'authorName': null});
      expect(r.authorName, isNull);

      final dio = Dio();
      final container = ProviderContainer(overrides: [dioProvider.overrideWithValue(dio)]);
      addTearDown(container.dispose);
      expect(container.read(workReportsApiProvider), isA<WorkReportsApi>());
    });
  });
}
