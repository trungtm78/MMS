// Unit Tests: the shared files layer (lib/shared/files) against Web/backend/src/files (T20)
//   POST /files/upload multipart {file, purpose?} → 201 {id, url, name, mimeType, size}   (files.controller.ts)
//     400 file_required | file_empty | file_field_invalid | multipart_malformed,
//     413 file_too_large (10 MB), 415 file_type_not_allowed      (upload.interceptor.ts, upload-type.ts)
//   GET  /files/:id with the Bearer token → the content; 404 file_not_found   (files.service.ts)
//   image_picker settings that re-encode every picked photo (JPEG, never HEIC)
// Run: flutter test test/unit_files_api_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:police_app/shared/errors/app_failure.dart';
import 'package:police_app/shared/files/files.dart';

import 'helpers/fake_photo_picker.dart';
import 'helpers/fakes.dart';

(FilesApi, FakeAdapter) _api(
  ResponseBody Function(RequestOptions) handler, {
  Future<void> Function(RequestOptions)? gate,
}) {
  final adapter = FakeAdapter(handler, gate: gate);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (FilesApi(dio), adapter);
}

ResponseBody _error(int status, String code) =>
    jsonBody(status, {'code': 'E002', 'message': code, 'statusCode': status});

Map<String, Object> _view(
  String id, {
  String name = 'photo.jpg',
  String mimeType = 'image/jpeg',
  Object size = 4,
}) =>
    {
      'id': id,
      'url': '/api/v1/mms_core/files/$id',
      'name': name,
      'mimeType': mimeType,
      'size': size,
    };

MultipartFile _part(RequestOptions o) => (o.data as FormData).files.single.value;

Map<String, String> _fields(RequestOptions o) =>
    {for (final field in (o.data as FormData).fields) field.key: field.value};

Matcher _failure(String code, [int? status]) => throwsA(isA<AppFailure>()
    .having((f) => f.code, 'code', code)
    .having((f) => f.status, 'status', status));

/// Lets queued async work run until [condition] holds (no fixed delay)
Future<void> _until(bool Function() condition) async {
  for (var i = 0; i < 100 && !condition(); i++) {
    await pumpEventQueue();
  }
  expect(condition(), isTrue, reason: 'the awaited state was never reached');
}

/// Records how the platform picker is called, without platform channels
class _RecordingImagePicker extends ImagePicker {
  _RecordingImagePicker({this.single, this.multi = const [], this.error});

  final XFile? single;
  final List<XFile> multi;
  final Object? error;
  final calls = <Map<String, Object?>>[];

  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async {
    calls.add({
      'call': 'pickImage',
      'source': source,
      'maxWidth': maxWidth,
      'maxHeight': maxHeight,
      'imageQuality': imageQuality,
    });
    final e = error;
    if (e != null) throw e;
    return single;
  }

  @override
  Future<List<XFile>> pickMultiImage({
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    int? limit,
    bool requestFullMetadata = true,
  }) async {
    calls.add({
      'call': 'pickMultiImage',
      'limit': limit,
      'maxWidth': maxWidth,
      'maxHeight': maxHeight,
      'imageQuality': imageQuality,
    });
    final e = error;
    if (e != null) throw e;
    return multi;
  }
}

void main() {
  group('FilesApi.upload', () {
    test('UT-FILES-01: sends one multipart "file" part with the purpose and parses the stored file', () async {
      final (api, adapter) = _api((_) => jsonBody(201, _view('f1')));

      final file = await api.upload(fakePhoto('photo.jpg', [0xFF, 0xD8, 0xFF, 0xE0]),
          purpose: FilePurpose.workReport);

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/files/upload');
      expect(_fields(req), {'purpose': 'work_report'});
      expect((req.data as FormData).files.single.key, 'file');
      expect(_part(req).filename, 'photo.jpg');
      expect(_part(req).length, 4);
      // No declared image type that could disagree with the content: the server sniffs it
      expect(_part(req).contentType?.mimeType, 'application/octet-stream');
      expect(file.id, 'f1');
      expect(file.url, '/api/v1/mms_core/files/f1');
      expect(file.name, 'photo.jpg');
      expect(file.mimeType, 'image/jpeg');
      expect(file.size, 4);
      expect(file.isImage, isTrue);
    });

    test('UT-FILES-02: purposes use the backend names; general is the default', () async {
      // FILE_PURPOSES (files.service.ts): general, then every kind of record a file attaches to
      expect(FilePurpose.values.map((p) => p.wire),
          ['general', 'task_report', 'work_report', 'official_document', 'task', 'militia_profile']);
      final (api, adapter) = _api((_) => jsonBody(201, _view('f1')));

      await api.uploadBytes(Uint8List.fromList([1, 2]), filename: 'scan.pdf');

      expect(_fields(adapter.requests.single), {'purpose': 'general'});
      expect(_part(adapter.requests.single).filename, 'scan.pdf');
    });

    test('UT-FILES-03: server refusals keep their code and status', () async {
      const refusals = [
        (400, 'file_required'),
        (400, 'file_empty'),
        (400, 'file_field_invalid'),
        (400, 'multipart_malformed'),
        (413, 'file_too_large'),
        (415, 'file_type_not_allowed'),
      ];
      for (final (status, code) in refusals) {
        final (api, _) = _api((_) => _error(status, code));
        await expectLater(api.upload(fakePhoto('a.heic')), _failure(code, status), reason: code);
      }
    });

    test('UT-FILES-04: an empty file or one over 10 MB is refused before any request', () async {
      final (api, adapter) = _api((_) => jsonBody(201, _view('f1')));

      await expectLater(api.uploadBytes(Uint8List(0), filename: 'a.jpg'), _failure('file_empty'));
      await expectLater(
        api.uploadBytes(Uint8List(FilesApi.maxUploadBytes + 1), filename: 'a.jpg'),
        _failure('file_too_large'),
      );
      expect(adapter.requests, isEmpty);

      await api.uploadBytes(Uint8List(FilesApi.maxUploadBytes), filename: 'a.jpg');
      expect(adapter.requests, hasLength(1));
    });

    test('UT-FILES-05: a 201 without a file, or a lost connection, is a failure with an app code', () async {
      final (noId, _) = _api((_) => jsonBody(201, {'url': '/x'}));
      await expectLater(noId.upload(fakePhoto('a.jpg')), _failure(AppFailure.badResponse));

      final (notAMap, _) = _api((_) => jsonBody(201, ['f1']));
      await expectLater(notAMap.upload(fakePhoto('a.jpg')), _failure(AppFailure.badResponse));

      final (offline, _) =
          _api((o) => throw DioException.connectionError(requestOptions: o, reason: 'offline'));
      await expectLater(offline.upload(fakePhoto('a.jpg')), _failure(AppFailure.network));
    });
  });

  group('FilesApi.download', () {
    test('UT-FILES-06: GETs /files/:id as bytes', () async {
      final (api, adapter) = _api((_) => ResponseBody.fromBytes(transparentPng, 200, headers: {
            Headers.contentTypeHeader: ['image/png'],
          }));

      final bytes = await api.download('f1');

      final req = adapter.requests.single;
      expect(req.method, 'GET');
      expect(req.path, '/files/f1');
      expect(req.responseType, ResponseType.bytes);
      expect(bytes, transparentPng);
    });

    test('UT-FILES-07: the error code is read from the JSON body of a bytes request; ids are path-encoded',
        () async {
      final (api, adapter) = _api((_) => _error(404, 'file_not_found'));
      await expectLater(api.download('a/b'), _failure('file_not_found', 404));
      expect(adapter.requests.single.path, '/files/a%2Fb');

      final (garbled, _) = _api((_) => ResponseBody.fromBytes([0xFF, 0x00], 502));
      await expectLater(garbled.download('f1'), _failure(AppFailure.noCode, 502));
    });
  });

  group('UploadedFile', () {
    test('UT-FILES-08: lists skip entries without an id; sizes may arrive as text', () {
      final files = UploadedFile.listFromJson([
        _view('f1', size: '2048'),
        {'name': 'no id'},
        'junk',
        _view('f2', name: 'plan.pdf', mimeType: 'application/pdf'),
      ]);

      expect(files.map((f) => f.id), ['f1', 'f2']);
      expect(files.first.size, 2048);
      expect(files.last.isImage, isFalse);
      expect(UploadedFile.listFromJson(null), isEmpty);
      expect(() => UploadedFile.fromJson({'name': 'x'}), throwsFormatException);
    });
  });

  group('ImagePickerPhotoPicker', () {
    test('UT-FILES-09: the camera takes one photo, scaled and re-encoded as JPEG', () async {
      final picker = _RecordingImagePicker(single: fakePhoto('cam.jpg'));

      final photos = await ImagePickerPhotoPicker(picker).pick(PhotoSource.camera, max: 5);

      expect(photos.map((p) => p.name), ['cam.jpg']);
      expect(picker.calls.single, {
        'call': 'pickImage',
        'source': ImageSource.camera,
        'maxWidth': 1920.0,
        'maxHeight': 1920.0,
        'imageQuality': 85,
      });
      final container = ProviderContainer();
      addTearDown(container.dispose);
      expect(container.read(photoPickerProvider), isA<ImagePickerPhotoPicker>());
    });

    test('UT-FILES-10: the gallery offers the room left and never returns more', () async {
      final picker = _RecordingImagePicker(
          multi: [fakePhoto('1.jpg'), fakePhoto('2.jpg'), fakePhoto('3.jpg')]);

      final photos = await ImagePickerPhotoPicker(picker).pick(PhotoSource.gallery, max: 2);

      expect(photos.map((p) => p.name), ['1.jpg', '2.jpg']);
      expect(picker.calls.single, {
        'call': 'pickMultiImage',
        'limit': 2,
        'maxWidth': 1920.0,
        'maxHeight': 1920.0,
        'imageQuality': 85,
      });
    });

    test('UT-FILES-11: room for one picks a single gallery photo; no room or a cancel picks nothing', () async {
      final one = _RecordingImagePicker(single: fakePhoto('1.jpg'));
      final photos = await ImagePickerPhotoPicker(one).pick(PhotoSource.gallery, max: 1);
      expect(photos.map((p) => p.name), ['1.jpg']);
      expect(one.calls.single['call'], 'pickImage');
      expect(one.calls.single['source'], ImageSource.gallery);
      expect(one.calls.single['imageQuality'], 85);

      final cancelled = _RecordingImagePicker();
      expect(await ImagePickerPhotoPicker(cancelled).pick(PhotoSource.gallery, max: 0), isEmpty);
      expect(cancelled.calls, isEmpty);
      expect(await ImagePickerPhotoPicker(cancelled).pick(PhotoSource.camera, max: 3), isEmpty);
    });

    test('UT-FILES-12: denied camera or photo access, and other picker errors, become app codes', () async {
      for (final code in ['camera_access_denied', 'photo_access_denied']) {
        final picker = _RecordingImagePicker(error: PlatformException(code: code));
        await expectLater(ImagePickerPhotoPicker(picker).pick(PhotoSource.camera, max: 1),
            _failure(AppFailure.photoAccessDenied));
      }
      final broken = _RecordingImagePicker(error: PlatformException(code: 'invalid_image'));
      await expectLater(ImagePickerPhotoPicker(broken).pick(PhotoSource.gallery, max: 3),
          _failure(AppFailure.photoPickFailed));
    });
  });

  group('AttachmentUploads', () {
    /// Uploads that wait until the test opens their gate (one per file name)
    (AttachmentUploads, FakeAdapter, Map<String, Completer<void>>) harness({
      int max = 10,
      ResponseBody Function(RequestOptions)? handler,
      bool gated = true,
      bool disposeAtEnd = true,
    }) {
      final gates = <String, Completer<void>>{};
      final (api, adapter) = _api(
        handler ?? (o) => jsonBody(201, _view('id-${_part(o).filename}', name: _part(o).filename!)),
        gate: gated
            ? (o) => gates.putIfAbsent(_part(o).filename!, Completer<void>.new).future
            : null,
      );
      final uploads = AttachmentUploads(api: api, purpose: FilePurpose.workReport, max: max);
      if (disposeAtEnd) addTearDown(uploads.dispose);
      return (uploads, adapter, gates);
    }

    test('UT-FILES-13: photos upload as they are added; ids keep the display order', () async {
      final (uploads, adapter, gates) = harness();
      var notified = 0;
      uploads.addListener(() => notified++);

      final batch = uploads.add([fakePhoto('a.jpg'), fakePhoto('b.jpg')]);

      expect(batch.skipped, 0);
      expect(uploads.items.map((i) => i.name), ['a.jpg', 'b.jpg']);
      await _until(() => adapter.requests.length == 2);
      expect(uploads.items.map((i) => i.status), [AttachmentStatus.uploading, AttachmentStatus.uploading]);
      expect(uploads.items.first.bytes, transparentPng);
      expect(uploads.isUploading, isTrue);

      gates['b.jpg']!.complete();
      await _until(() => uploads.items.last.status == AttachmentStatus.uploaded);
      expect(uploads.items.first.status, AttachmentStatus.uploading);
      expect(uploads.uploadedIds, ['id-b.jpg']);

      gates['a.jpg']!.complete();
      await batch.done;
      expect(uploads.uploadedIds, ['id-a.jpg', 'id-b.jpg']);
      expect(uploads.items.first.file?.name, 'a.jpg');
      expect(uploads.isUploading, isFalse);
      expect(uploads.hasFailures, isFalse);
      expect(adapter.requests.map((r) => _fields(r)['purpose']), ['work_report', 'work_report']);
      expect(notified, greaterThanOrEqualTo(3));
    });

    test('UT-FILES-14: only the room left is taken; the rest is reported as skipped', () async {
      final (uploads, adapter, _) = harness(max: 2, gated: false);

      final first = uploads.add([fakePhoto('a.jpg'), fakePhoto('b.jpg'), fakePhoto('c.jpg')]);
      expect(first.skipped, 1);
      expect(uploads.items.map((i) => i.name), ['a.jpg', 'b.jpg']);
      expect(uploads.remaining, 0);

      final second = uploads.add([fakePhoto('d.jpg')]);
      expect(second.skipped, 1);

      await first.done;
      await second.done;
      expect(adapter.requests.map((r) => _part(r).filename), unorderedEquals(['a.jpg', 'b.jpg']));
      expect(uploads.max, 2);
    });

    test('UT-FILES-15: a refused upload keeps its reason until it is retried', () async {
      var calls = 0;
      final (uploads, adapter, _) = harness(
        gated: false,
        handler: (_) => ++calls == 1 ? _error(415, 'file_type_not_allowed') : jsonBody(201, _view('f1')),
      );

      await uploads.add([fakePhoto('a.heic')]).done;

      expect(uploads.items.single.status, AttachmentStatus.failed);
      expect(uploads.items.single.failure?.code, 'file_type_not_allowed');
      expect(uploads.hasFailures, isTrue);
      expect(uploads.uploadedIds, isEmpty);

      await uploads.retry(uploads.items.single);
      expect(uploads.items.single.status, AttachmentStatus.uploaded);
      expect(uploads.items.single.failure, isNull);
      expect(uploads.hasFailures, isFalse);
      expect(uploads.uploadedIds, ['f1']);

      // An uploaded photo is not sent again
      await uploads.retry(uploads.items.single);
      expect(adapter.requests, hasLength(2));
    });

    test('UT-FILES-16: removing a photo cancels its upload and leaves it out of the ids', () async {
      final (uploads, adapter, gates) = harness();
      final batch = uploads.add([fakePhoto('a.jpg'), fakePhoto('b.jpg')]);
      await _until(() => adapter.requests.length == 2);

      uploads.remove(uploads.items.first);
      expect(uploads.items.map((i) => i.name), ['b.jpg']);
      gates['b.jpg']!.complete();
      // Completes although the removed photo's request never answers
      await batch.done;

      expect(uploads.uploadedIds, ['id-b.jpg']);
      expect(adapter.requests.first.cancelToken?.isCancelled, isTrue);

      uploads.remove(uploads.items.single);
      expect(uploads.uploadedIds, isEmpty);
      expect(uploads.remaining, 10);
    });

    test('UT-FILES-17: clear and dispose cancel uploads in flight and ignore their answers', () async {
      final (uploads, adapter, _) = harness();
      final cleared = uploads.add([fakePhoto('a.jpg')]);
      await _until(() => adapter.requests.length == 1);

      uploads.clear();
      await cleared.done;
      expect(uploads.items, isEmpty);
      expect(adapter.requests.single.cancelToken?.isCancelled, isTrue);

      final (other, otherAdapter, otherGates) = harness(disposeAtEnd: false);
      final batch = other.add([fakePhoto('b.jpg')]);
      await _until(() => otherAdapter.requests.length == 1);
      other.dispose();
      otherGates['b.jpg']!.complete();
      await batch.done;
      await pumpEventQueue();
      expect(otherAdapter.requests.single.cancelToken?.isCancelled, isTrue);
      // Nothing more is uploaded once the screen that owned the photos is gone
      expect(other.add([fakePhoto('c.jpg')]).skipped, 1);
      expect(otherAdapter.requests, hasLength(1));
    });

    test('UT-FILES-18: a picked file that cannot be read fails without a request', () async {
      final (uploads, adapter, _) = harness(gated: false);

      await uploads.add([XFile('missing-${DateTime.now().microsecondsSinceEpoch}.jpg')]).done;

      expect(uploads.items.single.status, AttachmentStatus.failed);
      expect(uploads.items.single.failure?.code, AppFailure.unknown);
      expect(adapter.requests, isEmpty);
    });
  });
}
