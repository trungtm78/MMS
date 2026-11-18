// Unit Tests: the files layer against Web/backend/src/files
//   POST /files/upload (multipart: file, purpose general|task_report|work_report|official_document)
//     → 201 {id, url, name, mimeType, size} (files.controller.ts upload, files.service.ts record)
//     400 file_required | file_empty | file_field_invalid | multipart_malformed; 413 file_too_large (10 MB);
//     415 file_type_not_allowed (upload.interceptor.ts, content-checking-storage.ts, upload-type.ts)
//   GET /files/:id → the content, Bearer; 404 file_not_found (files.controller.ts download)
//   Attaching (work reports, task reports): 400 file_not_found | duplicate_file_ids | file_purpose_mismatch |
//     file_type_not_allowed; 409 file_already_attached (files.service.ts attach)
// Downloads go through the app's authenticated Dio (apiDioProvider). Every code has a row in the error table.
// Run: flutter test test/unit_files_repository_test.dart

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/files/files.dart';
import 'package:militian_app/l10n/error_texts.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _l = viL10n;

(FilesRepository, FakeAdapter) _repo(ResponseBody Function(RequestOptions) handler) {
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  return (FilesRepository(dio), adapter);
}

final _jpeg = Uint8List.fromList([0xff, 0xd8, 0xff, 0xe0]);

Map<String, dynamic> _view(String id, {String name = 'photo.jpg', Object size = 4}) =>
    {'id': id, 'url': '/api/v1/mms_core/files/$id', 'name': name, 'mimeType': 'image/jpeg', 'size': size};

Matcher _issue(FilesIssue issue) =>
    throwsA(isA<FilesException>().having((e) => e.issue, 'issue', issue).having((e) => e.failure, 'failure', isNull));

Matcher _code(String code, int status) => throwsA(isA<FilesException>()
    .having((e) => e.failure?.code, 'code', code)
    .having((e) => e.statusCode, 'status', status)
    .having((e) => e.issue, 'issue', isNull));

void main() {
  group('upload', () {
    test('UT-FILES-01: multipart with the purpose and the file declared generic; the 201 answer is parsed',
        () async {
      final (repo, adapter) = _repo((_) => jsonBody(201, _view('f1', size: '4')));

      final file = await repo.uploadBytes(_jpeg, filename: 'photo.jpg', purpose: FilePurpose.workReport);

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/files/upload');
      final form = req.data as FormData;
      expect(form.fields.map((f) => (f.key, f.value)), [('purpose', 'work_report')]);
      final part = form.files.single;
      expect(part.key, 'file');
      expect(part.value.filename, 'photo.jpg');
      expect(part.value.contentType?.mimeType, 'application/octet-stream');
      expect(part.value.length, 4);
      expect((file.id, file.url, file.name, file.mimeType, file.size),
          ('f1', '/api/v1/mms_core/files/f1', 'photo.jpg', 'image/jpeg', 4));
      expect(file.isImage, isTrue);
    });

    test('UT-FILES-02: empty and over 10 MB are refused before sending; exactly 10 MB is sent', () async {
      final (repo, adapter) = _repo((_) => jsonBody(201, _view('f1')));
      expect(FilesRepository.maxUploadBytes, 10 * 1024 * 1024);

      await expectLater(repo.uploadBytes(Uint8List(0), filename: 'a.jpg'), _issue(FilesIssue.fileEmpty));
      await expectLater(repo.uploadBytes(Uint8List(FilesRepository.maxUploadBytes + 1), filename: 'a.jpg'),
          _issue(FilesIssue.fileTooLarge));
      expect(adapter.requests, isEmpty);

      await repo.uploadBytes(Uint8List(FilesRepository.maxUploadBytes), filename: 'a.jpg');
      expect(adapter.requests, hasLength(1));
      expect((adapter.requests.single.data as FormData).fields.single.value, 'general');
    });

    test('UT-FILES-03: the server\'s refusals keep their code and status', () async {
      for (final (status, code) in [
        (400, 'file_required'),
        (400, 'file_empty'),
        (400, 'file_field_invalid'),
        (400, 'multipart_malformed'),
        (413, 'file_too_large'),
        (415, 'file_type_not_allowed'),
      ]) {
        final (repo, _) = _repo((_) => jsonBody(status, backendError(status, code)));
        await expectLater(repo.uploadBytes(_jpeg, filename: 'a.jpg'), _code(code, status), reason: code);
      }
    });

    test('UT-FILES-04: an answer that is not a stored file is a malformed response', () async {
      for (final body in <Object>[{'name': 'no id'}, ['f1']]) {
        final (repo, _) = _repo((_) => jsonBody(201, body));
        await expectLater(repo.uploadBytes(_jpeg, filename: 'a.jpg'), _issue(FilesIssue.malformedResponse));
      }
    });

    test('UT-FILES-05: upload reads the picked file; an unreadable one is refused', () async {
      final (repo, adapter) = _repo((_) => jsonBody(201, _view('f2', name: 'IMG_1.jpg')));

      final file = await repo.upload(XFile.fromData(_jpeg, name: 'IMG_1.jpg', path: 'IMG_1.jpg'), purpose: FilePurpose.taskReport);
      expect(file.id, 'f2');
      final form = adapter.requests.single.data as FormData;
      expect(form.files.single.value.filename, 'IMG_1.jpg');
      expect(form.fields.single.value, 'task_report');

      await expectLater(repo.upload(XFile('Z:/missing/IMG_2.heic')), _issue(FilesIssue.unreadable));
      expect(adapter.requests, hasLength(1));
    });
  });

  group('download', () {
    test('UT-FILES-06: GET /files/{id} as bytes; the id is one path segment', () async {
      final (repo, adapter) = _repo((_) => ResponseBody.fromBytes([1, 2, 3], 200, headers: {
            Headers.contentTypeHeader: ['image/png'],
          }));

      expect(await repo.download('f1'), [1, 2, 3]);
      await repo.download('a/b');

      expect(adapter.requests.first.method, 'GET');
      expect(adapter.requests.first.path, '/files/f1');
      expect(adapter.requests.first.responseType, ResponseType.bytes);
      expect(adapter.requests.last.path, '/files/a%2Fb');
    });

    test('UT-FILES-07: a 404 JSON body is read for its code; other failures keep status or kind', () async {
      final (missing, _) = _repo((_) => jsonBody(404, backendError(404, 'file_not_found')));
      await expectLater(missing.download('f9'), _code('file_not_found', 404));

      final (html, _) = _repo((_) => ResponseBody.fromString('<html>bad gateway</html>', 502));
      await expectLater(
        html.download('f9'),
        throwsA(isA<FilesException>()
            .having((e) => e.failure?.status, 'status', 502)
            .having((e) => e.failure?.code, 'code', isNull)),
      );

      final (offline, _) = _repo((o) => throw DioException(requestOptions: o, type: DioExceptionType.connectionError));
      await expectLater(
        offline.download('f9'),
        throwsA(isA<FilesException>().having((e) => e.failure?.kind, 'kind', FailureKind.connection)),
      );
    });

    test('UT-FILES-08: fileBytesProvider downloads through the app\'s authenticated Dio, caches the content '
        'and does not cache a failure', () async {
      var answer = jsonBody(404, backendError(404, 'file_not_found'));
      final adapter = FakeAdapter((o) => o.path == '/files/f1'
          ? ResponseBody.fromBytes(utf8.encode('img'), 200, headers: {
              Headers.contentTypeHeader: ['image/jpeg'],
            })
          : answer);
      final container = ProviderContainer(overrides: [
        apiDioProvider.overrideWithValue(Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter),
      ]);
      addTearDown(container.dispose);

      final keep = container.listen(fileBytesProvider('f1'), (_, __) {});
      expect(await container.read(fileBytesProvider('f1').future), utf8.encode('img'));
      expect(await container.read(fileBytesProvider('f1').future), utf8.encode('img'));
      expect(adapter.requests.where((r) => r.path == '/files/f1'), hasLength(1));
      keep.close();

      container.listen(fileBytesProvider('f2'), (_, __) {});
      await expectLater(container.read(fileBytesProvider('f2').future), _code('file_not_found', 404));
      answer = ResponseBody.fromBytes([7], 200);
      container.invalidate(fileBytesProvider('f2'));
      expect(await container.read(fileBytesProvider('f2').future), [7]);
      expect(adapter.requests.where((r) => r.path == '/files/f2'), hasLength(2));
    });
  });

  test('UT-FILES-09: UploadedFile from records: sizes as text, entries without id skipped', () {
    expect(UploadedFile.fromJson(_view('f1', size: '2048')).size, 2048);
    expect(UploadedFile.fromJson(_view('f1', size: 'n/a')).size, 0);
    expect(UploadedFile.fromJson({'id': 7}).name, '');
    expect(() => UploadedFile.fromJson({'name': 'x'}), throwsFormatException);
    expect(UploadedFile.listFromJson([_view('a'), {'name': 'no id'}, 'x', {..._view('b'), 'mimeType': 'application/pdf'}])
        .map((f) => (f.id, f.isImage)), [('a', true), ('b', false)]);
    expect(UploadedFile.listFromJson(null), isEmpty);
    expect(FilePurpose.values.map((p) => p.wire), ['general', 'task_report', 'work_report', 'official_document']);
  });

  test('UT-FILES-10: every upload and attachment code has its row in the error table; local issues are worded',
      () {
    final rows = <String, String>{
      'file_required': _l.errorFileRequired,
      'file_empty': _l.errorFileEmpty,
      'file_field_invalid': _l.errorFileFieldInvalid,
      'multipart_malformed': _l.errorFileMultipartMalformed,
      'file_too_large': _l.errorFileTooLarge,
      'file_type_not_allowed': _l.errorFileTypeNotAllowed,
      'file_not_found': _l.errorFileNotFound,
      'duplicate_file_ids': _l.errorFileDuplicateIds,
      'file_purpose_mismatch': _l.errorFilePurposeMismatch,
      'file_already_attached': _l.errorFileAlreadyAttached,
      // users/users.service.ts searchUsers
      'search_query_too_short': _l.errorUserSearchQueryTooShort,
    };
    rows.forEach((code, text) {
      for (final status in [400, 404, 409, 413, 415]) {
        expect(errorText(_l, code, status: status), text, reason: '$status $code');
      }
    });
    expect(rows.values.toSet(), hasLength(rows.length));

    expect(filesErrorText(_l, const FilesException(FilesIssue.fileEmpty)), _l.errorFileEmpty);
    expect(filesErrorText(_l, const FilesException(FilesIssue.fileTooLarge)), _l.errorFileTooLarge);
    expect(filesErrorText(_l, const FilesException(FilesIssue.unreadable)), _l.filesIssueUnreadable);
    expect(filesErrorText(_l, const FilesException(FilesIssue.malformedResponse)), _l.filesIssueMalformedResponse);
    expect(filesErrorText(_l, const FilesException(FilesIssue.photoAccessDenied)), _l.filesIssuePhotoAccessDenied);
    expect(filesErrorText(_l, const FilesException(FilesIssue.photoPickFailed)), _l.filesIssuePhotoPickFailed);
    expect(filesErrorText(_l, FilesException.api(const ApiFailure(code: 'file_already_attached', status: 409))),
        _l.errorFileAlreadyAttached);
    expect(filesErrorText(_l, StateError('x')), _l.errorUnexpected);
    expect(const FilesException(FilesIssue.unreadable).toString(), contains('unreadable'));
    expect(FilesException.api(const ApiFailure(status: 413)).toString(), contains('413'));
  });
}
