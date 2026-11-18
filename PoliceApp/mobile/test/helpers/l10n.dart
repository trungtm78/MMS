// Localized test scaffolding: screens read their texts from lib/l10n/app_vi.arb.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:police_app/l10n/app_localizations.dart';

/// The app's Vietnamese texts, for asserting what a screen shows
final AppLocalizations viL10n = lookupAppLocalizations(const Locale('vi'));

/// A MaterialApp with the app's localizations and locale around [home]
Widget localizedApp(Widget home) => MaterialApp(
      locale: const Locale('vi'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: home,
    );

/// A MaterialApp.router with the app's localizations and locale
Widget localizedRouterApp(GoRouter router) => MaterialApp.router(
      locale: const Locale('vi'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
    );
