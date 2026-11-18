// Widget Tests: the work report screen (incident report)
//   POST /work-reports {reportType: incident, title, content, location, attachmentIds?}
//   (Web/backend/src/work-reports/work-reports.dto.ts); photos upload first as POST /files/upload with
//   purpose work_report (files.controller.ts), at most 10. Voice recordings stay unsupported: the server
//   accepts no audio type (files/upload-type.ts ALLOWED_UPLOAD_TYPES).
//   Refusals: 400 validation_failed shows the first class-validator message; attachment codes go
//   through the error table; 5xx says the report was not sent.
// Run: flutter test test/widget_incident_report_screen_test.dart

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:militian_app/features/files/files.dart';
import 'package:militian_app/features/incident/repositories/incident_report_repository.dart';
import 'package:militian_app/features/incident/screens/incident_report_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _l = viL10n;

final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=');

class _FakePicker implements PhotoPicker {
  List<XFile> photos = const [];
  final calls = <int>[];

  @override
  Future<List<XFile>> pick(PhotoSource source, {required int max}) async {
    calls.add(max);
    return photos;
  }
}

class _Rig {
  ResponseBody Function(RequestOptions o) report = (o) => jsonBody(201, {'id': 'r1', 'attachments': []});
  final uploadHolds = <String, Completer<void>>{};
  final uploadRefusals = <String, ResponseBody Function()>{};
  Future<({double latitude, double longitude})> Function() position =
      () async => (latitude: 10.762622, longitude: 106.660172);
  final picker = _FakePicker();

  late final adapter = FakeAdapter(
    (o) {
      if (o.path == '/files/upload') {
        final name = (o.data as FormData).files.single.value.filename!;
        final refuse = uploadRefusals[name];
        if (refuse != null) return refuse();
        return jsonBody(201, {'id': 'id-$name', 'url': '/api/v1/mms_core/files/id-$name', 'name': name, 'mimeType': 'image/png', 'size': 1});
      }
      if (o.path == '/work-reports') return report(o);
      return jsonBody(404, {'message': 'no_route ${o.method} ${o.path}'});
    },
    gate: (o) => o.path == '/files/upload'
        ? uploadHolds[(o.data as FormData).files.single.value.filename!]?.future
        : null,
  );

  Iterable<RequestOptions> get reports => adapter.requests.where((r) => r.path == '/work-reports');
  Iterable<RequestOptions> get uploads => adapter.requests.where((r) => r.path == '/files/upload');

  Future<void> open(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
    final router = GoRouter(initialLocation: '/home', routes: [
      GoRoute(
        path: '/home',
        builder: (context, state) => Scaffold(
          body: Center(child: TextButton(onPressed: () => context.push('/report'), child: const Text('home'))),
        ),
      ),
      GoRoute(path: '/report', builder: (context, state) => const IncidentReportScreen()),
    ]);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        incidentReportRepositoryProvider.overrideWithValue(IncidentReportRepository(dio)),
        filesRepositoryProvider.overrideWithValue(FilesRepository(dio)),
        photoPickerProvider.overrideWithValue(picker),
        incidentPositionProvider.overrideWithValue(() => position()),
      ],
      child: localizedRouterApp(router),
    ));
    await tester.tap(find.text('home'));
    await tester.pumpAndSettle();
  }
}

Future<void> _fill(WidgetTester tester, {String? task}) async {
  await tester.tap(find.byType(DropdownButton<String>));
  await tester.pumpAndSettle();
  await tester.tap(find.text(task ?? _l.incidentReportTaskTrafficControl).last);
  await tester.pumpAndSettle();
  await tester.enterText(find.widgetWithText(TextField, _l.incidentReportDescriptionHint), 'Traffic control at the crossroads');
  await tester.enterText(find.widgetWithText(TextField, _l.incidentReportLocationHint), 'Phu Nhuan crossroads');
  await tester.pumpAndSettle();
}

Future<void> _submit(WidgetTester tester) async {
  await tester.tap(find.text(_l.incidentReportSubmitButton));
  await tester.pumpAndSettle();
}

Future<void> _addPhotos(WidgetTester tester, _Rig r, List<String> names) async {
  r.picker.photos = [for (final n in names) XFile.fromData(_png, name: n, path: n)];
  await tester.tap(find.text(_l.filesPickCamera));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('WT-INC-01: the form: photos can be attached, voice stays unsupported, the SOS dialog closes',
      (tester) async {
    final r = _Rig();
    await r.open(tester);

    expect(find.text(_l.incidentReportScreenTitle), findsOneWidget);
    expect(find.text(_l.incidentReportPhotosSection), findsOneWidget);
    expect(find.text(_l.filesPickCamera), findsOneWidget);
    expect(find.text(_l.filesPickGallery), findsOneWidget);
    expect(find.text(_l.filesAttachmentsCount(0, IncidentReportRepository.maxAttachments)), findsOneWidget);
    expect(find.text(_l.incidentReportVoiceUnsupported), findsOneWidget);
    expect(find.byIcon(Icons.mic), findsNothing);

    await tester.tap(find.text(_l.incidentReportSosButton));
    await tester.pumpAndSettle();
    expect(find.text(_l.incidentReportSosDialogContent), findsOneWidget);
    await tester.tap(find.text(_l.commonCancelButton));
    await tester.pumpAndSettle();
    expect(find.text(_l.incidentReportSosDialogTitle), findsNothing);
    await tester.tap(find.text(_l.incidentReportSosButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_l.incidentReportSosDialogConfirm));
    await tester.pumpAndSettle();
    expect(find.text(_l.incidentReportSosDialogTitle), findsNothing);

    // Nothing filled in: the submit does nothing
    await _submit(tester);
    expect(r.reports, isEmpty);
  });

  testWidgets('WT-INC-02: a report with photos sends their ids, shows success and closes after 2 s', (tester) async {
    final r = _Rig();
    await r.open(tester);
    await _fill(tester);

    await _addPhotos(tester, r, ['a.png', 'b.png']);
    expect(r.picker.calls, [IncidentReportRepository.maxAttachments]);
    expect(r.uploads.map((o) => (o.data as FormData).fields.single.value), ['work_report', 'work_report']);
    expect(find.text(_l.filesAttachmentsCount(2, IncidentReportRepository.maxAttachments)), findsOneWidget);

    await _submit(tester);

    expect(r.reports.single.data, {
      'reportType': 'incident',
      'title': _l.incidentReportTaskTrafficControl,
      'content': 'Traffic control at the crossroads',
      'location': 'Phu Nhuan crossroads',
      'attachmentIds': ['id-a.png', 'id-b.png'],
    });
    expect(find.text(_l.incidentReportSuccessTitle), findsOneWidget);
    expect(find.text(_l.incidentReportSuccessSubtitle), findsOneWidget);

    await tester.pump(incidentReportSuccessDuration - const Duration(milliseconds: 100));
    expect(find.text(_l.incidentReportSuccessTitle), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget);
    expect(find.byType(IncidentReportScreen), findsNothing);
  });

  testWidgets('WT-INC-03: photos still uploading or failed hold the report back, with a message', (tester) async {
    final r = _Rig();
    r.uploadHolds['a.png'] = Completer<void>();
    r.uploadRefusals['b.png'] = () => jsonBody(415, backendError(415, 'file_type_not_allowed'));
    await r.open(tester);
    await _fill(tester);

    r.picker.photos = [XFile.fromData(_png, name: 'a.png', path: 'a.png'), XFile.fromData(_png, name: 'b.png', path: 'b.png')];
    await tester.tap(find.text(_l.filesPickCamera));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.text(_l.incidentReportSubmitButton));
    await tester.pump();
    expect(find.text(_l.incidentReportPhotosUploading), findsOneWidget);
    expect(r.reports, isEmpty);

    r.uploadHolds['a.png']!.complete();
    await tester.pumpAndSettle();
    ScaffoldMessenger.of(tester.element(find.byType(IncidentReportScreen))).removeCurrentSnackBar();
    await tester.pumpAndSettle();
    expect(find.text(_l.filesUploadFailedItem('b.png', _l.errorFileTypeNotAllowed)), findsOneWidget);

    await _submit(tester);
    expect(find.text(_l.incidentReportPhotosFailed), findsOneWidget);
    expect(r.reports, isEmpty);

    await tester.tap(find.byTooltip(_l.filesAttachmentRemove).last);
    await tester.pumpAndSettle();
    await _submit(tester);
    expect((r.reports.single.data as Map)['attachmentIds'], ['id-a.png']);
  });

  testWidgets('WT-INC-04: refusals are worded: validation detail, unknown 400, attachment codes, server error',
      (tester) async {
    final r = _Rig();
    await r.open(tester);
    await _fill(tester);

    for (final (answer, text) in [
      (
        jsonBody(400, {
          'code': 'E001',
          'message': 'validation_failed',
          'errors': ['location must be shorter than or equal to 255 characters'],
          'statusCode': 400,
        }),
        _l.incidentReportInvalidDetail('location must be shorter than or equal to 255 characters'),
      ),
      (jsonBody(400, {'code': 'E001', 'message': 'Bad Request Exception', 'statusCode': 400}), _l.incidentReportInvalid),
      (jsonBody(409, backendError(409, 'file_already_attached')), _l.errorFileAlreadyAttached),
      (jsonBody(400, backendError(400, 'file_purpose_mismatch')), _l.errorFilePurposeMismatch),
      (jsonBody(500, backendError(500, 'Internal server error')), _l.incidentReportServerError),
    ]) {
      r.report = (_) => answer;
      await _submit(tester);
      expect(find.text(text), findsOneWidget, reason: text);
      ScaffoldMessenger.of(tester.element(find.byType(IncidentReportScreen))).removeCurrentSnackBar();
      await tester.pumpAndSettle();
    }
    expect(r.reports, hasLength(5));
    expect(find.text(_l.incidentReportSuccessTitle), findsNothing);
  });

  testWidgets('WT-INC-05: GPS fills in the location; a failed GPS asks for an address', (tester) async {
    final r = _Rig();
    await r.open(tester);

    await tester.tap(find.byIcon(Icons.my_location));
    await tester.pumpAndSettle();
    expect(find.text(_l.incidentReportGpsValue('10.762622', '106.660172')), findsOneWidget);

    r.position = () async => throw Exception('Location permission denied');
    await tester.tap(find.byIcon(Icons.my_location));
    await tester.pumpAndSettle();
    expect(find.text(_l.incidentReportGpsFailed(_l.errorLocationPermissionDenied)), findsOneWidget);
  });

  testWidgets('WT-INC-06: the typed title of "other" is sent', (tester) async {
    final r = _Rig();
    await r.open(tester);

    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_l.incidentReportTaskOther).last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, _l.incidentReportCustomTitleHint), ' Night patrol ');
    await tester.enterText(find.widgetWithText(TextField, _l.incidentReportDescriptionHint), 'Quiet night');
    await tester.enterText(find.widgetWithText(TextField, _l.incidentReportLocationHint), 'Ward 3');
    await tester.pumpAndSettle();
    await _submit(tester);

    expect(r.reports.single.data, {
      'reportType': 'incident',
      'title': 'Night patrol',
      'content': 'Quiet night',
      'location': 'Ward 3',
    });
  });

  testWidgets('WT-INC-07: leaving during the success message does not pop twice', (tester) async {
    final r = _Rig();
    await r.open(tester);
    await _fill(tester, task: _l.incidentReportTaskMarketPatrol);
    await _submit(tester);
    expect(find.text(_l.incidentReportSuccessTitle), findsOneWidget);

    // The system back button: the success message has no back control of its own
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget);
    await tester.pump(incidentReportSuccessDuration);
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
