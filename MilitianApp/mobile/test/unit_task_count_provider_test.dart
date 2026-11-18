// Unit Tests: the waiting-task count on the bottom-nav badge (main_shell.dart) and the home card
//   GET /tasks → {data, total, page, limit} (Web/backend/src/tasks/tasks.service.ts listTasksPaginated): one row per
//   task of the caller. The count equals the "waiting" tab: pending/assigned tasks the server does not flag overdue.
// Run: flutter test test/unit_task_count_provider_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/tasks/repositories/tasks_repository.dart';

import 'helpers/fakes.dart';

(ProviderContainer, FakeAdapter) _container(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final container = ProviderContainer(overrides: [
    tasksRepositoryProvider.overrideWithValue(TasksRepository(dio)),
  ]);
  addTearDown(container.dispose);
  // Keep the auto-dispose provider alive while the test reads it
  final sub = container.listen(waitingTaskCountProvider, (previous, next) {});
  addTearDown(sub.close);
  return (container, adapter);
}

void main() {
  test('UT-TC-01: counts the not-started tasks the server does not flag overdue', () async {
    final (container, adapter) = _container((_) => jsonBody(
          200,
          backendPage([
            backendTaskRow('t1', 'pending', deadline: '2099-01-01T00:00:00.000Z'),
            backendTaskRow('t2', 'assigned'),
            backendTaskRow('t3', 'pending', deadline: '2020-01-01T00:00:00.000Z'),
            backendTaskRow('t4', 'in_progress'),
            backendTaskRow('t5', 'pending', deadline: '2099-01-01T00:00:00.000Z', overdue: true),
          ], total: 5),
        ));

    expect(await container.read(waitingTaskCountProvider.future), 2);
    expect(adapter.requests.single.path, '/tasks');
    expect(adapter.requests.single.queryParameters, {'page': 1, 'limit': 100});
  });

  test('UT-TC-02: a failed load shows no badge instead of an error', () async {
    final (container, _) = _container((_) => jsonBody(500, backendError(500, 'Internal server error')));

    expect(await container.read(waitingTaskCountProvider.future), 0);
  });
}
