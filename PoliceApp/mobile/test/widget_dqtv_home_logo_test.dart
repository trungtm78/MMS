// Widget Tests: the DQTV home greeting card carries the Công an badge
// Run: flutter test test/widget_dqtv_home_logo_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/dqtv_home/screens/dqtv_home_screen.dart';
import 'package:police_app/shared/widgets/app_logo.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

void main() {
  testWidgets('WT-DQTV-HOME-LOGO-01: the greeting card shows the badge, not a generic shield', (tester) async {
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = FakeAdapter((_) => jsonBody(200, {'data': null}));
    await tester.pumpWidget(ProviderScope(
      overrides: [dioProvider.overrideWithValue(dio)],
      child: localizedApp(const DQTVHomeScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(AppLogo), findsOneWidget);
    expect(find.byIcon(Icons.shield), findsNothing);
  });
}
