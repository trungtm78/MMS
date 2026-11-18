// Localization for tests: every widget test pumps through these wrappers so screens can read
// context.l10n, and asserts text resolved from the resources, e.g.
//   expect(find.text(viL10n.authLoginNoticeSessionEnded), findsOneWidget);
// Only test/unit_l10n_vi_test.dart compares keys with literal Vietnamese.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/l10n/l10n.dart';

const _vi = Locale('vi');

/// The app's resources, for assertions and for text mappers under unit test.
final AppLocalizations viL10n = lookupAppLocalizations(_vi);

/// A MaterialApp showing [home] with the app's delegates and locale.
Widget localizedApp(Widget home) => MaterialApp(
      locale: _vi,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: home,
    );

/// A MaterialApp.router over [router] with the app's delegates and locale.
Widget localizedRouterApp(GoRouter router) => MaterialApp.router(
      locale: _vi,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    );
