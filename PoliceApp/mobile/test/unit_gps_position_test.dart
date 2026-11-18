// Unit Tests: GpsPosition — rows of GET /gps/live and 'gps:update'
// (Web/backend/src/gps/gps.service.ts:27-62): a plain array; NUMERIC coordinates as numbers or strings
// Run: flutter test test/unit_gps_position_test.dart

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/gps/models/gps_position.dart';
import 'package:police_app/features/gps/providers/gps_provider.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/fakes.dart';

void main() {
  test('UT-GPS-01: a plain array of rows, numbers or numeric strings', () {
    final rows = GpsPosition.listFromJson([
      {
        'id': 'm1', 'militiaId': 'm1', 'userId': 'u1', 'fullName': 'An', 'unitCode': 'P01',
        'lat': 10.82, 'lng': 106.63, 'accuracy': 12.5, 'lastSeenAt': '2026-09-14T01:00:00.000Z', 'status': 'online',
      },
      {'id': 'm2', 'name': 'Binh', 'lat': '10.8', 'lng': '106.6', 'accuracy': null},
      {'fullName': 'no id'},
      'garbage',
    ]);

    expect(rows.map((r) => r.militiaId), ['m1', 'm2']);
    final an = rows.first;
    expect(an.userId, 'u1');
    expect(an.fullName, 'An');
    expect(an.unitCode, 'P01');
    expect(an.lat, 10.82);
    expect(an.accuracy, 12.5);
    expect(an.lastSeenAt, DateTime.utc(2026, 9, 14, 1));
    expect(an.isOnline, isTrue);
    expect(an.hasLocation, isTrue);

    final binh = rows.last;
    expect(binh.fullName, 'Binh', reason: 'name is the alias when fullName is missing');
    expect(binh.lat, 10.8);
    expect(binh.lng, 106.6);
    expect(binh.accuracy, isNull);
    expect(binh.status, 'offline');
    expect(binh.isOnline, isFalse);
  });

  test('UT-GPS-02: moving counts as online; no coordinates, no location', () {
    expect(GpsPosition.fromJson({'id': 'm1', 'status': 'moving'}).isOnline, isTrue);
    expect(GpsPosition.fromJson({'id': 'm1', 'lat': 10}).hasLocation, isFalse);
    expect(() => GpsPosition.listFromJson({'data': []}), throwsFormatException);
  });

  test('UT-GPS-03: an update keeps what it does not change', () {
    final before = GpsPosition.fromJson({'id': 'm1', 'fullName': 'An', 'unitCode': 'P01', 'lat': 1, 'lng': 2, 'status': 'offline'});

    final after = before.mergedWith({'militiaId': 'm1', 'lat': '3.5', 'status': 'online'});

    expect(after.fullName, 'An');
    expect(after.unitCode, 'P01');
    expect(after.lat, 3.5);
    expect(after.lng, 2);
    expect(after.isOnline, isTrue);
    expect(GpsPosition.idOf({'militiaId': 'm9'}), 'm9');
    expect(GpsPosition.idOf({'id': 'm8'}), 'm8');
    expect(GpsPosition.idOf({'fullName': 'x'}), isNull);
  });

  test('UT-GPS-04: GpsApi.live reads GET /gps/live and reports failures as AppFailure', () async {
    final ok = Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = FakeAdapter((_) => jsonBody(200, [{'id': 'm1', 'fullName': 'An'}]));
    final rows = await GpsApi(ok).live();
    expect(rows.single.fullName, 'An');

    final failing = Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = FakeAdapter((_) => jsonBody(403, {'code': 'E004', 'message': 'Forbidden resource', 'statusCode': 403}));
    await expectLater(GpsApi(failing).live(), throwsA(isA<AppFailure>().having((f) => f.status, 'status', 403)));

    final garbled = Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = FakeAdapter((_) => jsonBody(200, {'data': []}));
    await expectLater(GpsApi(garbled).live(), throwsA(isA<AppFailure>().having((f) => f.code, 'code', AppFailure.badResponse)));
  });
}
