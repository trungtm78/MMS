// Entry point for localized text. Screens import this file and read `context.l10n.someKey`.
//
// Conventions (every area follows them):
// - Strings live in lib/l10n/app_vi.arb; `flutter gen-l10n` (or `flutter pub get`) writes
//   app_localizations*.dart next to it. Never edit the generated files.
// - Keys are camelCase module + screen + element + state, e.g. authLoginNoticeSessionEnded,
//   profileSecurityDisableDialogTitle. Every key has an "@key" entry with a description; placeholders
//   are typed ({count} int, {name} String) and ICU plural/select is used where wording changes.
// - Layers without a BuildContext (repositories, interceptors, notifiers, models, validators) return
//   codes/enums, never text. The UI maps them through AppLocalizations:
//     - backend errors: lib/l10n/error_texts.dart (errorText / errorTextFor / ApiFailure.text)
//     - validators: lib/l10n/validation_texts.dart
//     - a feature's own enums: lib/features/<feature>/<feature>_texts.dart
//   Those mappers take an AppLocalizations, never a BuildContext, so unit tests can pass viL10n.

import 'package:flutter/widgets.dart';

import 'app_localizations.dart';

export 'app_localizations.dart';

extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}
