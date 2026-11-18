// Widget Tests: training management screen (CA)
//   GET  /users/me                       → the profile itself, with unitScope (users.service.ts:55-75)
//   GET  /training?unitCode=&limit=      → {data, total, page, limit} (training.service.ts listRecords)
//   GET  /militia?q=&limit=10            → {data, total, page, limit} (DQTV picker)
//   POST /training {militiaId, trainingType, fromDate, toDate, totalDays, location?, instructor?, result?}
//        (Web/backend/src/training/dto/create-training.dto.ts)
// Run: flutter test test/widget_training_management_screen_test.dart

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/training/training_management_screen.dart';
import 'package:police_app/shared/utils/calendar_date.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

final _records = [
  {
    'id': 'tr-1',
    'militiaId': 'mp-1',
    'militiaName': 'Nguyen Van A',
    'militiaCode': 'DQ-001',
    'trainingType': 'military',
    'fromDate': '2026-09-01',
    'toDate': '2026-09-15',
    'totalDays': '15.0',
    'location': 'Field A',
    'instructor': 'Officer B',
    'result': 'pass',
  },
  {
    'id': 'tr-2',
    'militiaId': 'mp-2',
    'militiaName': 'Tran Van B',
    'militiaCode': 'DQ-002',
    'trainingType': 'fire',
    'fromDate': '2026-08-01',
    'toDate': '2026-08-03',
    'totalDays': '2.5',
    'location': null,
    'instructor': null,
    'result': 'fail',
  },
  {
    'id': 'tr-3',
    'militiaId': 'mp-3',
    'militiaName': null,
    'militiaCode': null,
    'trainingType': 'swimming',
    'fromDate': '2026-07-01',
    'toDate': '2026-07-01',
    'totalDays': 1,
    'result': 'not_evaluated',
  },
  {'id': 'tr-4', 'trainingType': null, 'totalDays': 1, 'result': 'not_evaluated'},
];

class _Backend {
  int profileStatus = 200;
  int trainingStatus = 200;
  int createStatus = 201;
  bool badTrainingBody = false;
  List<Map<String, Object?>> records = _records;
  ResponseBody Function(RequestOptions)? militia;
  Future<void> Function(RequestOptions)? gate;

  ResponseBody handle(RequestOptions o) {
    switch ((o.method, o.path)) {
      case ('GET', '/users/me'):
        return profileStatus == 200
            ? jsonBody(200, {'id': 'u-ca', 'username': 'ca01', 'unitScope': 'KP1'})
            : jsonBody(profileStatus, {'statusCode': profileStatus});
      case ('GET', '/training'):
        if (badTrainingBody) return jsonBody(200, ['tr-1']);
        return trainingStatus == 200
            ? jsonBody(200, {'data': records, 'total': records.length, 'page': 1, 'limit': 100})
            : jsonBody(trainingStatus, {'statusCode': trainingStatus});
      case ('GET', '/militia'):
        return militia?.call(o) ??
            jsonBody(200, {
              'data': [
                {'id': 'mp-1', 'militiaCode': 'DQ-001', 'fullName': 'Nguyen Van A', 'unitName': 'Block 1'},
              ],
              'total': 12,
              'page': 1,
              'limit': 10,
            });
      case ('POST', '/training'):
        return createStatus == 201
            ? jsonBody(201, {'id': 'tr-new'})
            : jsonBody(createStatus, {
                'code': 'E004',
                'message': 'insufficient_role_to_create_training',
                'statusCode': createStatus,
              });
    }
    return jsonBody(404, {'statusCode': 404});
  }
}

Future<FakeAdapter> _pump(WidgetTester tester, _Backend backend) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(backend.handle, gate: (o) => backend.gate?.call(o) ?? Future<void>.value());
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [dioProvider.overrideWithValue(dio)],
    child: localizedApp(const TrainingManagementScreen()),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _openForm(WidgetTester tester) =>
    _tap(tester, find.widgetWithText(FloatingActionButton, viL10n.trainingManagementAddButton));

Future<void> _pickBothDates(WidgetTester tester) async {
  final ok = MaterialLocalizations.of(tester.element(find.widgetWithText(BottomSheet, viL10n.trainingFormTitle))).okButtonLabel;
  await _tap(tester, find.text(viL10n.trainingFormDateHint).first);
  await _tap(tester, find.text(ok));
  await _tap(tester, find.text(viL10n.trainingFormDateHint));
  await _tap(tester, find.text(ok));
}

Future<void> _pickMilitia(WidgetTester tester) async {
  await _tap(tester, find.text(viL10n.trainingFormMilitiaHint));
  await tester.enterText(find.byType(TextField).last, 'Ng');
  await tester.pumpAndSettle();
  await _tap(tester, find.text('Nguyen Van A'));
}

Finder get _save => find.widgetWithText(ElevatedButton, viL10n.trainingFormSave);

/// The number of days: the first field of the add form
Finder get _days => find.byType(TextFormField).first;

void main() {
  testWidgets('WT-TRN-01: lists the records of the caller unit with their type, days and outcome', (tester) async {
    final adapter = await _pump(tester, _Backend());

    expect(adapter.requests.map((r) => r.path), ['/users/me', '/training']);
    expect(adapter.requests.last.queryParameters, {'unitCode': 'KP1', 'limit': 100});

    expect(find.text(viL10n.trainingManagementTitle), findsOneWidget);
    expect(find.text('1/4 ${viL10n.trainingManagementSummary(15)}'), findsOneWidget);
    // Chip and card both say the type
    expect(find.text(viL10n.trainingTypeMilitary), findsNWidgets(2));
    expect(find.text(viL10n.trainingCardDays('15')), findsOneWidget);
    expect(find.text(viL10n.trainingCardDays('2,5')), findsOneWidget);
    expect(find.text(viL10n.trainingOutcomePassed), findsOneWidget);
    expect(find.text(viL10n.trainingOutcomeFailed), findsOneWidget);
    expect(find.text(viL10n.trainingOutcomeNotEvaluated), findsNWidgets(2));
    expect(find.text(formatCalendarRange('2026-09-01', '2026-09-15')), findsOneWidget);
    expect(find.text('Field A'), findsOneWidget);
    expect(find.text('Officer B'), findsOneWidget);
    expect(find.text('Nguyen Van A · DQ-001'), findsOneWidget);
    // An unknown type is shown as its code, a missing one generically
    expect(find.text('swimming'), findsOneWidget);
    expect(find.text(viL10n.trainingCardUntyped), findsOneWidget);
  });

  testWidgets('WT-TRN-02: the chips filter by outcome and by type', (tester) async {
    await _pump(tester, _Backend());

    await _tap(tester, find.text(viL10n.trainingFilterPassed));
    expect(find.text('Nguyen Van A · DQ-001'), findsOneWidget);
    expect(find.text('Tran Van B · DQ-002'), findsNothing);

    await _tap(tester, find.text(viL10n.trainingFilterFailed));
    expect(find.text('Tran Van B · DQ-002'), findsOneWidget);
    expect(find.text('Nguyen Van A · DQ-001'), findsNothing);

    await _tap(tester, find.text(viL10n.trainingTypeFire).first);
    expect(find.text('Tran Van B · DQ-002'), findsOneWidget);

    await _tap(tester, find.text(viL10n.trainingTypeFirstAid));
    expect(find.text(viL10n.trainingManagementEmpty), findsOneWidget);

    await _tap(tester, find.text(viL10n.trainingFilterAll));
    expect(find.text('Nguyen Van A · DQ-001'), findsOneWidget);
    expect(find.text('Tran Van B · DQ-002'), findsOneWidget);
  });

  testWidgets('WT-TRN-03: without the caller profile nothing is listed ward-wide; retry recovers',
      (tester) async {
    final backend = _Backend()..profileStatus = 500;
    final adapter = await _pump(tester, backend);

    expect(find.text(viL10n.trainingManagementLoadFailed(viL10n.errorServer)), findsOneWidget);
    expect(adapter.requests.where((r) => r.path == '/training'), isEmpty);

    backend.profileStatus = 200;
    await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.commonRetry));

    expect(find.text('Field A'), findsOneWidget);
  });

  testWidgets('WT-TRN-04: a failed or unreadable record list says why; an empty one invites adding',
      (tester) async {
    final backend = _Backend()..trainingStatus = 500;
    await _pump(tester, backend);
    expect(find.text(viL10n.trainingManagementLoadFailed(viL10n.errorServer)), findsOneWidget);

    backend.badTrainingBody = true;
    await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.commonRetry));
    expect(find.text(viL10n.trainingManagementLoadFailed(viL10n.errorBadResponse)), findsOneWidget);

    backend
      ..badTrainingBody = false
      ..trainingStatus = 200
      ..records = [];
    await _tap(tester, find.widgetWithText(ElevatedButton, viL10n.commonRetry));

    expect(find.text(viL10n.trainingManagementEmpty), findsOneWidget);
    expect(find.text(viL10n.trainingManagementEmptyHint), findsOneWidget);
    expect(find.text('0/0 ${viL10n.trainingManagementSummary(15)}'), findsOneWidget);
  });

  testWidgets('WT-TRN-05: the add form requires days, dates and a member, then posts the record', (tester) async {
    final backend = _Backend();
    final adapter = await _pump(tester, backend);
    await _openForm(tester);
    expect(find.widgetWithText(BottomSheet, viL10n.trainingFormTitle), findsOneWidget);

    // CreateTrainingDto.totalDays is required: an empty field is refused on the field
    await _tap(tester, _save);
    expect(find.text(viL10n.trainingFormDaysRequired), findsOneWidget);

    await tester.enterText(_days, '2');
    await _tap(tester, _save);
    expect(find.text(viL10n.trainingFormDatesRequired), findsOneWidget);
    // Snackbars queue: dismiss this one so the next check sees the next message
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).removeCurrentSnackBar();
    await tester.pumpAndSettle();

    await _pickBothDates(tester);
    expect(find.text(viL10n.trainingFormDateHint), findsNothing);
    // Picking the dates counts the days
    expect(tester.widget<TextFormField>(_days).controller!.text, '1');
    await _tap(tester, _save);
    expect(find.text(viL10n.trainingFormMilitiaRequired), findsOneWidget);

    await _pickMilitia(tester);
    expect(find.text('Nguyen Van A'), findsOneWidget);

    await _tap(tester, find.byType(DropdownButtonFormField<String>));
    await _tap(tester, find.textContaining(viL10n.trainingTypeFire).last);
    await _tap(tester, find.descendant(of: find.byType(BottomSheet), matching: find.text(viL10n.trainingOutcomeFailed)));
    // A half day, written with the Vietnamese decimal comma
    await tester.enterText(_days, '1,5');
    await tester.enterText(find.byType(TextFormField).at(1), ' Field A ');
    await tester.enterText(find.byType(TextFormField).at(2), 'Officer B');
    await _tap(tester, _save);

    final today = toCalendarDateString(DateTime.now());
    final post = adapter.requests.singleWhere((r) => r.method == 'POST');
    expect(post.path, '/training');
    expect(post.data, {
      'militiaId': 'mp-1',
      'trainingType': 'fire',
      'fromDate': today,
      'toDate': today,
      'totalDays': 1.5,
      'location': 'Field A',
      'instructor': 'Officer B',
      'result': 'fail',
    });
    // Sent as a number, as @IsNumber expects
    expect((post.data as Map)['totalDays'], isA<double>());
    // The sheet closes and the list is loaded again
    expect(find.widgetWithText(BottomSheet, viL10n.trainingFormTitle), findsNothing);
    expect(adapter.requests.where((r) => r.path == '/training' && r.method == 'GET'), hasLength(2));
  });

  testWidgets('WT-TRN-06: days the backend would refuse are stopped on the field and nothing is sent',
      (tester) async {
    final adapter = await _pump(tester, _Backend());
    await _openForm(tester);
    await _pickBothDates(tester);
    await _pickMilitia(tester);

    Future<void> expectRefused(String input, String message) async {
      await tester.enterText(_days, input);
      await _tap(tester, _save);
      expect(find.text(message), findsOneWidget, reason: input);
    }

    await expectRefused('', viL10n.trainingFormDaysRequired);
    await expectRefused('0', viL10n.trainingFormDaysBelowMinimum('0,5'));
    await expectRefused('abc', viL10n.trainingFormDaysNotANumber);
    await expectRefused('1,25', viL10n.trainingFormDaysTooManyDecimals);
    await expectRefused('366', viL10n.trainingFormDaysAboveMaximum('365'));
    expect(adapter.requests.where((r) => r.method == 'POST'), isEmpty);

    // The upper edge is accepted and sent as a number
    await tester.enterText(_days, '365');
    await _tap(tester, _save);
    expect((adapter.requests.singleWhere((r) => r.method == 'POST').data as Map)['totalDays'], 365);
  });

  testWidgets('WT-TRN-07: the backend refusing the record is shown and the form can be saved again',
      (tester) async {
    final backend = _Backend()..createStatus = 403;
    await _pump(tester, backend);
    await _openForm(tester);
    await _pickBothDates(tester);
    await _pickMilitia(tester);

    await _tap(tester, _save);

    expect(find.text(viL10n.trainingFormSaveFailed(viL10n.trainingErrorInsufficientRoleToCreate)), findsOneWidget);
    expect(find.widgetWithText(BottomSheet, viL10n.trainingFormTitle), findsOneWidget);
    expect(tester.widget<ElevatedButton>(_save).onPressed, isNotNull);
  });

  testWidgets('WT-TRN-08: the member picker searches from two letters and says how many match', (tester) async {
    final backend = _Backend();
    final adapter = await _pump(tester, backend);
    await _openForm(tester);
    await _tap(tester, find.text(viL10n.trainingFormMilitiaHint));
    expect(find.text(viL10n.trainingMilitiaPickerTitle), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, 'N');
    await tester.pumpAndSettle();
    expect(adapter.requests.where((r) => r.path == '/militia'), isEmpty);

    await tester.enterText(find.byType(TextField).last, 'Ng');
    await tester.pumpAndSettle();
    expect(adapter.requests.last.queryParameters, {'q': 'Ng', 'limit': 10});
    expect(find.text('DQ-001 — Block 1'), findsOneWidget);
    expect(find.text(viL10n.trainingMilitiaPickerShowing(1, 12)), findsOneWidget);

    await _tap(tester, find.text(viL10n.trainingMilitiaPickerClose));
    expect(find.text(viL10n.trainingMilitiaPickerTitle), findsNothing);
    expect(find.text(viL10n.trainingFormMilitiaHint), findsOneWidget);
  });

  testWidgets('WT-TRN-09: the member picker reports no match, failures and unreadable data', (tester) async {
    final backend = _Backend();
    await _pump(tester, backend);
    await _openForm(tester);
    await _tap(tester, find.text(viL10n.trainingFormMilitiaHint));
    final search = find.byType(TextField).last;

    backend.militia = (_) => jsonBody(200, {'data': [], 'total': 0, 'page': 1, 'limit': 10});
    await tester.enterText(search, 'Zz');
    await tester.pumpAndSettle();
    expect(find.text(viL10n.trainingMilitiaPickerEmpty), findsOneWidget);

    backend.militia = (_) => jsonBody(500, {'statusCode': 500});
    await tester.enterText(search, 'Zzz');
    await tester.pumpAndSettle();
    expect(find.text(viL10n.trainingMilitiaPickerFailed(viL10n.errorServer)), findsOneWidget);

    backend.militia = (_) => jsonBody(200, ['mp-1']);
    await tester.enterText(search, 'Zzzz');
    await tester.pumpAndSettle();
    expect(find.text(viL10n.trainingMilitiaPickerFailed(viL10n.errorBadResponse)), findsOneWidget);

    // Fewer than two letters clears the list
    await tester.enterText(search, 'Z');
    await tester.pumpAndSettle();
    expect(find.text(viL10n.trainingMilitiaPickerEmpty), findsNothing);
    expect(find.textContaining(viL10n.errorBadResponse), findsNothing);
  });

  testWidgets('WT-TRN-10: an answer to an older search does not replace the newer one', (tester) async {
    final backend = _Backend();
    final slow = Completer<void>();
    backend.militia = (o) => jsonBody(200, {
          'data': [
            o.queryParameters['q'] == 'Ng'
                ? {'id': 'mp-1', 'militiaCode': 'DQ-001', 'fullName': 'Nguyen Van A'}
                : {'id': 'mp-2', 'militiaCode': 'DQ-002', 'fullName': 'Tran Van B'},
          ],
          'total': 1,
          'page': 1,
          'limit': 10,
        });
    backend.gate = (o) => o.queryParameters['q'] == 'Ng' ? slow.future : Future<void>.value();
    await _pump(tester, backend);
    await _openForm(tester);
    await _tap(tester, find.text(viL10n.trainingFormMilitiaHint));
    final search = find.byType(TextField).last;

    await tester.enterText(search, 'Ng');
    await tester.pump();
    await tester.enterText(search, 'Tr');
    await tester.pumpAndSettle();
    expect(find.text('Tran Van B'), findsOneWidget);

    slow.complete();
    await tester.pumpAndSettle();
    expect(find.text('Tran Van B'), findsOneWidget);
    expect(find.text('Nguyen Van A'), findsNothing);
  });
}
