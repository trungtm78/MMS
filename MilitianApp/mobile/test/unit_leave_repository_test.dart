// Unit Tests: LeaveRepository against Web/backend/src/leave
//   GET   /leave?mine=true&page=&limit= → {data, total, page, limit}; limit ≤ 100
//         (leave.controller.ts:41-56, leave.service.ts:135-201)
//   GET   /leave-balances → bare array (leave.controller.ts:96-101)
//   PATCH /leave/:id/cancel → 204; 404 leave_request_not_found, 403 not_your_leave_request,
//         409 leave_request_not_pending (leave.controller.ts:137-146, leave.service.ts:424-446)
// Run: flutter test test/unit_leave_repository_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/core/constants/api_constants.dart';
import 'package:militian_app/features/leave/repositories/leave_repository.dart';

import 'helpers/fakes.dart';

const _id = '1f6c2b7e-0d7a-4c55-9a3e-2b8f3d9e4a10';

(LeaveRepository, FakeAdapter) _repo(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (LeaveRepository(dio), adapter);
}

void main() {
  group('cancel', () {
    test('UT-LEAVE-01: PATCH /leave/:id/cancel answered 204', () async {
      final (repo, adapter) = _repo(noContent);

      await repo.cancel(_id);

      expect(ApiConstants.cancelLeave, '/leave/{id}/cancel');
      expect(adapter.requests.single.method, 'PATCH');
      expect(adapter.requests.single.path, '/leave/$_id/cancel');
      expect(adapter.requests.single.data, isNull);
    });

    test('UT-LEAVE-02: refusals keep their code; 404 and 409 mean the shown request is stale', () async {
      const cases = [
        (404, 'leave_request_not_found', true),
        (403, 'not_your_leave_request', false),
        (409, 'leave_request_not_pending', true),
      ];
      for (final (status, code, stale) in cases) {
        final (repo, _) = _repo((_) => jsonBody(status, backendError(status, code)));
        await expectLater(
          repo.cancel(_id),
          throwsA(isA<LeaveException>()
              .having((e) => e.failure?.code, 'failure code', code)
              .having((e) => e.message, 'message', isNull)
              .having((e) => e.statusCode, 'statusCode', status)
              .having((e) => e.code, 'code', code)
              .having((e) => e.requestChanged, 'requestChanged', stale)),
          reason: code,
        );
      }
    });

    test('UT-LEAVE-03: a network failure is not a stale request', () async {
      final (repo, _) = _repo((_) => throw StateError('offline'));
      await expectLater(
        repo.cancel(_id),
        throwsA(isA<LeaveException>()
            .having((e) => e.statusCode, 'statusCode', isNull)
            .having((e) => e.requestChanged, 'requestChanged', isFalse)),
      );
    });
  });

  group('myRequests', () {
    test('UT-LEAVE-04: asks for the caller\'s own requests, page by page', () async {
      final page1 = [for (var i = 0; i < 100; i++) backendLeaveRow('p$i', 'pending')];
      final page2 = [backendLeaveRow('q1', 'approved')];
      final (repo, adapter) = _repo((o) => jsonBody(
            200,
            o.queryParameters['page'] == 1
                ? backendPage(page1, total: 101)
                : backendPage(page2, total: 101, page: 2),
          ));

      final rows = await repo.myRequests();

      expect(adapter.requests.map((r) => '${r.method} ${r.path}').toSet(), {'GET /leave'});
      expect(adapter.requests.map((r) => r.queryParameters), [
        {'mine': 'true', 'page': 1, 'limit': 100},
        {'mine': 'true', 'page': 2, 'limit': 100},
      ]);
      expect(rows, hasLength(101));
      expect(rows.last['status'], 'approved');
    });

    test('UT-LEAVE-05: a body without data[] is an error, not an empty list', () async {
      final (repo, _) = _repo((_) => jsonBody(200, [backendLeaveRow('p1', 'pending')]));
      await expectLater(repo.myRequests(), throwsA(isA<LeaveException>()));
    });
  });

  test('UT-LEAVE-06: balances read GET /leave-balances', () async {
    final (repo, adapter) = _repo((_) => jsonBody(200, []));

    expect(await repo.balances(2026), isEmpty);
    expect(adapter.requests.single.method, 'GET');
    expect(adapter.requests.single.path, '/leave-balances');
  });
}
