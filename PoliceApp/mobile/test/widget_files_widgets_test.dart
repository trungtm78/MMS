// Widget Tests: AuthenticatedImage, AttachmentThumbnails and AttachmentPickerField (lib/shared/files)
//   GET /files/:id needs the Bearer token, so images are fetched through the app's Dio (T20)
// Run: flutter test test/widget_files_widgets_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/shared/errors/app_failure.dart';
import 'package:police_app/shared/files/files.dart';

import 'helpers/fake_photo_picker.dart';
import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

(Dio, FakeAdapter) _dio(
  ResponseBody Function(RequestOptions) handler, {
  Future<void> Function(RequestOptions)? gate,
}) {
  final adapter = FakeAdapter(handler, gate: gate);
  return (Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter, adapter);
}

Future<void> _pump(WidgetTester tester, Dio dio, Widget child, {PhotoPicker? picker}) =>
    tester.pumpWidget(ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(MemoryStorage(access: null, refresh: null)),
        dioProvider.overrideWithValue(dio),
        photoPickerProvider.overrideWithValue(picker ?? FakePhotoPicker()),
      ],
      child: localizedApp(Scaffold(body: child)),
    ));

ResponseBody _png(RequestOptions _) => ResponseBody.fromBytes(transparentPng, 200, headers: {
      Headers.contentTypeHeader: ['image/png'],
    });

ResponseBody _stored(RequestOptions o) {
  final name = (o.data as FormData).files.single.value.filename!;
  return jsonBody(201, {
    'id': 'id-$name',
    'url': '/api/v1/mms_core/files/id-$name',
    'name': name,
    'mimeType': 'image/jpeg',
    'size': transparentPng.length,
  });
}

bool _enabled(WidgetTester tester, String label) => tester
    .widget<ButtonStyleButton>(
        find.ancestor(of: find.text(label), matching: find.byWidgetPredicate((w) => w is ButtonStyleButton)))
    .enabled;

void main() {
  group('AuthenticatedImage', () {
    testWidgets('WT-FILES-01: shows progress while GET /files/:id loads, then the image from its bytes',
        (tester) async {
      final release = Completer<void>();
      final (dio, adapter) = _dio(_png, gate: (_) => release.future);

      await _pump(tester, dio, const AuthenticatedImage(fileId: 'f1', width: 80, height: 80));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      release.complete();
      await tester.pumpAndSettle();

      expect(adapter.requests.single.path, '/files/f1');
      expect(find.byType(CircularProgressIndicator), findsNothing);
      final image = tester.widget<Image>(find.byType(Image));
      expect((image.image as MemoryImage).bytes, transparentPng);
    });

    testWidgets('WT-FILES-02: a refused download says why, and tapping it downloads again', (tester) async {
      var calls = 0;
      final (dio, adapter) = _dio((o) => ++calls == 1
          ? jsonBody(404, {'message': 'file_not_found', 'statusCode': 404})
          : _png(o));

      await _pump(tester, dio, const AuthenticatedImage(fileId: 'f1', width: 80, height: 80));
      await tester.pumpAndSettle();

      expect(find.byTooltip(viL10n.filesErrorFileNotFound), findsOneWidget);
      expect(find.byType(Image), findsNothing);

      await tester.tap(find.byTooltip(viL10n.filesErrorFileNotFound));
      await tester.pumpAndSettle();

      expect(adapter.requests, hasLength(2));
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('WT-FILES-03: content that cannot be decoded shows the unreadable placeholder', (tester) async {
      final (dio, _) = _dio(_png);
      await _pump(tester, dio, const AuthenticatedImage(fileId: 'f1', width: 80, height: 80));
      await tester.pumpAndSettle();

      final image = tester.widget<Image>(find.byType(Image));
      await tester.pumpWidget(localizedApp(Scaffold(
        body: Builder(builder: (context) => image.errorBuilder!(context, Exception('decode'), null)),
      )));

      expect(find.byTooltip(viL10n.filesImageUnreadable), findsOneWidget);
    });
  });

  group('AttachmentThumbnails', () {
    testWidgets('WT-FILES-04: a file shown twice is fetched once; the viewer shows it large and closes',
        (tester) async {
      final (dio, adapter) = _dio(_png);
      const photo = UploadedFile(
          id: 'f1', url: '/api/v1/mms_core/files/f1', name: 'scene.jpg', mimeType: 'image/jpeg', size: 67);
      const pdf = UploadedFile(
          id: 'f2', url: '/api/v1/mms_core/files/f2', name: 'plan.pdf', mimeType: 'application/pdf', size: 9);

      await _pump(
        tester,
        dio,
        const Column(children: [
          AttachmentThumbnails(files: [photo, pdf]),
          AttachmentThumbnails(files: [photo]),
        ]),
      );
      await tester.pumpAndSettle();

      expect(adapter.requests.map((r) => r.path), ['/files/f1']);
      expect(find.text('plan.pdf'), findsOneWidget);

      await tester.tap(find.byType(AuthenticatedImage).first);
      await tester.pumpAndSettle();

      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(find.text('scene.jpg'), findsOneWidget);
      expect(adapter.requests, hasLength(1));

      await tester.tap(find.byTooltip(viL10n.filesViewerClose));
      await tester.pumpAndSettle();
      expect(find.byType(InteractiveViewer), findsNothing);
    });
  });

  group('AttachmentPickerField', () {
    testWidgets('WT-FILES-05: a camera photo shows its upload progress, then counts towards the limit',
        (tester) async {
      final release = Completer<void>();
      final (dio, adapter) = _dio(_stored, gate: (_) => release.future);
      final picker = FakePhotoPicker(next: [fakePhoto('cam.jpg')]);
      final uploads = AttachmentUploads(api: FilesApi(dio), purpose: FilePurpose.workReport, max: 3);
      addTearDown(uploads.dispose);

      await _pump(tester, dio, AttachmentPickerField(uploads: uploads), picker: picker);
      expect(find.text(viL10n.filesAttachmentsCount(0, 3)), findsOneWidget);

      await tester.tap(find.text(viL10n.filesPickCamera));
      await tester.pump();
      await tester.pump();

      expect(picker.calls.single, (PhotoSource.camera, 3));
      expect(find.text(viL10n.filesAttachmentsCount(1, 3)), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      release.complete();
      await tester.pumpAndSettle();

      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(uploads.uploadedIds, ['id-cam.jpg']);
      expect(adapter.requests, hasLength(1));
      expect(find.byTooltip(viL10n.filesAttachmentRemove), findsOneWidget);
    });

    testWidgets('WT-FILES-06: a refused upload shows its reason; retry uploads it, remove drops it',
        (tester) async {
      var calls = 0;
      final (dio, _) = _dio((o) => ++calls == 1
          ? jsonBody(415, {'message': 'file_type_not_allowed', 'statusCode': 415})
          : _stored(o));
      final picker = FakePhotoPicker(next: [fakePhoto('a.heic')]);
      final uploads = AttachmentUploads(api: FilesApi(dio), purpose: FilePurpose.workReport, max: 3);
      addTearDown(uploads.dispose);
      await _pump(tester, dio, AttachmentPickerField(uploads: uploads), picker: picker);

      await tester.tap(find.text(viL10n.filesPickGallery));
      await tester.pumpAndSettle();

      expect(picker.calls.single, (PhotoSource.gallery, 3));
      final reason = viL10n.filesUploadFailedItem('a.heic', viL10n.filesErrorFileTypeNotAllowed);
      expect(find.text(reason), findsOneWidget);

      await tester.tap(find.byTooltip(viL10n.filesUploadRetry));
      await tester.pumpAndSettle();

      expect(find.text(reason), findsNothing);
      expect(uploads.uploadedIds, ['id-a.heic']);

      await tester.tap(find.byTooltip(viL10n.filesAttachmentRemove));
      await tester.pumpAndSettle();

      expect(uploads.items, isEmpty);
      expect(find.text(viL10n.filesAttachmentsCount(0, 3)), findsOneWidget);
    });

    testWidgets('WT-FILES-07: picking past the limit adds what fits, says so and disables adding',
        (tester) async {
      final (dio, _) = _dio(_stored);
      final picker = FakePhotoPicker(next: [fakePhoto('1.jpg'), fakePhoto('2.jpg'), fakePhoto('3.jpg')]);
      final uploads = AttachmentUploads(api: FilesApi(dio), purpose: FilePurpose.workReport, max: 2);
      addTearDown(uploads.dispose);
      await _pump(tester, dio, AttachmentPickerField(uploads: uploads), picker: picker);

      await tester.tap(find.text(viL10n.filesPickGallery));
      await tester.pumpAndSettle();

      expect(find.text(viL10n.filesAttachmentsLimitReached(2)), findsOneWidget);
      expect(find.text(viL10n.filesAttachmentsCount(2, 2)), findsOneWidget);
      expect(_enabled(tester, viL10n.filesPickCamera), isFalse);
      expect(_enabled(tester, viL10n.filesPickGallery), isFalse);
      expect(uploads.uploadedIds, ['id-1.jpg', 'id-2.jpg']);
    });

    testWidgets('WT-FILES-08: a picker failure is shown; a disabled field offers no picking', (tester) async {
      final (dio, _) = _dio(_stored);
      final picker = FakePhotoPicker()..error = const AppFailure(AppFailure.photoAccessDenied);
      final uploads = AttachmentUploads(api: FilesApi(dio), purpose: FilePurpose.workReport, max: 2);
      addTearDown(uploads.dispose);
      await _pump(tester, dio, AttachmentPickerField(uploads: uploads), picker: picker);

      await tester.tap(find.text(viL10n.filesPickCamera));
      await tester.pumpAndSettle();

      expect(find.text(viL10n.filesErrorPhotoAccessDenied), findsOneWidget);
      expect(uploads.items, isEmpty);

      await _pump(tester, dio, AttachmentPickerField(uploads: uploads, enabled: false), picker: picker);
      expect(_enabled(tester, viL10n.filesPickCamera), isFalse);
      expect(_enabled(tester, viL10n.filesPickGallery), isFalse);
    });
  });
}
