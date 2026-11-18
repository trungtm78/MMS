// Unit Tests: GET /militia?q=&limit= response used by the training form's DQTV picker
// Backend: militia.controller.ts:156-171 → militia.service.ts:296-356
//   {data: MilitiaSearchItem[], total, page, limit}
//   MilitiaSearchItem: id, userId, militiaCode, fullName, phone, rank, status, unitCode, unitName
// Run: flutter test test/unit_militia_search_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/training/militia_search.dart';

void main() {
  test('UT-MIL-01: parses the paginated envelope', () {
    final page = MilitiaSearchPage.fromJson({
      'data': [
        {
          'id': 'mp-1',
          'userId': 'u-1',
          'militiaCode': 'DQ-001',
          'fullName': 'Nguyen Van A',
          'phone': '0909000000',
          'rank': 'Private',
          'status': 'active',
          'unitCode': 'KP1',
          'unitName': 'Block 1',
        },
        {'id': 'mp-2', 'userId': null, 'militiaCode': 'DQ-002', 'fullName': 'Tran Van B'},
      ],
      'total': 12,
      'page': 1,
      'limit': 10,
    });

    expect(page.total, 12);
    expect(page.page, 1);
    expect(page.limit, 10);
    expect(page.items, hasLength(2));
    expect(page.items.first.id, 'mp-1');
    expect(page.items.first.fullName, 'Nguyen Van A');
    expect(page.items.first.militiaCode, 'DQ-001');
    expect(page.items.first.unitName, 'Block 1');
    expect(page.items.first.subtitle, 'DQ-001 — Block 1');
    expect(page.items.last.userId, isNull);
    expect(page.items.last.subtitle, 'DQ-002');
  });

  test('UT-MIL-02: rows without an id are skipped', () {
    final page = MilitiaSearchPage.fromJson({
      'data': [
        {'fullName': 'No id'},
        'junk',
        {'id': 'mp-3', 'fullName': 'C', 'militiaCode': 'DQ-003'},
      ],
      'total': 3,
      'page': 1,
      'limit': 10,
    });
    expect(page.items.map((m) => m.id), ['mp-3']);
  });

  test('UT-MIL-03: a body that is not the envelope is a FormatException', () {
    expect(() => MilitiaSearchPage.fromJson([{'id': 'mp-1'}]), throwsFormatException);
    expect(() => MilitiaSearchPage.fromJson({'items': []}), throwsFormatException);
  });
}
