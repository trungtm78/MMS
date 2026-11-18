// Widget Tests: the files layer's widgets
//   AuthenticatedImage: GET /files/:id through the authenticated Dio (fileBytesProvider), with localized
//   loading and failure states and a tap to download again.
//   AttachmentPickerField: camera and library buttons (PhotoPicker from photoPickerProvider), the count
//   against the limit, a tile per photo with its upload state, retry and removal.
// Run: flutter test test/widget_files_widgets_test.dart

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:militian_app/features/files/files.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _l = viL10n;

/// A 1x1 transparent PNG
final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');

class _FakePicker implements PhotoPicker {
  final calls = <(PhotoSource, int)>[];
  List<XFile> photos = const [];
  FilesException? failure;

  @override
  Future<List<XFile>> pick(PhotoSource source, {required int max}) async {
    calls.add((source, max));
    if (failure != null) throw failure!;
    return photos;
  }
}

XFile _photo(String name) => XFile.fromData(_png, name: name, path: name);

/// A progress indicator announced with [label]
Finder _progress(String label) =>
    find.byWidgetPredicate((w) => w is CircularProgressIndicator && w.semanticsLabel == label);

String _uploadName(RequestOptions o) => (o.data as FormData).files.single.value.filename!;

class _Backend {
  final holds = <String, Completer<void>>{};
  final refusals = <String, ResponseBody Function()>{};
  ResponseBody Function(RequestOptions o) download = (_) => ResponseBody.fromBytes(_png, 200);

  late final adapter = FakeAdapter(
    (o) {
      if (o.method == 'GET') return download(o);
      final name = _uploadName(o);
      final refuse = refusals[name];
      if (refuse != null) return refuse();
      return jsonBody(201, {'id': 'id-$name', 'url': '/api/v1/mms_core/files/id-$name', 'name': name, 'mimeType': 'image/png', 'size': _png.length});
    },
    gate: (o) => o.method == 'GET' ? holds['GET']?.future : holds[_uploadName(o)]?.future,
  );

  late final repository = FilesRepository(Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter);
}

Future<void> _pump(WidgetTester tester, _Backend backend, Widget child, {PhotoPicker? picker}) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [
      filesRepositoryProvider.overrideWithValue(backend.repository),
      if (picker != null) photoPickerProvider.overrideWithValue(picker),
    ],
    child: localizedApp(Scaffold(body: Center(child: child))),
  ));
}

void main() {
  group('AuthenticatedImage', () {
    testWidgets('WT-FILES-01: a download in progress, then the image', (tester) async {
      final backend = _Backend()..holds['GET'] = Completer<void>();
      await _pump(tester, backend, const AuthenticatedImage(fileId: 'f1', width: 40, height: 40, semanticLabel: 'photo'));
      await tester.pump();

      expect(_progress(_l.filesImageLoading), findsOneWidget);

      backend.holds['GET']!.complete();
      await tester.pumpAndSettle();
      expect(backend.adapter.requests.single.path, '/files/f1');
      expect(find.byType(Image), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('WT-FILES-02: a failed download says why, and a tap downloads again', (tester) async {
      final backend = _Backend()..download = (_) => jsonBody(404, backendError(404, 'file_not_found'));
      await _pump(tester, backend, const AuthenticatedImage(fileId: 'f9'));
      await tester.pumpAndSettle();

      expect(find.byTooltip(_l.errorFileNotFound), findsOneWidget);
      backend.download = (_) => ResponseBody.fromBytes(_png, 200);
      await tester.tap(find.byIcon(Icons.broken_image_outlined));
      await tester.pumpAndSettle();

      expect(find.byType(Image), findsOneWidget);
      expect(backend.adapter.requests, hasLength(2));
    });

    testWidgets('WT-FILES-03: content that is not an image says so', (tester) async {
      await tester.pumpWidget(localizedApp(Builder(
        builder: (context) => AuthenticatedImage.unreadable(context, StateError('codec'), null),
      )));
      expect(find.byTooltip(_l.filesImageUnreadable), findsOneWidget);
    });
  });

  group('AttachmentPickerField', () {
    late AttachmentUploads uploads;

    Future<(_Backend, _FakePicker)> open(WidgetTester tester, {int max = 3, bool enabled = true}) async {
      final backend = _Backend();
      final picker = _FakePicker();
      uploads = AttachmentUploads(repository: backend.repository, purpose: FilePurpose.workReport, max: max);
      addTearDown(uploads.dispose);
      await _pump(tester, backend, AttachmentPickerField(uploads: uploads, enabled: enabled), picker: picker);
      return (backend, picker);
    }

    testWidgets('WT-FILES-04: camera and library add photos that upload; the count follows', (tester) async {
      final (backend, picker) = await open(tester);
      expect(find.text(_l.filesAttachmentsCount(0, 3)), findsOneWidget);

      backend.holds['a.png'] = Completer<void>();
      picker.photos = [_photo('a.png')];
      await tester.tap(find.text(_l.filesPickCamera));
      await tester.pump();
      await tester.pump();
      expect(picker.calls, [(PhotoSource.camera, 3)]);
      expect(_progress(_l.filesUploading), findsOneWidget);

      backend.holds['a.png']!.complete();
      picker.photos = [_photo('b.png')];
      await tester.tap(find.text(_l.filesPickGallery));
      await tester.pumpAndSettle();

      expect(picker.calls.last, (PhotoSource.gallery, 2));
      expect(find.text(_l.filesAttachmentsCount(2, 3)), findsOneWidget);
      expect(_progress(_l.filesUploading), findsNothing);
      expect(uploads.uploadedIds, ['id-a.png', 'id-b.png']);
      expect(find.byType(Image), findsNWidgets(2));
    });

    testWidgets('WT-FILES-05: a failed photo says why, uploads again on retry and can be removed', (tester) async {
      final (backend, picker) = await open(tester);
      backend.refusals['a.png'] = () => jsonBody(415, backendError(415, 'file_type_not_allowed'));
      picker.photos = [_photo('a.png')];

      await tester.tap(find.text(_l.filesPickCamera));
      await tester.pumpAndSettle();
      expect(find.text(_l.filesUploadFailedItem('a.png', _l.errorFileTypeNotAllowed)), findsOneWidget);

      backend.refusals.clear();
      await tester.tap(find.byTooltip(_l.filesUploadRetry));
      await tester.pumpAndSettle();
      expect(find.textContaining('a.png:'), findsNothing);
      expect(uploads.uploadedIds, ['id-a.png']);

      await tester.tap(find.byTooltip(_l.filesAttachmentRemove));
      await tester.pumpAndSettle();
      expect(uploads.items, isEmpty);
      expect(find.text(_l.filesAttachmentsCount(0, 3)), findsOneWidget);
    });

    testWidgets('WT-FILES-06: photos over the limit are left out and said so; a full field stops picking',
        (tester) async {
      final (_, picker) = await open(tester, max: 2);
      picker.photos = [_photo('a.png'), _photo('b.png'), _photo('c.png')];

      await tester.tap(find.text(_l.filesPickGallery));
      await tester.pumpAndSettle();

      expect(find.text(_l.filesAttachmentsLimitReached(2)), findsOneWidget);
      expect(uploads.items, hasLength(2));
      expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, _l.filesPickCamera)).onPressed, isNull);
      expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, _l.filesPickGallery)).onPressed, isNull);
    });

    testWidgets('WT-FILES-07: a picker failure is worded', (tester) async {
      final (_, picker) = await open(tester);
      picker.failure = const FilesException(FilesIssue.photoAccessDenied);

      await tester.tap(find.text(_l.filesPickCamera));
      await tester.pumpAndSettle();

      expect(find.text(_l.filesIssuePhotoAccessDenied), findsOneWidget);
      expect(uploads.items, isEmpty);
    });

    testWidgets('WT-FILES-08: while the record is being sent nothing can be picked, retried or removed',
        (tester) async {
      final backend = _Backend()..refusals['a.png'] = () => jsonBody(500, backendError(500, 'Internal server error'));
      uploads = AttachmentUploads(repository: backend.repository, purpose: FilePurpose.taskReport, max: 3);
      addTearDown(uploads.dispose);
      // Real async: an upload awaited outside a pump never completes under the test's fake clock
      await tester.runAsync(() => uploads.add([_photo('a.png')]).done);

      await _pump(tester, backend, AttachmentPickerField(uploads: uploads, enabled: false), picker: _FakePicker());
      await tester.pumpAndSettle();

      expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, _l.filesPickCamera)).onPressed, isNull);
      expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.refresh)).onPressed, isNull);
      expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.close)).onPressed, isNull);
      expect(find.text(_l.filesUploadFailedItem('a.png', _l.errorStatusServer)), findsOneWidget);
    });
  });
}
