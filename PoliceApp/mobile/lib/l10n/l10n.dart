import 'package:flutter/widgets.dart';

import 'app_localizations.dart';

export 'app_localizations.dart';
export 'failure_texts.dart';

/// `context.l10n.someKey`: the app's texts (lib/l10n/app_vi.arb)
extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}
