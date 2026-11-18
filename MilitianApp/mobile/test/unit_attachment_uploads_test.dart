// Unit Tests: AttachmentUploads, the photos picked for a record (task report, work report)
//   Each photo is uploaded as soon as it is added (POST /files/upload with the record's purpose,
//   Web/backend/src/files/files.controller.ts); the record is sent with the uploaded ids in display order
//   (work reports: attachmentIds ≤ 10, work-reports.dto.ts; task reports: photoIds ≤ 10).
// Run: flutter test test/unit_attachment_uploads_test.dart

import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:militian_app/features/files/files.dart';

import 'helpers/fakes.dart';

final _png = Uint8List.fromList([0x89, 0x50, 0x4e, 0x47]);

XFile _photo(String name) => XFile.fromData(_png, name: name, path: name);

String _nameOf(RequestOptions o) => (o.data as FormData).files.single.value.filename!;

class _Rig {
  _Rig({this.max = 3});

  final int max;
  final holds = <String, Completer<void>>{};
  final refusals = <String, ResponseBody Function()>{};
  var notifications = 0;

  late final adapter = FakeAdapter(
    (o) {
      final name = _nameOf(o);
      final refuse = refusals[name];
      if (refuse != null) return refuse();
      return jsonBody(201, {'id': 'id-$name', 'url': '/api/v1/mms_core/files/id-$name', 'name': name, 'mimeType': 'image/png', 'size': 4});
    },
    gate: (o) => holds[_nameOf(o)]?.future,
  );

  late final uploads = AttachmentUploads(
    repository: FilesRepository(Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter),
    purpose: FilePurpose.workReport,
    max: max,
  )..addListener(() => notifications++);
}

void main() {
  test('UT-UPL-01: added photos upload at once with the purpose; ids come in display order', () async {
    final r = _Rig();
    r.holds['a.png'] = Completer<void>();

    final added = r.uploads.add([_photo('a.png'), _photo('b.png')]);
    await pumpEventQueue();
    expect(added.skipped, 0);
    expect(r.uploads.isUploading, isTrue);
    expect(r.uploads.items.map((i) => (i.name, i.status)),
        [('a.png', AttachmentStatus.uploading), ('b.png', AttachmentStatus.uploaded)]);
    expect(r.uploads.uploadedIds, ['id-b.png']);

    r.holds['a.png']!.complete();
    await added.done;
    expect(r.uploads.isUploading, isFalse);
    expect(r.uploads.uploadedIds, ['id-a.png', 'id-b.png']);
    expect(r.uploads.items.first.file?.name, 'a.png');
    expect(r.uploads.items.first.bytes, _png);
    expect(r.adapter.requests.map((o) => (o.data as FormData).fields.single.value), ['work_report', 'work_report']);
    expect(r.notifications, greaterThan(0));
  });

  test('UT-UPL-02: at most max photos: the rest are skipped and counted', () async {
    final r = _Rig(max: 2);

    final first = r.uploads.add([_photo('a.png')]);
    expect(r.uploads.remaining, 1);
    final second = r.uploads.add([_photo('b.png'), _photo('c.png'), _photo('d.png')]);
    await Future.wait([first.done, second.done]);

    expect(second.skipped, 2);
    expect(r.uploads.remaining, 0);
    expect(r.uploads.uploadedIds, ['id-a.png', 'id-b.png']);
    expect(r.adapter.requests, hasLength(2));
  });

  test('UT-UPL-03: a failed upload keeps its error and uploads again on retry; other retries do nothing', () async {
    final r = _Rig();
    r.refusals['a.png'] = () => jsonBody(415, backendError(415, 'file_type_not_allowed'));

    await r.uploads.add([_photo('a.png'), _photo('b.png')]).done;
    final failed = r.uploads.items.first;
    expect(failed.status, AttachmentStatus.failed);
    expect(r.uploads.hasFailures, isTrue);
    expect((failed.error as FilesException).failure?.code, 'file_type_not_allowed');
    expect(r.uploads.uploadedIds, ['id-b.png']);

    r.refusals.clear();
    await r.uploads.retry(failed);
    expect(failed.status, AttachmentStatus.uploaded);
    expect(failed.error, isNull);
    expect(r.uploads.hasFailures, isFalse);
    expect(r.uploads.uploadedIds, ['id-a.png', 'id-b.png']);

    await r.uploads.retry(r.uploads.items.last);
    expect(r.adapter.requests, hasLength(3), reason: 'an uploaded photo is not sent again');
  });

  test('UT-UPL-04: removing a photo stops waiting for its upload; its late answer changes nothing', () async {
    final r = _Rig();
    r.holds['a.png'] = Completer<void>();
    final added = r.uploads.add([_photo('a.png'), _photo('b.png')]);
    await pumpEventQueue();
    final item = r.uploads.items.first;

    r.uploads.remove(item);
    await added.done;
    expect(r.uploads.items.map((i) => i.name), ['b.png']);
    expect(r.uploads.remaining, 2);

    r.holds['a.png']!.complete();
    await pumpEventQueue();
    expect(r.uploads.uploadedIds, ['id-b.png']);
    r.uploads.remove(item);
    await r.uploads.retry(item);
    expect(r.uploads.items, hasLength(1));
  });

  test('UT-UPL-05: clear drops every photo; after dispose nothing is added or notified', () async {
    final r = _Rig();
    r.holds['a.png'] = Completer<void>();
    final added = r.uploads.add([_photo('a.png'), _photo('b.png')]);
    await pumpEventQueue();

    r.uploads.clear();
    await added.done;
    expect(r.uploads.items, isEmpty);

    r.uploads.add([_photo('c.png')]);
    await pumpEventQueue();
    r.uploads.dispose();
    final seen = r.notifications;
    final late = r.uploads.add([_photo('d.png')]);
    await late.done;
    expect(late.skipped, 1);
    r.holds['a.png']!.complete();
    await pumpEventQueue();
    expect(r.notifications, seen);
  });

  test('UT-UPL-06: a picked file that cannot be read fails with that issue', () async {
    final r = _Rig();
    await r.uploads.add([XFile('Z:/missing/p.jpg')]).done;

    final item = r.uploads.items.single;
    expect(item.status, AttachmentStatus.failed);
    expect((item.error as FilesException).issue, FilesIssue.unreadable);
    expect(r.adapter.requests, isEmpty);
  });

  test('UT-UPL-07: the limit is 1 to 10 photos', () {
    expect(AttachmentUploads.maxAttachments, 10);
    final repo = FilesRepository(Dio());
    expect(() => AttachmentUploads(repository: repo, purpose: FilePurpose.general, max: 0), throwsA(isA<AssertionError>()));
    expect(() => AttachmentUploads(repository: repo, purpose: FilePurpose.general, max: 11), throwsA(isA<AssertionError>()));
  });
}
