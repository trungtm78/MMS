import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';

/// The Công an nhân dân badge: the app's logo on the sign-in screens and the home headers.
/// The launcher icons (android/app/src/main/res/mipmap-*) are drawn from the same badge.
class AppLogo extends StatelessWidget {
  static const asset = 'assets/images/logo_ca.png';

  final double height;

  const AppLogo({super.key, required this.height});

  @override
  Widget build(BuildContext context) => Image.asset(
        asset,
        height: height,
        fit: BoxFit.contain,
        semanticLabel: context.l10n.appLogoLabel,
      );
}
