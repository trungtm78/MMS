// Widget Tests: stored files of a record (task attachments, militia profile documents)
//   Images: thumbnails through the authenticated download (GET /files/:id), opening the viewer.
//   Other files: an entry that downloads the content with the session and hands it to the share
//   sheet, so the user opens or saves it in another app; a refused download is explained.
// Run: flutter test test/widget_stored_file_list_test.dart

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/shared/files/files.dart';
import 'package:police_app/shared/widgets/stored_file_list.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

final _files = [
  UploadedFile.fromJson(fileView('f1', name: 'gate.jpg')),
  UploadedFile.fromJson(fileView('f2', name: 'brief.pdf', mimeType: 'application/pdf')),
];

typedef _Shared = ({Uint8List bytes, String name, String mimeType});

Future<(FakeAdapter, List<_Shared>)> _pump(WidgetTester tester, ResponseBody Function(RequestOptions) handler) async {
  final adapter = FakeAdapter(handler);
  final shared = <_Shared>[];
  await tester.pumpWidget(ProviderScope(
    overrides: [
      dioProvider.overrideWithValue(fakeDio(adapter)),
      shareFileProvider.overrideWithValue((bytes, {required name, required mimeType}) async {
        shared.add((bytes: bytes, name: name, mimeType: mimeType));
      }),
    ],
    child: localizedApp(Scaffold(body: StoredFileList(files: _files))),
  ));
  await tester.pumpAndSettle();
  return (adapter, shared);
}

ResponseBody _pdf(RequestOptions _) => ResponseBody.fromBytes(const [37, 80, 68, 70], 200, headers: {
      Headers.contentTypeHeader: ['application/pdf'],
    });

void main() {
  testWidgets('WT-FILES-01: images show as thumbnails, other files as entries named after them', (tester) async {
    final (adapter, _) = await _pump(tester, (o) => o.path == '/files/f1' ? pngBody(o) : _pdf(o));

    expect(find.byType(AuthenticatedImage), findsOneWidget);
    expect(find.text('brief.pdf'), findsOneWidget);
    // Only the image is fetched up front
    expect(adapter.requests.map((r) => r.path), ['/files/f1']);
  });

  testWidgets('WT-FILES-02: opening a file downloads it with the session and hands it to the share sheet',
      (tester) async {
    final (adapter, shared) = await _pump(tester, (o) => o.path == '/files/f1' ? pngBody(o) : _pdf(o));

    await tester.tap(find.byTooltip(viL10n.commonFileOpenTooltip));
    await tester.pumpAndSettle();

    expect(adapter.requests.last.path, '/files/f2');
    expect(shared.single.name, 'brief.pdf');
    expect(shared.single.mimeType, 'application/pdf');
    expect(shared.single.bytes, [37, 80, 68, 70]);
  });

  testWidgets('WT-FILES-03: a download the backend refuses is explained', (tester) async {
    final (_, shared) = await _pump(
      tester,
      (o) => o.path == '/files/f1' ? pngBody(o) : errorBody(404, 'file_not_found'),
    );

    await tester.tap(find.text('brief.pdf'));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.commonFileOpenFailed(viL10n.filesErrorFileNotFound)), findsOneWidget);
    expect(shared, isEmpty);
  });

  testWidgets('WT-FILES-04: tapping an image thumbnail opens the viewer', (tester) async {
    await _pump(tester, (o) => o.path == '/files/f1' ? pngBody(o) : _pdf(o));

    await tester.tap(find.byType(AuthenticatedImage));
    await tester.pumpAndSettle();

    expect(find.byTooltip(viL10n.filesViewerClose), findsOneWidget);
  });
}
