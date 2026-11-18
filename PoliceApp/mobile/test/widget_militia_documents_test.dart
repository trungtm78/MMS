// Widget Tests: staff adding documents to a militia profile (DQTV detail screen)
//   POST /files/upload (purpose=militia_profile) → a stored file per document
//   POST /militia/:id/documents {fileIds} → 201 the attached files; staff roles only (403 otherwise);
//        file_not_found, file_already_attached, file_purpose_mismatch refuse all of them
//   GET  /militia/:id/documents → [{id, url, name, mimeType, size}], newest first
//   (Web/backend/src/militia/militia.controller.ts, militia.service.ts attachMilitiaDocuments)
// Run: flutter test test/widget_militia_documents_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/dqtv/screens/dqtv_detail_screen.dart';
import 'package:police_app/features/dqtv/widgets/militia_documents_section.dart';
import 'package:police_app/shared/files/files.dart';

import 'helpers/fake_photo_picker.dart';
import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

class _Backend {
  List<Map<String, Object?>> documents = [fileView('d0', name: 'old.pdf', mimeType: 'application/pdf')];
  int uploadStatus = 201;
  int attachStatus = 201;
  String attachCode = '';
  Future<void> Function(RequestOptions)? gate;

  ResponseBody handle(RequestOptions o) {
    switch ((o.method, o.path)) {
      case ('GET', '/militia/mp-1'):
        return jsonBody(200, {'id': 'mp-1', 'userId': null, 'fullName': 'Nguyen Van A', 'status': 'active'});
      case ('GET', '/militia/mp-1/documents'):
        return jsonBody(200, documents);
      case ('POST', '/militia/mp-1/documents'):
        if (attachStatus != 201) return errorBody(attachStatus, attachCode);
        final attached = [for (final id in (o.data as Map)['fileIds'] as List) fileView(id as String)];
        documents = [...attached, ...documents];
        return jsonBody(201, attached);
      case ('POST', '/files/upload'):
        return uploadStatus == 201 ? storedFileBody(o) : jsonBody(uploadStatus, {'statusCode': uploadStatus});
    }
    return o.path.startsWith('/files/') ? pngBody(o) : jsonBody(404, {'statusCode': 404});
  }
}

Future<(FakeAdapter, FakePhotoPicker)> _pump(WidgetTester tester, _Backend backend, {bool? staff = true}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(backend.handle, gate: (o) => backend.gate?.call(o) ?? Future<void>.value());
  final picker = FakePhotoPicker();
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(MemoryStorage(access: null, refresh: null)),
      dioProvider.overrideWithValue(fakeDio(adapter)),
      photoPickerProvider.overrideWithValue(picker),
      // null: the role the signed-in session holds decides
      if (staff != null) canAttachMilitiaDocumentsProvider.overrideWithValue(staff),
    ],
    child: localizedApp(const DqtvDetailScreen(userId: 'mp-1')),
  ));
  await tester.pumpAndSettle();
  return (adapter, picker);
}

Finder get _save => find.widgetWithText(ElevatedButton, viL10n.dqtvDocumentsSave);

List<RequestOptions> _attaches(FakeAdapter adapter) =>
    adapter.requests.where((r) => r.method == 'POST' && r.path == '/militia/mp-1/documents').toList();

void _dismissSnackBar(WidgetTester tester) =>
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).removeCurrentSnackBar();

void main() {
  testWidgets('WT-MDOC-01: staff upload documents for the profile, attach them, and see the list reloaded',
      (tester) async {
    final (adapter, picker) = await _pump(tester, _Backend());
    expect(_save, findsNothing);
    picker.next = [fakePhoto('scan-1.jpg'), fakePhoto('scan-2.jpg')];

    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();

    final uploads = adapter.requests.where((r) => r.path == '/files/upload').toList();
    expect(uploads, hasLength(2));
    // MapEntry has no value equality: compare as records
    expect((uploads.first.data as FormData).fields.map((f) => (f.key, f.value)),
        contains(('purpose', 'militia_profile')));

    await tester.tap(_save);
    await tester.pumpAndSettle();

    expect(_attaches(adapter).single.data, {
      'fileIds': ['id-scan-1.jpg', 'id-scan-2.jpg'],
    });
    expect(find.text(viL10n.dqtvDocumentsSaved), findsOneWidget);
    expect(adapter.requests.where((r) => r.method == 'GET' && r.path == '/militia/mp-1/documents'), hasLength(2));
    expect(find.byType(AuthenticatedImage), findsNWidgets(2));
    expect(find.text('old.pdf'), findsOneWidget);
    // The picked documents are attached: nothing is left to save
    expect(_save, findsNothing);
  });

  testWidgets('WT-MDOC-02: saving waits for documents still uploading', (tester) async {
    final backend = _Backend();
    final release = Completer<void>();
    backend.gate = (o) => o.path == '/files/upload' ? release.future : Future<void>.value();
    final (adapter, picker) = await _pump(tester, backend);
    picker.next = [fakePhoto('scan.jpg')];

    await tester.tap(find.text(viL10n.filesPickCamera));
    await pumpUntil(tester, () => adapter.requests.any((r) => r.path == '/files/upload'));
    await tester.tap(_save);
    await tester.pump();

    expect(find.text(viL10n.dqtvDocumentsUploading), findsOneWidget);
    expect(_attaches(adapter), isEmpty);

    release.complete();
    await tester.pumpAndSettle();
    _dismissSnackBar(tester);
    await tester.pumpAndSettle();
    await tester.tap(_save);
    await tester.pumpAndSettle();

    expect(_attaches(adapter), hasLength(1));
  });

  testWidgets('WT-MDOC-03: a failed upload blocks saving until it is removed', (tester) async {
    final (adapter, picker) = await _pump(tester, _Backend()..uploadStatus = 500);
    picker.next = [fakePhoto('scan.jpg')];

    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();
    await tester.tap(_save);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.dqtvDocumentsUploadFailed), findsOneWidget);
    expect(_attaches(adapter), isEmpty);

    _dismissSnackBar(tester);
    await tester.tap(find.byTooltip(viL10n.filesAttachmentRemove));
    await tester.pumpAndSettle();
    expect(_save, findsNothing);
  });

  testWidgets('WT-MDOC-04: a refused attach is explained and the uploads stay for another try', (tester) async {
    final backend = _Backend()
      ..attachStatus = 409
      ..attachCode = 'file_already_attached';
    final (adapter, picker) = await _pump(tester, backend);
    picker.next = [fakePhoto('scan.jpg')];

    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();
    await tester.tap(_save);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.dqtvDocumentsSaveFailed(viL10n.filesErrorFileAlreadyAttached)), findsOneWidget);
    expect(tester.widget<ElevatedButton>(_save).onPressed, isNotNull);

    backend
      ..attachStatus = 403
      ..attachCode = 'insufficient_role';
    _dismissSnackBar(tester);
    await tester.pumpAndSettle();
    await tester.tap(_save);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.dqtvDocumentsSaveFailed(viL10n.errorForbidden)), findsOneWidget);
    expect(_attaches(adapter), hasLength(2));
  });

  testWidgets('WT-MDOC-05: while saving nothing can be changed or saved again', (tester) async {
    final backend = _Backend();
    final release = Completer<void>();
    backend.gate =
        (o) => o.method == 'POST' && o.path == '/militia/mp-1/documents' ? release.future : Future<void>.value();
    final (adapter, picker) = await _pump(tester, backend);
    picker.next = [fakePhoto('scan.jpg')];

    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();
    await tester.tap(_save);
    await pumpUntil(tester, () => _attaches(adapter).isNotEmpty);

    final saving = find.widgetWithText(ElevatedButton, viL10n.dqtvDocumentsSaving);
    expect(tester.widget<ElevatedButton>(saving).onPressed, isNull);
    expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, viL10n.filesPickGallery)).onPressed,
        isNull);

    release.complete();
    await tester.pumpAndSettle();
    expect(find.text(viL10n.dqtvDocumentsSaved), findsOneWidget);
  });

  testWidgets('WT-MDOC-06: without a staff session the documents are read-only', (tester) async {
    await _pump(tester, _Backend(), staff: null);

    expect(find.text('old.pdf'), findsOneWidget);
    expect(find.text(viL10n.filesPickGallery), findsNothing);
    expect(_save, findsNothing);
  });
}
