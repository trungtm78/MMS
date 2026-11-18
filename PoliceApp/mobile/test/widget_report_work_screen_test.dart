// Widget Tests: ReportWorkScreen — a DQTV sends a work report with photos (T20)
//   POST /files/upload (purpose=work_report) for each photo as it is picked,
//   then POST /work-reports {reportType, title, content, location?, attachmentIds?}
//   GET  /work-reports lists the reports sent, with their attachments; GET /work-reports/:id their detail
// Run: flutter test test/widget_report_work_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:police_app/features/reports/screens/report_work_screen.dart';
import 'package:police_app/shared/files/files.dart';
import 'package:police_app/shared/utils/calendar_date.dart';

import 'helpers/fake_photo_picker.dart';
import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

Map<String, Object?> _mine(
  String id, {
  String type = 'incident',
  String status = 'pending',
  String? location,
  String? reviewNote,
  List<Map<String, Object?>> attachments = const [],
}) =>
    {
      'id': id,
      'reportType': type,
      'title': 'Title $id',
      'content': 'Content $id',
      'location': location,
      'reviewStatus': status,
      'reviewNote': reviewNote,
      'createdAt': '2026-09-14T01:00:00.000Z',
      'attachments': attachments,
    };

/// The file and work-report routes the screen calls
class _Server {
  List<Map<String, Object?>> mine = [];
  ResponseBody Function(RequestOptions o)? onUpload;
  ResponseBody Function(RequestOptions o)? onCreate;
  ResponseBody? Function(RequestOptions o)? onList;
  late FakeAdapter adapter;

  List<RequestOptions> get uploads => [for (final r in adapter.requests) if (r.path == '/files/upload') r];
  List<RequestOptions> get creates =>
      [for (final r in adapter.requests) if (r.method == 'POST' && r.path == '/work-reports') r];

  ResponseBody handle(RequestOptions o) {
    if (o.path == '/files/upload') return onUpload?.call(o) ?? storedFileBody(o);
    if (o.path.startsWith('/files/')) return pngBody();
    if (o.method == 'POST') {
      final create = onCreate;
      if (create != null) return create(o);
      final body = o.data as Map;
      return jsonBody(201, {
        'id': 'new',
        'reportType': body['reportType'],
        'title': body['title'],
        'content': body['content'],
        'reviewStatus': 'pending',
      });
    }
    if (o.path == '/work-reports') {
      return onList?.call(o) ?? jsonBody(200, {'data': mine, 'total': mine.length, 'page': 1, 'limit': 20});
    }
    return jsonBody(200, mine.firstWhere((r) => o.path == '/work-reports/${r['id']}'));
  }
}

Future<_Server> _pump(
  WidgetTester tester,
  _Server server, {
  FakePhotoPicker? picker,
  Future<void> Function(RequestOptions)? gate,
}) async {
  useTallSurface(tester);
  server.adapter = FakeAdapter(server.handle, gate: gate);
  await tester.pumpWidget(scopedApp(fakeDio(server.adapter), const ReportWorkScreen(), picker: picker));
  await tester.pumpAndSettle();
  return server;
}

Finder get _content => find.widgetWithText(TextField, viL10n.reportsWorkContentHint);

void main() {
  testWidgets('WT-RW-01: photos from the camera and the gallery upload for the report and are sent with it',
      (tester) async {
    final picker = FakePhotoPicker(next: [fakePhoto('scene.jpg')]);
    final server = await _pump(tester, _Server(), picker: picker);
    expect(find.text(viL10n.reportsWorkAttachmentsLabel), findsOneWidget);
    expect(find.text(viL10n.reportsWorkSubmittedEmpty), findsOneWidget);

    await tester.tap(find.text(viL10n.filesPickCamera));
    await tester.pumpAndSettle();
    picker.next = [fakePhoto('a.jpg'), fakePhoto('b.jpg')];
    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();

    expect(picker.calls, [(PhotoSource.camera, 10), (PhotoSource.gallery, 9)]);
    expect(find.text(viL10n.filesAttachmentsCount(3, 10)), findsOneWidget);
    expect(server.uploads.map((r) => (r.data as FormData).fields.single.value), everyElement('work_report'));

    await tester.enterText(_content, 'Patrol was quiet');
    await tester.tap(find.text(viL10n.reportsWorkSubmit));
    await tester.pumpAndSettle();

    final body = server.creates.single.data as Map;
    expect(body['attachmentIds'], ['id-scene.jpg', 'id-a.jpg', 'id-b.jpg']);
    expect(body['content'], 'Patrol was quiet');
    expect(find.text(viL10n.reportsWorkSubmitSuccess), findsOneWidget);
    expect(find.text(viL10n.filesAttachmentsCount(0, 10)), findsOneWidget);
    expect(find.text('Patrol was quiet'), findsNothing);
  });

  testWidgets('WT-RW-02: the chosen type and typed location are sent, titled with the type and the Vietnamese day',
      (tester) async {
    final release = Completer<void>();
    final server = await _pump(tester, _Server(),
        gate: (o) => o.method == 'POST' && o.path == '/work-reports' ? release.future : Future<void>.value());

    await tester.tap(find.text(viL10n.reportsTypeIncident));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, viL10n.reportsWorkLocationHint), 'Phu Dinh market');
    await tester.enterText(_content, 'A small fire was put out');
    await tester.tap(find.text(viL10n.reportsWorkSubmit));
    await pumpUntil(tester, () => server.creates.isNotEmpty);

    // Nothing can be sent twice or changed while the report is on its way
    final submit = find.ancestor(
        of: find.text(viL10n.reportsWorkSubmit), matching: find.byWidgetPredicate((w) => w is ButtonStyleButton));
    expect(tester.widget<ButtonStyleButton>(submit).enabled, isFalse);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(tester.widget<AttachmentPickerField>(find.byType(AttachmentPickerField)).enabled, isFalse);

    release.complete();
    await tester.pumpAndSettle();

    expect(server.creates.single.data, {
      'reportType': 'incident',
      'title': viL10n.reportsWorkDefaultTitle(viL10n.reportsTypeIncident, toCalendarDateString(vietnamToday())),
      'content': 'A small fire was put out',
      'location': 'Phu Dinh market',
    });
  });

  testWidgets('WT-RW-03: the report waits for uploads to finish and refuses photos that failed', (tester) async {
    final release = Completer<void>();
    final server = _Server()..onUpload = (_) => errorBody(415, 'file_type_not_allowed');
    final picker = FakePhotoPicker(next: [fakePhoto('a.heic')]);
    await _pump(tester, server,
        picker: picker, gate: (o) => o.path == '/files/upload' ? release.future : Future<void>.value());
    await tester.enterText(_content, 'Patrol was quiet');

    await tester.tap(find.text(viL10n.filesPickCamera));
    await pumpUntil(tester, () => server.uploads.isNotEmpty);
    await tester.tap(find.text(viL10n.reportsWorkSubmit));
    await tester.pump();

    expect(find.text(viL10n.reportsWorkUploadsPending), findsOneWidget);
    expect(server.creates, isEmpty);

    release.complete();
    await tester.pumpAndSettle();
    await dismissSnackBars(tester);
    await tester.tap(find.text(viL10n.reportsWorkSubmit));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.reportsWorkUploadsFailed), findsOneWidget);
    expect(server.creates, isEmpty);

    await dismissSnackBars(tester);
    await tester.tap(find.byTooltip(viL10n.filesAttachmentRemove));
    await tester.pumpAndSettle();
    await tester.tap(find.text(viL10n.reportsWorkSubmit));
    await tester.pumpAndSettle();

    expect((server.creates.single.data as Map).containsKey('attachmentIds'), isFalse);
    expect(find.text(viL10n.reportsWorkSubmitSuccess), findsOneWidget);
  });

  testWidgets('WT-RW-04: a refused report shows why and keeps the photos; empty content is refused locally',
      (tester) async {
    final server = _Server()..onCreate = (_) => errorBody(409, 'file_already_attached');
    final picker = FakePhotoPicker(next: [fakePhoto('scene.jpg')]);
    await _pump(tester, server, picker: picker);

    await tester.tap(find.text(viL10n.filesPickCamera));
    await tester.pumpAndSettle();
    await tester.enterText(_content, 'Patrol was quiet');
    await tester.tap(find.text(viL10n.reportsWorkSubmit));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.filesErrorFileAlreadyAttached), findsOneWidget);
    expect(find.text(viL10n.filesAttachmentsCount(1, 10)), findsOneWidget);

    await dismissSnackBars(tester);
    await tester.enterText(_content, '   ');
    await tester.tap(find.text(viL10n.reportsWorkSubmit));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.reportsErrorContentRequired), findsOneWidget);
    expect(server.creates, hasLength(1));
  });

  testWidgets('WT-RW-05: sent reports show type, day, location, note, status and photos, and open their detail',
      (tester) async {
    final server = _Server()
      ..mine = [
        _mine('r1', status: 'rejected', location: 'Ward 5', reviewNote: 'Blurry', attachments: [fileView('f1')]),
        _mine('r2', type: 'daily'),
      ];
    var failFirst = true;
    server.onList = (_) {
      if (!failFirst) return null;
      failFirst = false;
      return errorBody(500, 'boom');
    };
    await _pump(tester, server);

    expect(find.text(viL10n.errorServer), findsOneWidget);
    await tester.tap(find.text(viL10n.commonRetry));
    await tester.pumpAndSettle();

    final day = DateFormat('dd/MM/yyyy').format(DateTime.utc(2026, 9, 14, 1).toLocal());
    expect(find.text(viL10n.reportsWorkSubmittedHeader), findsOneWidget);
    expect(find.text(viL10n.reportsWorkSubmittedSubtitle(viL10n.reportsTypeIncident, day)), findsOneWidget);
    expect(find.text(viL10n.reportsWorkSubmittedSubtitle(viL10n.reportsTypeDaily, day)), findsOneWidget);
    expect(find.text('Ward 5'), findsOneWidget);
    expect(find.text(viL10n.reportsWorkReviewNote('Blurry')), findsOneWidget);
    expect(find.text(viL10n.reportsReviewStatusRejected), findsOneWidget);
    expect(find.text(viL10n.reportsReviewStatusPending), findsOneWidget);
    expect(find.byType(AuthenticatedImage), findsOneWidget);

    await tester.tap(find.text('Content r1'));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.reportsDetailTitle), findsOneWidget);
    expect(server.adapter.requests.where((r) => r.path == '/work-reports/r1'), hasLength(1));
  });
}
