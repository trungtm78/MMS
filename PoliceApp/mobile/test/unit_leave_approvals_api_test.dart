// Unit Tests: LeaveApprovalsApi against Web/backend LeaveController
//   GET   /leave?status=&page=&limit=  → {data, total, page, limit}          (leave.service.ts)
//         rows carry the latest decision: reviewedBy {id, fullName} | null, reviewedAt, reviewNote (T20)
//   PATCH /leave/:id/review {action: approve|reject, reason?} → 204           (leave.controller.ts)
//   errors: 404 leave_request_not_found, 403 cannot_review_own_request,
//     409 leave_request_not_pending, 409 insufficient_leave_balance, 403 insufficient_role_to_review
// Run: flutter test test/unit_leave_approvals_api_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/approvals/providers/leave_approvals_provider.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';

(LeaveApprovalsApi, FakeAdapter) _api(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (LeaveApprovalsApi(dio), adapter);
}

ResponseBody _noContent(RequestOptions _) => ResponseBody.fromString('', 204);

ResponseBody _error(int status, String code) =>
    jsonBody(status, {'code': 'E002', 'message': code, 'statusCode': status});

Matcher _failure(String code, {int? status, Map<String, Object> args = const {}}) =>
    throwsA(isA<AppFailure>()
        .having((f) => f.code, 'code', code)
        .having((f) => f.status, 'status', status)
        .having((f) => f.args, 'args', args));

Map<String, Object?> _row(String id, {String status = 'pending', Object? reviewedBy, String? reviewedAt, String? reviewNote}) => {
      'id': id,
      'code': 'LEAVE-$id',
      'requesterName': 'Tran Van B',
      'leaveTypeName': 'Annual leave',
      'fromDate': '2026-09-15',
      'toDate': '2026-09-15',
      'reason': 'Sick',
      'status': status,
      'totalDays': 1,
      'reviewedBy': reviewedBy,
      'reviewedAt': reviewedAt,
      'reviewNote': reviewNote,
    };

void main() {
  group('LeaveApprovalsApi.review', () {
    test('UT-LEAVE-01: approve sends PATCH /leave/:id/review {action: approve}', () async {
      final (api, adapter) = _api(_noContent);

      await api.review('l1', approve: true);

      final req = adapter.requests.single;
      expect(req.method, 'PATCH');
      expect(req.path, '/leave/l1/review');
      expect(req.data, {'action': 'approve'});
    });

    test('UT-LEAVE-02: reject sends {action: reject, reason}', () async {
      final (api, adapter) = _api(_noContent);

      await api.review('l1', approve: false, reason: ' No replacement on duty ');

      expect(adapter.requests.single.data, {'action': 'reject', 'reason': 'No replacement on duty'});
    });

    test('UT-LEAVE-03: 409 leave_request_not_pending', () async {
      final (api, _) = _api((_) => _error(409, 'leave_request_not_pending'));
      await expectLater(api.review('l1', approve: true), _failure('leave_request_not_pending', status: 409));
    });

    test('UT-LEAVE-04: 409 insufficient_leave_balance', () async {
      final (api, _) = _api((_) => _error(409, 'insufficient_leave_balance'));
      await expectLater(api.review('l1', approve: true), _failure('insufficient_leave_balance', status: 409));
    });

    test('UT-LEAVE-05: 403 cannot_review_own_request', () async {
      final (api, _) = _api((_) => _error(403, 'cannot_review_own_request'));
      await expectLater(
          api.review('l1', approve: false, reason: 'x'), _failure('cannot_review_own_request', status: 403));
    });

    test('UT-LEAVE-06: 404 leave_request_not_found', () async {
      final (api, _) = _api((_) => _error(404, 'leave_request_not_found'));
      await expectLater(api.review('l1', approve: true), _failure('leave_request_not_found', status: 404));
    });

    test('UT-LEAVE-07: 403 insufficient_role_to_review', () async {
      final (api, _) = _api((_) => _error(403, 'insufficient_role_to_review'));
      await expectLater(api.review('l1', approve: true), _failure('insufficient_role_to_review', status: 403));
    });

    test('UT-LEAVE-08: a reason over 1000 characters is refused before any request', () async {
      final (api, adapter) = _api(_noContent);
      await expectLater(
        api.review('l1', approve: false, reason: 'x' * 1001),
        _failure(AppFailure.leaveReasonTooLong, args: {'max': 1000}),
      );
      expect(adapter.requests, isEmpty);
    });
  });

  group('LeaveApprovalsApi.list', () {
    test('UT-LEAVE-09: parses the envelope with requesterName and leaveTypeName', () async {
      final (api, adapter) = _api((_) => jsonBody(200, {
            'data': [
              {
                'id': 'l1',
                'code': 'LEAVE-20260914-ABC123',
                'requesterId': 'u2',
                'requesterName': 'Nguyen Van A',
                'leaveTypeId': 'lt1',
                'leaveTypeName': 'Annual leave',
                'fromDate': '2026-09-20',
                'toDate': '2026-09-21',
                'isHalfDay': false,
                'halfDayPeriod': null,
                'reason': 'Family matters',
                'replacementId': null,
                'status': 'pending',
                'totalDays': '2.0',
                'createdAt': '2026-09-14T01:00:00.000Z',
                'updatedAt': '2026-09-14T01:00:00.000Z',
                'reviewedBy': null,
                'reviewedAt': null,
                'reviewNote': null,
              },
              {..._row('l2'), 'totalDays': 0.5},
            ],
            'total': 2,
            'page': 1,
            'limit': 100,
          }));

      final page = await api.list(status: 'pending');

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/leave');
      expect(req.queryParameters, {'status': 'pending', 'page': 1, 'limit': 100});
      expect(page.total, 2);
      final first = page.items.first;
      expect(first.requesterName, 'Nguyen Van A');
      expect(first.leaveTypeName, 'Annual leave');
      expect(first.code, 'LEAVE-20260914-ABC123');
      expect(first.totalDays, 2.0);
      expect(first.fromDate, DateTime(2026, 9, 20));
      expect(first.createdAt, DateTime.utc(2026, 9, 14, 1));
      expect(first.isPending, isTrue);
      expect(first.reviewedBy, isNull);
      expect(page.items.last.totalDays, 0.5);
    });

    // DATE columns arrive as 'YYYY-MM-DD' (Web/backend/src/database/pg-types.ts); a day is a day
    test('UT-LEAVE-10: dates are calendar days, never shifted by the device timezone', () async {
      final (api, _) = _api((_) => jsonBody(200, {
            'data': [
              {..._row('l3'), 'fromDate': '2026-09-20', 'toDate': '2026-09-20T17:00:00.000Z'},
            ],
            'total': 1,
            'page': 1,
            'limit': 100,
          }));

      final item = (await api.list(status: 'pending')).items.single;

      expect(item.fromDate, DateTime(2026, 9, 20));
      expect(item.toDate, DateTime(2026, 9, 20));
    });

    test('UT-LEAVE-11: decided rows carry the reviewer, the time and the reason given', () async {
      final (api, _) = _api((_) => jsonBody(200, {
            'data': [
              _row('l4',
                  status: 'rejected',
                  reviewedBy: {'id': 'u-ca', 'fullName': 'Le Van C'},
                  reviewedAt: '2026-09-15T03:30:00.000Z',
                  reviewNote: 'No replacement on duty'),
              _row('l5', status: 'approved', reviewedBy: 'u-ca', reviewNote: '  '),
            ],
            'total': 2,
            'page': 1,
            'limit': 100,
          }));

      final page = await api.list(status: 'rejected');

      final rejected = page.items.first;
      expect(rejected.reviewedBy?.id, 'u-ca');
      expect(rejected.reviewedBy?.fullName, 'Le Van C');
      expect(rejected.reviewedAt, DateTime.utc(2026, 9, 15, 3, 30));
      expect(rejected.reviewNote, 'No replacement on duty');
      // A reviewer that is not {id, fullName}, and a blank note, read as absent
      expect(page.items.last.reviewedBy, isNull);
      expect(page.items.last.reviewedAt, isNull);
      expect(page.items.last.reviewNote, isNull);
    });

    test('UT-LEAVE-12: a malformed body, or a row without an id, is a bad response; page fields fall back',
        () async {
      final (broken, _) = _api((_) => jsonBody(200, {'items': []}));
      await expectLater(broken.list(status: 'pending'), _failure(AppFailure.badResponse));

      final (noId, _) = _api((_) => jsonBody(200, {
            'data': [{'code': 'LEAVE-X'}],
          }));
      await expectLater(noId.list(status: 'pending'), _failure(AppFailure.badResponse));

      final (bare, _) = _api((_) => jsonBody(200, {
            'data': [{'id': 'l6', 'totalDays': 'n/a'}],
            'total': 'many',
          }));
      final page = await bare.list(status: 'pending');
      expect(page.total, 1);
      expect(page.page, 1);
      expect(page.limit, 1);
      expect(page.items.single.totalDays, 0);
      expect(page.items.single.status, 'pending');

      final (offline, _) = _api((o) => throw DioException.connectionError(requestOptions: o, reason: 'offline'));
      await expectLater(offline.list(status: 'pending'), _failure(AppFailure.network));
    });

    // total_days is NUMERIC: node-postgres sent it as text; the backend is moving to JSON numbers
    test('UT-LEAVE-14: totalDays reads the same from a JSON number or a numeric string', () async {
      final (api, _) = _api((_) => jsonBody(200, {
            'data': [
              {..._row('n1'), 'totalDays': 2},
              {..._row('n2'), 'totalDays': '2'},
              {..._row('n3'), 'totalDays': 1.5},
              {..._row('n4'), 'totalDays': '1.5'},
            ],
            'total': 4,
            'page': 1,
            'limit': 100,
          }));

      final days = (await api.list(status: 'pending')).items.map((r) => r.totalDays);

      expect(days, [2.0, 2.0, 1.5, 1.5]);
    });

    // COUNT(*) is BIGINT and stays text; page and limit arrive as numbers
    test('UT-LEAVE-15: total, page and limit read the same from a string or a number', () async {
      for (final shape in [
        {'total': '12', 'page': '2', 'limit': '5'},
        {'total': 12, 'page': 2, 'limit': 5},
      ]) {
        final (api, _) = _api((_) => jsonBody(200, {'data': [_row('l1')], ...shape}));
        final page = await api.list(status: 'pending');
        expect([page.total, page.page, page.limit], [12, 2, 5], reason: '$shape');
      }
    });

    test('UT-LEAVE-13: the provider uses the app Dio', () {
      final container = ProviderContainer(overrides: [dioProvider.overrideWithValue(Dio())]);
      addTearDown(container.dispose);
      expect(container.read(leaveApprovalsApiProvider), isA<LeaveApprovalsApi>());
    });
  });
}
