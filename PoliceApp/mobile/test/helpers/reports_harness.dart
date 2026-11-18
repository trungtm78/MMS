// Scaffolding for widget tests of screens that talk to the backend through Dio: approvals,
// work reports, attendance and the files layer.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/shared/files/files.dart';

import 'fake_photo_picker.dart';
import 'fakes.dart';
import 'l10n.dart';

/// A Dio that answers through [adapter]
Dio fakeDio(FakeAdapter adapter) => Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;

/// [home] with the app's localizations, [dio] as the app's Dio and [picker] as the photo picker
Widget scopedApp(Dio dio, Widget home, {PhotoPicker? picker}) => ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(MemoryStorage(access: null, refresh: null)),
        dioProvider.overrideWithValue(dio),
        photoPickerProvider.overrideWithValue(picker ?? FakePhotoPicker()),
      ],
      child: localizedApp(home),
    );

/// A backend refusal: the error code travels in `message`
ResponseBody errorBody(int status, String code) =>
    jsonBody(status, {'code': 'E002', 'message': code, 'statusCode': status});

/// GET /files/:id of a small PNG
ResponseBody pngBody([RequestOptions? _]) => ResponseBody.fromBytes(transparentPng, 200, headers: {
      Headers.contentTypeHeader: ['image/png'],
    });

/// A stored file as the backend returns it
Map<String, Object?> fileView(String id, {String? name, String mimeType = 'image/jpeg'}) => {
      'id': id,
      'url': '/api/v1/mms_core/files/$id',
      'name': name ?? '$id.jpg',
      'mimeType': mimeType,
      'size': transparentPng.length,
    };

/// POST /files/upload answered with id 'id-<file name>'
ResponseBody storedFileBody(RequestOptions o) {
  final name = (o.data as FormData).files.single.value.filename!;
  return jsonBody(201, fileView('id-$name', name: name));
}

/// Pumps frames until [condition] holds, e.g. until a request reached its gate while a spinner
/// keeps pumpAndSettle from settling. Each pump advances fake time by zero: it runs the timers
/// already due (Dio's request chain), without waiting for anything.
Future<void> pumpUntil(WidgetTester tester, bool Function() condition, {int maxPumps = 100}) async {
  for (var i = 0; i < maxPumps && !condition(); i++) {
    await tester.pump(Duration.zero);
  }
  expect(condition(), isTrue, reason: 'the awaited state was never reached');
}

/// A screen tall enough that nothing needs scrolling into view
void useTallSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

/// Removes the snackbars shown so far, so the next one is visible at once
Future<void> dismissSnackBars(WidgetTester tester) async {
  tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).clearSnackBars();
  await tester.pumpAndSettle();
}
