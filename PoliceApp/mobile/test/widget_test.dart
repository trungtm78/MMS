// Smoke test — verifies the app boots without throwing.
// Pre-existing test was broken (missing ProviderScope wrapper); fixed alongside
// the MOBILE-* hardening pass on 2026-05-05.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:police_app/app.dart';

void main() {
  testWidgets('App renders smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: PoliceApp()));
    await tester.pump();
  });
}
