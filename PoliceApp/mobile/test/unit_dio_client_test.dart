// Unit Tests: the app's single Dio and the session renewal shared with the chat socket
// Run: flutter test test/unit_dio_client_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/core/network/auth_interceptor.dart';
import 'package:police_app/core/network/dio_client.dart';
import 'package:police_app/core/network/session_events.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';

import 'helpers/fakes.dart';

void main() {
  tearDown(DioClient.reset);

  test('UT-DIO-01: one shared Dio carrying the auth interceptor, until reset', () {
    DioClient.reset();
    final storage = MemoryStorage();

    final first = DioClient.getInstance(storage, sessionEvents: SessionEvents());

    expect(identical(DioClient.getInstance(storage), first), isTrue);
    expect(first.interceptors.whereType<AuthInterceptor>(), hasLength(1));
    DioClient.reset();
    expect(identical(DioClient.getInstance(storage), first), isFalse);
  });

  test('UT-DIO-02: the chat socket renews through the same refresher as HTTP requests', () async {
    DioClient.reset();
    final container = ProviderContainer(overrides: [
      secureStorageProvider.overrideWithValue(MemoryStorage(access: 'stored_access', refresh: 'stored_refresh')),
    ]);
    addTearDown(container.dispose);

    final renew = container.read(renewSessionProvider);

    // A newer token is already stored: handed back without calling the server
    expect(await renew(staleAccessToken: 'socket_token'), 'stored_access');
  });

  test('UT-DIO-03: without the auth interceptor nothing can be renewed', () async {
    final container = ProviderContainer(overrides: [
      secureStorageProvider.overrideWithValue(MemoryStorage()),
      dioProvider.overrideWithValue(Dio()),
    ]);
    addTearDown(container.dispose);

    expect(await container.read(renewSessionProvider)(staleAccessToken: 'socket_token'), isNull);
  });
}
