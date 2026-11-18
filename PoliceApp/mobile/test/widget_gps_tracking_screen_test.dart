// Widget Tests: GPS tracking screen
// Backend: GET /gps/live returns a plain JSON array of the latest positions
// (Web/backend/src/gps/gps.controller.ts:63-68, gps.service.ts:27-62); 'gps:update' carries one row
// Run: flutter test test/widget_gps_tracking_screen_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/chat/chat_socket.dart';
import 'package:police_app/features/gps/providers/gps_provider.dart';
import 'package:police_app/features/gps/screens/gps_tracking_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

const _seenAt = '2026-09-14T01:00:00.000Z';

Map<String, Object?> _row(
  String id,
  String name, {
  String status = 'online',
  Object? lat = 10.82,
  Object? lng = 106.63,
  Object? accuracy = 12.5,
}) =>
    {
      'id': id,
      'militiaId': id,
      'userId': 'user-$id',
      'name': name,
      'fullName': name,
      'unitCode': 'P01',
      'lat': lat,
      'lng': lng,
      'accuracy': accuracy,
      'lastUpdate': _seenAt,
      'lastSeenAt': _seenAt,
      'status': status,
    };

class _FakeSocket implements ChatSocket {
  final _handlers = <String, void Function(dynamic)>{};
  bool disposed = false;

  @override
  void onConnect(void Function() handler) {}

  @override
  void on(String event, void Function(dynamic data) handler) => _handlers[event] = handler;

  @override
  void emit(String event, Object? data) {}

  @override
  void emitWithAck(String event, Object? data, void Function(dynamic response) onAck) {}

  @override
  void dispose() => disposed = true;

  void fire(String event, Object? data) => _handlers[event]?.call(data);
}

Future<FakeAdapter> _pump(
  WidgetTester tester,
  ResponseBody Function(RequestOptions) handler, {
  _FakeSocket? socket,
}) async {
  // A phone-sized portrait screen, so the member list (a third of the height) shows several rows
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  final adapter = FakeAdapter(handler);
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    // A fresh scope and screen each time, even when a test pumps twice
    key: UniqueKey(),
    overrides: [
      // A token only when a live socket is under test
      secureStorageProvider.overrideWithValue(
        MemoryStorage(access: socket == null ? null : 'tok_access', refresh: 'tok_refresh'),
      ),
      dioProvider.overrideWithValue(dio),
      // No network map tiles in tests
      gpsMapTilesProvider.overrideWithValue(null),
      if (socket != null) chatSocketFactoryProvider.overrideWithValue((_) => socket),
    ],
    child: localizedApp(const GpsTrackingScreen()),
  ));
  await tester.pumpAndSettle();
  return adapter;
}

void main() {
  testWidgets('WT-GPS-01: the team from GET /gps/live (a plain array) is listed with localized statuses', (tester) async {
    await _pump(tester, (_) => jsonBody(200, [
          _row('m1', 'Nguyen Van An'),
          _row('m2', 'Tran Thi Binh', status: 'offline'),
          _row('m3', 'Le Van Cuong', status: 'moving'),
        ]));

    expect(find.text(viL10n.gpsTrackingTitle), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Nguyen Van An'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Tran Thi Binh'), findsOneWidget);
    expect(find.text(viL10n.gpsTrackingSummary(2, 1)), findsOneWidget);
    expect(find.text(viL10n.gpsStatusOnline), findsOneWidget);
    expect(find.text(viL10n.gpsStatusOffline), findsOneWidget);
    expect(find.text(viL10n.gpsStatusMoving), findsOneWidget);
    // Map markers carry the last word of each name
    expect(find.text('An'), findsOneWidget);
    expect(find.text('Binh'), findsOneWidget);
  });

  testWidgets('WT-GPS-02: coordinates sent as numeric strings still place the member', (tester) async {
    await _pump(tester, (_) => jsonBody(200, [
          _row('m1', 'Nguyen Van An', lat: '10.8', lng: '106.6', accuracy: '8'),
          _row('m2', 'Tran Thi Binh', lat: null, lng: null),
        ]));

    expect(find.text('An'), findsOneWidget);
    expect(find.text('Binh'), findsNothing, reason: 'no position, no marker');

    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.gpsMemberPosition('10.8', '106.6')), findsOneWidget);
    expect(find.text(viL10n.gpsMemberAccuracy('8')), findsOneWidget);
  });

  testWidgets('WT-GPS-03: a failed load is explained and can be retried', (tester) async {
    var calls = 0;
    final adapter = await _pump(tester, (_) => ++calls == 1
        ? jsonBody(500, {'code': 'E005', 'message': 'Internal server error', 'statusCode': 500})
        : jsonBody(200, [_row('m1', 'Nguyen Van An')]));

    expect(find.text(viL10n.gpsTrackingLoadFailed(viL10n.errorServer)), findsOneWidget);
    await tester.tap(find.text(viL10n.commonRetry));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(ListTile, 'Nguyen Van An'), findsOneWidget);
    expect(adapter.requests, hasLength(2));
  });

  testWidgets('WT-GPS-04: nobody with a position yet; an unreadable answer is a failure', (tester) async {
    await _pump(tester, (_) => jsonBody(200, []));
    expect(find.text(viL10n.gpsTrackingEmpty), findsOneWidget);

    await _pump(tester, (_) => jsonBody(200, {'data': []}));
    expect(find.text(viL10n.gpsTrackingLoadFailed(viL10n.errorBadResponse)), findsOneWidget);
  });

  testWidgets('WT-GPS-05: gps:update moves a member, adds a new one and ignores malformed events', (tester) async {
    final socket = _FakeSocket();
    await _pump(tester, (_) => jsonBody(200, [_row('m1', 'Nguyen Van An', status: 'offline')]), socket: socket);
    expect(find.text(viL10n.gpsTrackingSummary(0, 1)), findsOneWidget);

    socket.fire('gps:update', _row('m1', 'Nguyen Van An', status: 'online', lat: '10.9'));
    socket.fire('gps:update', _row('m2', 'Tran Thi Binh'));
    socket.fire('gps:update', 'not a row');
    await tester.pumpAndSettle();

    expect(find.text(viL10n.gpsTrackingSummary(2, 0)), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Tran Thi Binh'), findsOneWidget);
    expect(find.widgetWithText(ListTile, 'Nguyen Van An'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    expect(socket.disposed, isTrue);
  });

  testWidgets('WT-GPS-06: a member sheet shows position, accuracy, last update and unit', (tester) async {
    await _pump(tester, (_) => jsonBody(200, [
          _row('m1', 'Nguyen Van An'),
          _row('m2', 'Tran Thi Binh', lat: null, lng: null, accuracy: null),
        ]));

    await tester.tap(find.widgetWithText(ListTile, 'Nguyen Van An'));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.gpsMemberPosition('10.82', '106.63')), findsOneWidget);
    expect(find.text(viL10n.gpsMemberAccuracy('12.5')), findsOneWidget);
    expect(find.text(viL10n.gpsMemberLastSeen(DateFormat('HH:mm dd/MM').format(DateTime.parse(_seenAt).toLocal()))),
        findsOneWidget);
    expect(find.text(viL10n.gpsMemberUnit('P01')), findsWidgets);
    Navigator.of(tester.element(find.text(viL10n.gpsMemberUnit('P01')).last)).pop();
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ListTile, 'Tran Thi Binh'));
    await tester.pumpAndSettle();
    expect(find.text(viL10n.gpsMemberNoPosition), findsOneWidget);
  });

  testWidgets('WT-GPS-07: refresh loads the positions again', (tester) async {
    final adapter = await _pump(tester, (_) => jsonBody(200, [_row('m1', 'Nguyen Van An')]));

    await tester.tap(find.byTooltip(viL10n.gpsTrackingRefresh));
    await tester.pumpAndSettle();

    expect(adapter.requests.where((r) => r.path == '/gps/live'), hasLength(2));
  });
}
