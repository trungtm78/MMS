// Widget Tests: task completion report (DQTV)
//   POST /files/upload (multipart file, purpose=task_report) → a stored file per photo
//   POST /tasks/:id/report {description, location?, photoIds?} → 201 {id, taskId, submittedAt, photos}
//        409 task_closed on a completed or cancelled task; file link refusals (file_purpose_mismatch, ...)
//        (Web/backend/src/tasks/tasks.controller.ts SubmitReportDto, tasks.service.ts submitReport)
//   GET  /files/:id → the photos shown in the result
// Run: flutter test test/widget_task_report_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:police_app/features/tasks/screens/task_report_screen.dart';
import 'package:police_app/shared/files/files.dart';

import 'helpers/fake_photo_picker.dart';
import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

class _Launcher extends StatefulWidget {
  const _Launcher();
  @override
  State<_Launcher> createState() => _LauncherState();
}

class _LauncherState extends State<_Launcher> {
  bool? _result;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: [
          ElevatedButton(
            onPressed: () async {
              final sent = await Navigator.of(context).push<bool>(
                MaterialPageRoute(builder: (_) => const TaskReportScreen(taskId: 't-1')),
              );
              setState(() => _result = sent);
            },
            child: const Text('open'),
          ),
          Text('result: $_result'),
        ]),
      );
}

class _Backend {
  int uploadStatus = 201;
  int reportStatus = 201;
  String reportCode = '';
  Future<void> Function(RequestOptions)? gate;

  ResponseBody handle(RequestOptions o) {
    if (o.path == '/files/upload') {
      return uploadStatus == 201 ? storedFileBody(o) : jsonBody(uploadStatus, {'statusCode': uploadStatus});
    }
    if (o.path.startsWith('/files/')) return pngBody(o);
    if (o.path == '/tasks/t-1/report') {
      if (reportStatus != 201) return errorBody(reportStatus, reportCode);
      final ids = ((o.data as Map)['photoIds'] as List?) ?? const [];
      return jsonBody(201, {
        'id': 'r-1',
        'taskId': 't-1',
        'submittedAt': '2026-09-14T03:00:00.000Z',
        'photos': [for (final id in ids) fileView(id as String)],
      });
    }
    return jsonBody(404, {'statusCode': 404});
  }
}

Future<(FakeAdapter, FakePhotoPicker)> _open(WidgetTester tester, _Backend backend) async {
  tester.view.physicalSize = const Size(900, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(backend.handle, gate: (o) => backend.gate?.call(o) ?? Future<void>.value());
  final picker = FakePhotoPicker();
  await tester.pumpWidget(scopedApp(fakeDio(adapter), const _Launcher(), picker: picker));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return (adapter, picker);
}

Finder get _description => find.byType(TextFormField).at(0);
Finder get _location => find.byType(TextFormField).at(1);
Finder get _submit => find.widgetWithText(ElevatedButton, viL10n.tasksReportSubmit);

List<RequestOptions> _reports(FakeAdapter adapter) =>
    adapter.requests.where((r) => r.path == '/tasks/t-1/report').toList();

List<RequestOptions> _uploads(FakeAdapter adapter) =>
    adapter.requests.where((r) => r.path == '/files/upload').toList();

void _dismissSnackBar(WidgetTester tester) =>
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).removeCurrentSnackBar();

void main() {
  testWidgets('WT-TREP-01: the description is required before anything is sent', (tester) async {
    final (adapter, _) = await _open(tester, _Backend());

    expect(find.text(viL10n.tasksReportTitle), findsOneWidget);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksErrorReportDescriptionRequired), findsOneWidget);
    expect(adapter.requests, isEmpty);
  });

  testWidgets('WT-TREP-02: photos are uploaded for the task report, sent by id, and the result is shown',
      (tester) async {
    final (adapter, picker) = await _open(tester, _Backend());
    picker.next = [fakePhoto('a.jpg'), fakePhoto('b.jpg')];

    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();

    expect(picker.calls.single, (PhotoSource.gallery, 10));
    expect(_uploads(adapter), hasLength(2));
    for (final upload in _uploads(adapter)) {
      // MapEntry has no value equality: compare as records
      expect((upload.data as FormData).fields.map((f) => (f.key, f.value)), contains(('purpose', 'task_report')));
    }

    await tester.enterText(_description, ' Patrolled block 3 ');
    await tester.enterText(_location, 'Gate A');
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(_reports(adapter).single.data, {
      'description': 'Patrolled block 3',
      'location': 'Gate A',
      'photoIds': ['id-a.jpg', 'id-b.jpg'],
    });
    expect(find.text(viL10n.tasksReportSent), findsOneWidget);
    final sentAt = DateFormat('dd/MM/yyyy HH:mm').format(DateTime.utc(2026, 9, 14, 3).toLocal());
    expect(find.text(viL10n.tasksReportSentAt(sentAt)), findsOneWidget);
    expect(find.text(viL10n.tasksReportSentPhotos(2)), findsOneWidget);
    expect(find.byType(AuthenticatedImage), findsNWidgets(2));
    expect(adapter.requests.where((r) => r.path == '/files/id-a.jpg'), hasLength(1));

    await tester.tap(find.widgetWithText(ElevatedButton, viL10n.tasksReportDone));
    await tester.pumpAndSettle();
    expect(find.text('result: true'), findsOneWidget);
  });

  testWidgets('WT-TREP-03: a task closed meanwhile is explained and the form stays', (tester) async {
    final (_, _) = await _open(
      tester,
      _Backend()
        ..reportStatus = 409
        ..reportCode = 'task_closed',
    );

    await tester.enterText(_description, 'Done');
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksReportFailed(viL10n.tasksErrorTaskClosed)), findsOneWidget);
    expect(find.text(viL10n.tasksReportSent), findsNothing);
    expect(tester.widget<ElevatedButton>(_submit).onPressed, isNotNull);
  });

  testWidgets('WT-TREP-04: a photo the backend will not link is explained', (tester) async {
    final (_, _) = await _open(
      tester,
      _Backend()
        ..reportStatus = 400
        ..reportCode = 'file_purpose_mismatch',
    );

    await tester.enterText(_description, 'Done');
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksReportFailed(viL10n.filesErrorFilePurposeMismatch)), findsOneWidget);
  });

  testWidgets('WT-TREP-05: the report waits for photos still uploading', (tester) async {
    final backend = _Backend();
    final release = Completer<void>();
    backend.gate = (o) => o.path == '/files/upload' ? release.future : Future<void>.value();
    final (adapter, picker) = await _open(tester, backend);
    picker.next = [fakePhoto('a.jpg')];

    await tester.tap(find.text(viL10n.filesPickCamera));
    await pumpUntil(tester, () => _uploads(adapter).isNotEmpty);
    await tester.enterText(_description, 'Done');
    await tester.tap(_submit);
    await tester.pump();

    expect(find.text(viL10n.tasksReportPhotosUploading), findsOneWidget);
    expect(_reports(adapter), isEmpty);

    release.complete();
    await tester.pumpAndSettle();
    _dismissSnackBar(tester);
    await tester.pumpAndSettle();
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect((_reports(adapter).single.data as Map)['photoIds'], ['id-a.jpg']);
  });

  testWidgets('WT-TREP-06: a failed upload blocks the report until it is removed', (tester) async {
    final (adapter, picker) = await _open(tester, _Backend()..uploadStatus = 500);
    picker.next = [fakePhoto('a.jpg')];

    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();
    await tester.enterText(_description, 'Done');
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksReportPhotosFailed), findsOneWidget);
    expect(_reports(adapter), isEmpty);

    _dismissSnackBar(tester);
    await tester.tap(find.byTooltip(viL10n.filesAttachmentRemove));
    await tester.pumpAndSettle();
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(_reports(adapter).single.data, {'description': 'Done'});
    expect(find.text(viL10n.tasksReportSent), findsOneWidget);
    expect(find.text(viL10n.tasksReportSentPhotos(0)), findsNothing);
  });

  testWidgets('WT-TREP-07: while sending nothing can be changed or sent again', (tester) async {
    final backend = _Backend();
    final release = Completer<void>();
    backend.gate = (o) => o.path == '/tasks/t-1/report' ? release.future : Future<void>.value();
    final (adapter, _) = await _open(tester, backend);

    await tester.enterText(_description, 'Done');
    await tester.tap(_submit);
    await pumpUntil(tester, () => _reports(adapter).isNotEmpty);

    final sending = find.widgetWithText(ElevatedButton, viL10n.tasksReportSubmitting);
    expect(tester.widget<ElevatedButton>(sending).onPressed, isNull);
    expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, viL10n.filesPickGallery)).onPressed,
        isNull);

    release.complete();
    await tester.pumpAndSettle();
    expect(_reports(adapter), hasLength(1));
    expect(find.text(viL10n.tasksReportSent), findsOneWidget);
  });
}
