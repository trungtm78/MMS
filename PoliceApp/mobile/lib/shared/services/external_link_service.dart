import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens [uri] in the app that handles it (e.g. an otpauth link in the authenticator app).
/// Resolves to false, or throws, when nothing can open it.
typedef OpenExternalUrl = Future<bool> Function(Uri uri);

final openExternalUrlProvider = Provider<OpenExternalUrl>((ref) => _openInExternalApp);

Future<bool> _openInExternalApp(Uri uri) => launchUrl(uri, mode: LaunchMode.externalApplication);
