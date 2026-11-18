// Widget Tests: create-task screen (CA)
//   GET  /militia?limit=100 → {data, total, page, limit}   (militia.controller.ts, militia.service.ts)
//   POST /tasks {title, description?, priority, deadline?, locationName?, locationLat?, locationLng?,
//               assigneeMilitiaId} (Web/backend/src/tasks/tasks.controller.ts:47-102)
// The device position comes through currentPositionProvider, so no platform channel is used.
// Run: flutter test test/widget_create_task_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/tasks/screens/create_task_screen.dart';
import 'package:police_app/shared/errors/app_failure.dart';
import 'package:police_app/shared/files/files.dart';

import 'helpers/fake_photo_picker.dart';
import 'helpers/fakes.dart';
import 'helpers/l10n.dart';
import 'helpers/reports_harness.dart';

const _militia = {
  'data': [
    {'id': 'mp-1', 'userId': 'u-1', 'militiaCode': 'DQ-001', 'fullName': 'Nguyen Van A'},
    {'id': 'mp-2', 'userId': 'u-2', 'militiaCode': '', 'fullName': 'Tran Van B'},
  ],
  'total': 2,
  'page': 1,
  'limit': 100,
};

class _Backend {
  _Backend({this.militiaStatus = 200, this.createStatus = 201, this.createCode});

  int militiaStatus;
  final int createStatus;
  final String? createCode;
  int uploadStatus = 201;

  ResponseBody handle(RequestOptions o) {
    if (o.path == '/files/upload') {
      return uploadStatus == 201 ? storedFileBody(o) : jsonBody(uploadStatus, {'statusCode': uploadStatus});
    }
    if (o.path == '/militia') {
      return militiaStatus == 200 ? jsonBody(200, _militia) : jsonBody(militiaStatus, {'statusCode': militiaStatus});
    }
    if (o.path == '/tasks' && o.method == 'POST') {
      if (createStatus != 201) {
        return jsonBody(createStatus, {'code': 'E004', 'message': createCode, 'statusCode': createStatus});
      }
      return jsonBody(201, {'id': 't-1', 'code': 'TASK-20260914-ABC123', 'title': (o.data as Map)['title']});
    }
    return jsonBody(404, {'statusCode': 404});
  }
}

typedef _Position = Future<DevicePosition> Function();

Future<FakeAdapter> _open(
  WidgetTester tester,
  _Backend backend, {
  _Position? position,
  Future<void> Function(RequestOptions)? gate,
  FakePhotoPicker? picker,
}) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final adapter = FakeAdapter(backend.handle, gate: gate);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final router = GoRouter(routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => Scaffold(
        body: Center(child: ElevatedButton(onPressed: () => context.push('/create'), child: const Text('open'))),
      ),
    ),
    GoRoute(path: '/create', builder: (context, state) => const CreateTaskScreen()),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      dioProvider.overrideWithValue(dio),
      photoPickerProvider.overrideWithValue(picker ?? FakePhotoPicker()),
      currentPositionProvider.overrideWithValue(
        position ?? () async => (latitude: 10.729123, longitude: 106.643789),
      ),
    ],
    child: localizedRouterApp(router),
  ));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return adapter;
}

Finder _field(int index) => find.byType(TextFormField).at(index);
Finder get _submit => find.widgetWithText(ElevatedButton, viL10n.tasksCreateSubmit);

Future<void> _choose(WidgetTester tester, Finder dropdown, String item) async {
  await tester.tap(dropdown);
  await tester.pumpAndSettle();
  await tester.tap(find.text(item).last);
  await tester.pumpAndSettle();
}

Future<void> _chooseAssignee(WidgetTester tester) =>
    _choose(tester, find.byType(DropdownButtonFormField<String>).last, 'Nguyen Van A (DQ-001)');

List<RequestOptions> _posts(FakeAdapter a) => a.requests.where((r) => r.method == 'POST').toList();

List<RequestOptions> _creates(FakeAdapter a) => a.requests.where((r) => r.path == '/tasks').toList();

void _dismissSnackBar(WidgetTester tester) =>
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).removeCurrentSnackBar();

void main() {
  testWidgets('WT-TASK-C01: a filled form posts the task body and returns to the previous screen', (tester) async {
    final adapter = await _open(tester, _Backend());

    expect(find.text(viL10n.tasksCreateTitle), findsOneWidget);
    expect(adapter.requests.first.queryParameters, {'limit': 100});

    await tester.enterText(_field(0), ' Patrol ');
    await tester.enterText(_field(1), 'Block 3');
    await tester.enterText(_field(2), 'Phu Dinh market');
    await _choose(tester, find.byType(DropdownButtonFormField<String>).first, viL10n.tasksPriorityHigh);
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(_posts(adapter).single.data, {
      'title': 'Patrol',
      'description': 'Block 3',
      'priority': 'high',
      'locationName': 'Phu Dinh market',
      'assigneeMilitiaId': 'mp-1',
    });
    expect(find.text(viL10n.tasksCreateSuccess), findsOneWidget);
    expect(find.byType(CreateTaskScreen), findsNothing);
  });

  testWidgets('WT-TASK-C02: the title and the assignee are required before anything is sent', (tester) async {
    final adapter = await _open(tester, _Backend());

    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksCreateTitleRequired), findsOneWidget);
    expect(find.text(viL10n.tasksCreateAssigneeRequired), findsOneWidget);
    expect(_posts(adapter), isEmpty);
  });

  testWidgets('WT-TASK-C03: the militia list failing shows why, and retry loads it', (tester) async {
    final backend = _Backend(militiaStatus: 500);
    final adapter = await _open(tester, backend);

    expect(find.text(viL10n.tasksCreateAssigneesLoadFailed(viL10n.errorServer)), findsOneWidget);

    // Without the list no assignee can be chosen
    await tester.enterText(_field(0), 'Patrol');
    await tester.tap(_submit);
    await tester.pumpAndSettle();
    expect(find.text(viL10n.tasksCreateAssigneeRequired), findsOneWidget);
    expect(_posts(adapter), isEmpty);

    backend.militiaStatus = 200;
    await tester.tap(find.widgetWithText(TextButton, viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksCreateAssigneeHint), findsOneWidget);
    expect(adapter.requests.where((r) => r.path == '/militia'), hasLength(2));
  });

  testWidgets('WT-TASK-C04: a militia list that is not the envelope is reported as unreadable', (tester) async {
    tester.view.physicalSize = const Size(900, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final adapter = FakeAdapter((o) => o.path == '/militia' ? jsonBody(200, ['mp-1']) : jsonBody(404, {}));
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
    await tester.pumpWidget(ProviderScope(
      overrides: [dioProvider.overrideWithValue(dio)],
      child: localizedApp(const CreateTaskScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksCreateAssigneesLoadFailed(viL10n.errorBadResponse)), findsOneWidget);
  });

  testWidgets('WT-TASK-C05: the device position is attached, sent, and can be removed', (tester) async {
    final adapter = await _open(tester, _Backend());

    expect(find.text(viL10n.tasksCreateNoCoordinates), findsOneWidget);
    await tester.tap(find.text(viL10n.tasksCreateUseCurrentLocation));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.tasksCreateCoordinates('10.72912', '106.64379')), findsOneWidget);

    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    final body = _posts(adapter).single.data as Map;
    expect(body['locationLat'], 10.729123);
    expect(body['locationLng'], 106.643789);
    expect(body['priority'], 'medium');
  });

  testWidgets('WT-TASK-C06: removing the coordinates sends none', (tester) async {
    final adapter = await _open(tester, _Backend());

    await tester.tap(find.text(viL10n.tasksCreateUseCurrentLocation));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip(viL10n.tasksCreateClearCoordinatesTooltip));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.tasksCreateNoCoordinates), findsOneWidget);

    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    final body = _posts(adapter).single.data as Map;
    expect(body.containsKey('locationLat'), isFalse);
    expect(body.containsKey('locationLng'), isFalse);
  });

  testWidgets('WT-TASK-C07: a refused location permission is explained', (tester) async {
    await _open(tester, _Backend(), position: () async => throw const AppFailure(AppFailure.locationPermission));

    await tester.tap(find.text(viL10n.tasksCreateUseCurrentLocation));
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksCreateLocationFailed(viL10n.errorLocationPermission)), findsOneWidget);
    expect(find.text(viL10n.tasksCreateNoCoordinates), findsOneWidget);
  });

  testWidgets('WT-TASK-C08: a position outside the valid range is refused before sending', (tester) async {
    final adapter = await _open(tester, _Backend(), position: () async => (latitude: 95.0, longitude: 106.0));

    await tester.tap(find.text(viL10n.tasksCreateUseCurrentLocation));
    await tester.pumpAndSettle();
    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksCreateInvalid(viL10n.tasksErrorLatitudeOutOfRange)), findsOneWidget);
    expect(_posts(adapter), isEmpty);
  });

  testWidgets('WT-TASK-C09: the backend refusing the assignee is shown and the form stays', (tester) async {
    await _open(tester, _Backend(createStatus: 403, createCode: 'dqtv_not_assigned_to_ca'));

    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksCreateFailed(viL10n.tasksErrorDqtvNotAssignedToCa)), findsOneWidget);
    expect(find.byType(CreateTaskScreen), findsOneWidget);
    expect(_submit, findsOneWidget);
  });

  testWidgets('WT-TASK-C10: while sending the button says so and cannot be pressed again', (tester) async {
    final release = Completer<void>();
    final adapter = await _open(
      tester,
      _Backend(),
      gate: (o) => o.method == 'POST' ? release.future : Future<void>.value(),
    );

    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pump();

    final sending = find.widgetWithText(ElevatedButton, viL10n.tasksCreateSubmitting);
    expect(sending, findsOneWidget);
    expect(tester.widget<ElevatedButton>(sending).onPressed, isNull);

    release.complete();
    await tester.pumpAndSettle();
    expect(_posts(adapter), hasLength(1));
  });

  testWidgets('WT-TASK-C12: attached photos are uploaded for tasks and sent by id', (tester) async {
    final picker = FakePhotoPicker(next: [fakePhoto('a.jpg'), fakePhoto('b.jpg')]);
    final adapter = await _open(tester, _Backend(), picker: picker);

    expect(find.text(viL10n.tasksCreateAttachmentsLabel), findsOneWidget);
    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();

    expect(picker.calls.single, (PhotoSource.gallery, 10));
    final uploads = adapter.requests.where((r) => r.path == '/files/upload').toList();
    expect(uploads, hasLength(2));
    // MapEntry has no value equality: compare as records
    expect((uploads.first.data as FormData).fields.map((f) => (f.key, f.value)), contains(('purpose', 'task')));

    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect((_creates(adapter).single.data as Map)['attachmentIds'], ['id-a.jpg', 'id-b.jpg']);
    expect(find.byType(CreateTaskScreen), findsNothing);
  });

  testWidgets('WT-TASK-C13: the task waits for attachments still uploading', (tester) async {
    final release = Completer<void>();
    final adapter = await _open(
      tester,
      _Backend(),
      picker: FakePhotoPicker(next: [fakePhoto('a.jpg')]),
      gate: (o) => o.path == '/files/upload' ? release.future : Future<void>.value(),
    );
    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);

    await tester.tap(find.text(viL10n.filesPickCamera));
    await pumpUntil(tester, () => adapter.requests.any((r) => r.path == '/files/upload'));
    await tester.tap(_submit);
    await tester.pump();

    expect(find.text(viL10n.tasksCreateAttachmentsUploading), findsOneWidget);
    expect(_creates(adapter), isEmpty);

    release.complete();
    await tester.pumpAndSettle();
    _dismissSnackBar(tester);
    await tester.pumpAndSettle();
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect((_creates(adapter).single.data as Map)['attachmentIds'], ['id-a.jpg']);
  });

  testWidgets('WT-TASK-C14: a failed upload blocks the task until it is removed', (tester) async {
    final adapter = await _open(
      tester,
      _Backend()..uploadStatus = 500,
      picker: FakePhotoPicker(next: [fakePhoto('a.jpg')]),
    );
    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();
    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);

    await tester.tap(_submit);
    await tester.pumpAndSettle();
    expect(find.text(viL10n.tasksCreateAttachmentsFailed), findsOneWidget);
    expect(_creates(adapter), isEmpty);

    _dismissSnackBar(tester);
    await tester.tap(find.byTooltip(viL10n.filesAttachmentRemove));
    await tester.pumpAndSettle();
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect((_creates(adapter).single.data as Map).containsKey('attachmentIds'), isFalse);
  });

  testWidgets('WT-TASK-C15: a file the backend will not attach is explained and no task is made', (tester) async {
    await _open(
      tester,
      _Backend(createStatus: 409, createCode: 'file_already_attached'),
      picker: FakePhotoPicker(next: [fakePhoto('a.jpg')]),
    );
    await tester.tap(find.text(viL10n.filesPickGallery));
    await tester.pumpAndSettle();
    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    expect(find.text(viL10n.tasksCreateFailed(viL10n.filesErrorFileAlreadyAttached)), findsOneWidget);
    expect(find.byType(CreateTaskScreen), findsOneWidget);
  });

  testWidgets('WT-TASK-C11: a chosen deadline is shown and sent', (tester) async {
    final adapter = await _open(tester, _Backend());
    final ok = MaterialLocalizations.of(tester.element(find.byType(CreateTaskScreen))).okButtonLabel;

    await tester.tap(find.text(viL10n.tasksCreateDeadlineHint));
    await tester.pumpAndSettle();
    await tester.tap(find.text(ok));
    await tester.pumpAndSettle();
    await tester.tap(find.text(ok));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.tasksCreateDeadlineHint), findsNothing);

    await tester.enterText(_field(0), 'Patrol');
    await _chooseAssignee(tester);
    await tester.tap(_submit);
    await tester.pumpAndSettle();

    final deadline = DateTime.parse((_posts(adapter).single.data as Map)['deadline'] as String);
    expect(deadline.isAfter(DateTime.now()), isTrue);
  });
}
