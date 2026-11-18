// Widget Test: the app is wired for Vietnamese resources — delegates, supported and chosen locale,
// and a title resolved from the resources (MaterialApp.router in lib/app.dart).
// Run: flutter test test/widget_app_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/app.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';
import 'package:militian_app/features/auth/screens/login_screen.dart';
import 'package:militian_app/l10n/l10n.dart';
import 'package:militian_app/shared/services/push_notification_service.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

class _FakePush implements PushNotificationService {
  @override
  Future<void> initialize() async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('WT-APP-01: a signed-out start shows the Vietnamese login screen under the app title',
      (tester) async {
    final storage = MemoryStorage(access: null, refresh: null);
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = FakeAdapter((_) => jsonBody(404, {}));
    await tester.pumpWidget(ProviderScope(
      overrides: [
        secureStorageProvider.overrideWithValue(storage),
        authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(storage, dio: dio)),
        pushNotificationServiceProvider.overrideWithValue(_FakePush()),
      ],
      child: const App(),
    ));
    await tester.pumpAndSettle();

    final login = tester.element(find.byType(LoginScreen));
    expect(Localizations.localeOf(login), const Locale('vi'));
    expect(AppLocalizations.of(login).appTitle, viL10n.appTitle);
    // Material's own labels come from flutter_localizations' Vietnamese resources too
    expect(MaterialLocalizations.of(login).closeButtonLabel, isNot('Close'));
    expect(tester.widget<Title>(find.byType(Title)).title, viL10n.appTitle);
    expect(find.byKey(const Key('login_button')), findsOneWidget);
    expect(find.text(viL10n.authLoginSubtitle), findsOneWidget);
  });
}
