// Widget Tests: the app shell — Vietnamese localizations, title and the first screen
// Run: flutter test test/widget_app_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/app.dart';
import 'package:police_app/features/auth/providers/auth_provider.dart';
import 'package:police_app/features/auth/screens/login_screen.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

void main() {
  testWidgets('WT-APP-01: signed out, the Vietnamese app opens on the login screen with its title', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(MemoryStorage(access: null, refresh: null)),
        dioProvider.overrideWithValue(Dio(BaseOptions(baseUrl: 'http://test'))
          ..httpClientAdapter = FakeAdapter((_) => jsonBody(404, {}))),
      ],
      child: const PoliceApp(),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.locale, const Locale('vi'));
    expect(tester.widget<Title>(find.byType(Title)).title, viL10n.appTitle);
    // Every screen, Material widgets included, runs in the Vietnamese locale
    expect(Localizations.localeOf(tester.element(find.byType(LoginScreen))), const Locale('vi'));
  });
}
