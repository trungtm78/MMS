// Widget Tests: sign-in screens
//   - login screen: local checks, refused sign-in wording, the second-factor step it opens, biometric
//     confirmation of a stored session
//   - OTP screen: TOTP or recovery code (only the offered methods), body sent to
//     POST /auth/mfa/verify, attempts left, restart on an expired challenge, codes left
//   - enrolment screen: QR, secret, authenticator button; POST /auth/mfa/enroll/confirm →
//     recovery codes → session stored only after the codes are acknowledged
//   - recovery codes screen: continue stays disabled until acknowledged; copy and share
// Contract: Web/backend/src/auth/mfa/mfa.controller.ts, mfa.service.ts (verify, rejectCode,
// confirmEnrollment), common/filters/http-exception.filter.ts (details.attemptsRemaining)
// Text is asserted through the resources (viL10n).
// Run: flutter test test/widget_auth_mfa_screens_test.dart

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:militian_app/core/router/app_router.dart';
import 'package:militian_app/core/router/routes.dart';
import 'package:militian_app/features/auth/models/login_response.dart';
import 'package:militian_app/features/auth/models/mfa_enrollment.dart';
import 'package:militian_app/features/auth/models/mfa_error.dart';
import 'package:militian_app/features/auth/providers/auth_provider.dart';
import 'package:militian_app/features/auth/repositories/auth_repository_impl.dart';
import 'package:militian_app/features/auth/screens/login_screen.dart';
import 'package:militian_app/features/auth/screens/mfa_enroll_screen.dart';
import 'package:militian_app/features/auth/screens/otp_screen.dart';
import 'package:militian_app/features/auth/screens/recovery_codes_screen.dart';
import 'package:militian_app/features/auth/widgets/mfa_enrollment_panel.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'helpers/fakes.dart';
import 'helpers/l10n.dart';

class _SignIn {
  _SignIn(this.adapter, this.storage);
  final FakeAdapter adapter;
  final MemoryStorage storage;
  List<RequestOptions> get requests => adapter.requests;
}

/// The sign-in routes of the app router, built from the same extras the login screen passes.
/// [realLogin] shows the login screen itself instead of a marker page.
Future<_SignIn> _pumpSignIn(
  WidgetTester tester, {
  required String location,
  Object? extra,
  required Map<String, ResponseBody Function(RequestOptions)> api,
  MemoryStorage? storage,
  bool realLogin = false,
}) async {
  final store = storage ?? MemoryStorage(access: null, refresh: null);
  final adapter = FakeAdapter(routeTable(api));
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
  final router = GoRouter(
    initialLocation: location,
    initialExtra: extra,
    routes: [
      GoRoute(
        path: Routes.login,
        builder: (context, state) =>
            realLogin ? const LoginScreen() : const Scaffold(body: Text('LOGIN_PAGE')),
      ),
      GoRoute(path: Routes.home, builder: (context, state) => const Scaffold(body: Text('HOME_PAGE'))),
      GoRoute(path: Routes.otpVerify, builder: (context, state) => otpScreenFromExtra(state.extra)),
      GoRoute(path: Routes.mfaSetup, builder: (context, state) => mfaEnrollScreenFromExtra(state.extra)),
      GoRoute(
        path: Routes.recoveryCodes,
        builder: (context, state) => recoveryCodesScreenFromExtra(state.extra),
      ),
    ],
  );
  await tester.pumpWidget(ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(store),
      authRepositoryProvider.overrideWithValue(AuthRepositoryImpl(store, dio: dio)),
    ],
    child: localizedRouterApp(router),
  ));
  await tester.pumpAndSettle();
  return _SignIn(adapter, store);
}

Future<void> _tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _enter(WidgetTester tester, String key, String text) async {
  final finder = find.byKey(Key(key));
  await tester.ensureVisible(finder);
  await tester.enterText(finder, text);
  await tester.pump();
}

String? _errorText(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('mfa_error'))).data;

VoidCallback? _onPressed(WidgetTester tester, String key) =>
    tester.widget<ButtonStyleButton>(find.byKey(Key(key))).onPressed;

/// Answers platform clipboard writes and records the text.
List<String> _mockClipboard(WidgetTester tester) {
  final copied = <String>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'Clipboard.setData') copied.add((call.arguments as Map)['text'] as String);
    return null;
  });
  addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
  return copied;
}

void main() {
  group('router builders', () {
    test('OTP screen from a login response or a plain token', () {
      expect(
        otpScreenFromExtra(LoginResponse.fromJson(mfaRequiredLogin({'methods': ['totp']}))),
        isA<OtpScreen>()
            .having((s) => s.mfaToken, 'mfaToken', testMfaToken)
            .having((s) => s.methods, 'methods', ['totp']),
      );
      expect(
        otpScreenFromExtra(testMfaToken),
        isA<OtpScreen>()
            .having((s) => s.mfaToken, 'mfaToken', testMfaToken)
            .having((s) => s.methods, 'methods', ['totp', 'recovery_code']),
      );
    });

    test('enrolment screen from a login response or a plain token', () {
      expect(
        mfaEnrollScreenFromExtra(LoginResponse.fromJson(mfaSetupRequiredLogin())),
        isA<MfaEnrollScreen>().having((s) => s.mfaToken, 'mfaToken', testMfaToken),
      );
      expect(
        mfaEnrollScreenFromExtra(testMfaToken),
        isA<MfaEnrollScreen>().having((s) => s.mfaToken, 'mfaToken', testMfaToken),
      );
    });

    test('recovery codes screen from args or a code list', () {
      expect(
        recoveryCodesScreenFromExtra(const RecoveryCodesArgs(testRecoveryCodes, completesLogin: true)),
        isA<RecoveryCodesScreen>()
            .having((s) => s.codes, 'codes', testRecoveryCodes)
            .having((s) => s.completesLogin, 'completesLogin', isTrue),
      );
      expect(
        recoveryCodesScreenFromExtra(testRecoveryCodes),
        isA<RecoveryCodesScreen>().having((s) => s.completesLogin, 'completesLogin', isFalse),
      );
    });
  });

  group('LoginScreen', () {
    testWidgets('WT-LOGIN-02: empty and short fields are refused locally; a refused sign-in is explained',
        (tester) async {
      final app = await _pumpSignIn(
        tester,
        location: Routes.login,
        realLogin: true,
        api: {
          'POST /auth/login': (_) => jsonBody(401, backendError(401, 'invalid_credentials')),
        },
      );

      expect(find.text(viL10n.authLoginSubtitle), findsOneWidget);
      expect(find.text(viL10n.authLoginUnit), findsOneWidget);
      // The card title and the submit button read the same
      expect(find.text(viL10n.authLoginCardTitle), findsWidgets);
      expect(
        find.descendant(of: find.byKey(const Key('login_button')), matching: find.text(viL10n.authLoginSubmitButton)),
        findsOneWidget,
      );
      expect(find.text(viL10n.authLoginUsernameLabel), findsOneWidget);
      expect(find.text(viL10n.authLoginPasswordLabel), findsOneWidget);
      expect(find.byKey(const Key('biometric_button')), findsNothing);

      await _tapKey(tester, 'login_button');
      expect(find.text(viL10n.validationRequired), findsNWidgets(2));

      await _enter(tester, 'username_field', 'ab');
      await _enter(tester, 'password_field', '12345');
      await _tapKey(tester, 'login_button');
      expect(find.text(viL10n.validationUsernameTooShort), findsOneWidget);
      expect(find.text(viL10n.validationPasswordTooShort), findsOneWidget);
      expect(app.requests, isEmpty);

      await _enter(tester, 'username_field', 'dqtv01');
      await _enter(tester, 'password_field', 'wrong-password');
      await _tapKey(tester, 'login_button');

      expect(app.requests.single.data, {'username': 'dqtv01', 'password': 'wrong-password'});
      expect(find.text(viL10n.errorAuthInvalidCredentials), findsOneWidget);
    });

    testWidgets('WT-LOGIN-03: MFA_REQUIRED opens the OTP screen with the challenge', (tester) async {
      await _pumpSignIn(
        tester,
        location: Routes.login,
        realLogin: true,
        api: {'POST /auth/login': (_) => jsonBody(200, mfaRequiredLogin())},
      );

      await _enter(tester, 'username_field', 'dqtv01');
      await _enter(tester, 'password_field', 'secret1');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(tester.widget<OtpScreen>(find.byType(OtpScreen)).mfaToken, testMfaToken);
      expect(find.text(viL10n.authOtpTitle), findsOneWidget);
    });

    testWidgets('WT-LOGIN-04: MFA_SETUP_REQUIRED opens the enrolment screen', (tester) async {
      await _pumpSignIn(
        tester,
        location: Routes.login,
        realLogin: true,
        api: {
          'POST /auth/login': (_) => jsonBody(200, mfaSetupRequiredLogin()),
          'POST /auth/mfa/enroll': (_) => jsonBody(200, backendEnrollment()),
        },
      );

      await _enter(tester, 'username_field', 'dqtv01');
      await _enter(tester, 'password_field', 'secret1');
      await _tapKey(tester, 'login_button');

      expect(tester.widget<MfaEnrollScreen>(find.byType(MfaEnrollScreen)).mfaToken, testMfaToken);
      expect(find.text(viL10n.authMfaEnrollTitle), findsOneWidget);
      expect(find.text(viL10n.authMfaEnrollIntro), findsOneWidget);
    });

    testWidgets('WT-LOGIN-05: a biometric confirmation restores the stored session', (tester) async {
      const channel = MethodChannel('plugins.flutter.io/local_auth');
      final calls = <MethodCall>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        return switch (call.method) {
          'getAvailableBiometrics' => ['fingerprint'],
          'isDeviceSupported' => true,
          'authenticate' => true,
          _ => null,
        };
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
      // Nothing to restore on start; biometrics were turned on earlier
      final storage = MemoryStorage(access: null, refresh: null)..biometric = true;
      await _pumpSignIn(tester, location: Routes.login, realLogin: true, api: {}, storage: storage);
      final container = ProviderScope.containerOf(tester.element(find.byType(LoginScreen)));

      expect(find.text(viL10n.authLoginBiometricButton), findsOneWidget);
      storage
        ..access = 'old_access'
        ..refresh = 'old_refresh'
        ..roles = ['dqtv'];
      await _tapKey(tester, 'biometric_button');

      final authenticate = calls.singleWhere((c) => c.method == 'authenticate');
      expect((authenticate.arguments as Map)['localizedReason'], viL10n.authLoginBiometricReason);
      expect(container.read(authStateProvider).isAuthenticated, isTrue);
    });
  });

  group('OtpScreen', () {
    testWidgets('WT-MFA-01: a TOTP code is sent with method totp and signs in', (tester) async {
      final app = await _pumpSignIn(
        tester,
        location: Routes.otpVerify,
        extra: LoginResponse.fromJson(mfaRequiredLogin()),
        api: {'POST /auth/mfa/verify': (_) => jsonBody(200, backendSession('dqtv'))},
      );

      expect(find.text(viL10n.authOtpInstructionTotp), findsOneWidget);
      expect(find.text(viL10n.authMfaOtpHint), findsOneWidget);

      // A code that is not 6 digits is refused locally
      await _enter(tester, 'otp_field', '12345');
      await _tapKey(tester, 'verify_button');
      expect(find.text(viL10n.validationOtpFormat), findsOneWidget);
      expect(app.requests, isEmpty);

      await _enter(tester, 'otp_field', '123456');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(app.requests.single.path, '/auth/mfa/verify');
      expect(app.requests.single.data, {'mfaToken': testMfaToken, 'method': 'totp', 'code': '123456'});
      expect(find.text('HOME_PAGE'), findsOneWidget);
      expect(app.storage.access, 'tok_access');
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('WT-MFA-02: a recovery code is sent as typed and the codes left are shown',
        (tester) async {
      final app = await _pumpSignIn(
        tester,
        location: Routes.otpVerify,
        extra: LoginResponse.fromJson(mfaRequiredLogin()),
        api: {
          'POST /auth/mfa/verify': (_) =>
              jsonBody(200, backendSession('dqtv', {'recoveryCodesRemaining': 9})),
        },
      );

      await tester.tap(find.text(viL10n.authMfaMethodRecoveryCode));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('otp_field')), findsNothing);
      expect(find.text(viL10n.authMfaRecoveryCodeHint), findsOneWidget);
      expect(find.text(viL10n.authOtpInstructionRecoveryCode), findsOneWidget);

      // A blank field is refused locally
      await _tapKey(tester, 'verify_button');
      expect(find.text(viL10n.validationRecoveryCodeRequired), findsOneWidget);
      expect(app.requests, isEmpty);

      await _enter(tester, 'recovery_field', 'abcde fghjk');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(app.requests.single.data,
          {'mfaToken': testMfaToken, 'method': 'recovery_code', 'code': 'abcde fghjk'});
      expect(find.text('HOME_PAGE'), findsOneWidget);
      expect(find.text(viL10n.authOtpRecoveryCodesRemaining(9)), findsOneWidget);
    });

    testWidgets('WT-MFA-03: a wrong code shows the attempts left', (tester) async {
      final app = await _pumpSignIn(
        tester,
        location: Routes.otpVerify,
        extra: LoginResponse.fromJson(mfaRequiredLogin()),
        api: {
          'POST /auth/mfa/verify': (_) =>
              jsonBody(401, backendError(401, 'invalid_code', details: {'attemptsRemaining': 2})),
        },
      );

      await _enter(tester, 'otp_field', '000000');
      await _tapKey(tester, 'verify_button');

      expect(_errorText(tester), viL10n.errorMfaInvalidCodeAttempts(2));
      expect(find.byKey(const Key('restart_login')), findsNothing);
      expect(_onPressed(tester, 'verify_button'), isNotNull);
      expect(find.text('HOME_PAGE'), findsNothing);
      expect(app.storage.access, isNull);
    });

    testWidgets('WT-MFA-04: an expired challenge only offers a new sign-in', (tester) async {
      await _pumpSignIn(
        tester,
        location: Routes.otpVerify,
        extra: LoginResponse.fromJson(mfaRequiredLogin()),
        api: {'POST /auth/mfa/verify': (_) => jsonBody(401, backendError(401, 'mfa_token_invalid'))},
      );

      await _enter(tester, 'otp_field', '123456');
      await _tapKey(tester, 'verify_button');

      expect(_errorText(tester), viL10n.errorMfaTokenInvalid);
      expect(_onPressed(tester, 'verify_button'), isNull);
      expect(find.text(viL10n.authMfaRestartLoginButton), findsOneWidget);

      await _tapKey(tester, 'restart_login');

      expect(find.text('LOGIN_PAGE'), findsOneWidget);
    });

    testWidgets('WT-MFA-05: only the methods offered by the server are shown', (tester) async {
      await _pumpSignIn(
        tester,
        location: Routes.otpVerify,
        extra: LoginResponse.fromJson(mfaRequiredLogin({'methods': ['totp']})),
        api: {},
      );

      expect(find.byKey(const Key('otp_field')), findsOneWidget);
      expect(find.text(viL10n.authMfaMethodRecoveryCode), findsNothing);
    });

    testWidgets('WT-MFA-06: opened without a challenge, only a new sign-in or back is offered',
        (tester) async {
      await _pumpSignIn(tester, location: Routes.otpVerify, extra: '', api: {});

      expect(_errorText(tester), viL10n.errorMfaTokenInvalid);
      expect(_onPressed(tester, 'verify_button'), isNull);

      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();

      expect(find.text('LOGIN_PAGE'), findsOneWidget);
    });
  });

  group('MfaEnrollScreen', () {
    testWidgets(
        'WT-ENR-01: QR, secret and authenticator button; confirmation shows the recovery codes '
        'and the session starts only after they are acknowledged', (tester) async {
      final app = await _pumpSignIn(
        tester,
        location: Routes.mfaSetup,
        extra: LoginResponse.fromJson(mfaSetupRequiredLogin()),
        api: {
          'POST /auth/mfa/enroll': (_) => jsonBody(200, backendEnrollment()),
          'POST /auth/mfa/enroll/confirm': (_) =>
              jsonBody(200, backendSession('dqtv', {'recoveryCodes': testRecoveryCodes})),
        },
      );

      expect(app.requests.single.path, '/auth/mfa/enroll');
      expect(app.requests.single.data, {'mfaToken': testMfaToken});
      expect(find.byType(QrImageView), findsOneWidget);
      expect(
        find.byWidgetPredicate((w) => w is SelectableText && w.data == testTotpSecret),
        findsOneWidget,
      );
      expect(find.byKey(const Key('open_authenticator')), findsOneWidget);
      expect(find.text(viL10n.authMfaPanelOpenAuthenticator), findsOneWidget);
      expect(find.text(viL10n.authMfaPanelStepScan), findsOneWidget);
      expect(find.text(viL10n.authMfaPanelStepCode), findsOneWidget);

      await _enter(tester, 'enroll_code_field', '654321');
      await _tapKey(tester, 'enroll_confirm_button');

      expect(app.requests.last.path, '/auth/mfa/enroll/confirm');
      expect(app.requests.last.data, {'mfaToken': testMfaToken, 'code': '654321'});
      expect(find.byType(RecoveryCodesScreen), findsOneWidget);
      for (final code in testRecoveryCodes) {
        expect(find.text(code), findsOneWidget, reason: code);
      }
      expect(app.storage.access, isNull);

      await _tapKey(tester, 'ack_checkbox');
      await _tapKey(tester, 'continue_button');

      expect(find.text('HOME_PAGE'), findsOneWidget);
      expect(app.storage.access, 'tok_access');
      expect(app.storage.roles, ['dqtv']);
    });

    testWidgets('WT-ENR-02: an expired enrolment challenge only offers a new sign-in',
        (tester) async {
      await _pumpSignIn(
        tester,
        location: Routes.mfaSetup,
        extra: LoginResponse.fromJson(mfaSetupRequiredLogin()),
        api: {'POST /auth/mfa/enroll': (_) => jsonBody(401, backendError(401, 'mfa_token_invalid'))},
      );

      expect(_errorText(tester), viL10n.errorMfaTokenInvalid);
      expect(find.byType(QrImageView), findsNothing);
      expect(find.byKey(const Key('retry_enroll')), findsNothing);

      await _tapKey(tester, 'restart_login');

      expect(find.text('LOGIN_PAGE'), findsOneWidget);
    });

    testWidgets('WT-ENR-03: a wrong confirmation code shows the attempts left', (tester) async {
      final app = await _pumpSignIn(
        tester,
        location: Routes.mfaSetup,
        extra: testMfaToken,
        api: {
          'POST /auth/mfa/enroll': (_) => jsonBody(200, backendEnrollment()),
          'POST /auth/mfa/enroll/confirm': (_) =>
              jsonBody(401, backendError(401, 'invalid_code', details: {'attemptsRemaining': 4})),
        },
      );

      await _enter(tester, 'enroll_code_field', '000000');
      await _tapKey(tester, 'enroll_confirm_button');

      expect(_errorText(tester), viL10n.errorMfaInvalidCodeAttempts(4));
      expect(find.byType(RecoveryCodesScreen), findsNothing);
      expect(_onPressed(tester, 'enroll_confirm_button'), isNotNull);
      expect(app.storage.access, isNull);
    });

    testWidgets('WT-ENR-04: a missing authenticator app points to the QR code and secret',
        (tester) async {
      Uri? opened;
      await tester.pumpWidget(localizedApp(Scaffold(
        body: SingleChildScrollView(
          child: MfaEnrollmentPanel(
            enrollment: MfaEnrollment.fromJson(backendEnrollment()),
            onConfirm: (code) async => null,
            launcher: (uri) async {
              opened = uri;
              return false;
            },
          ),
        ),
      )));

      await _tapKey(tester, 'open_authenticator');

      expect(opened, Uri.parse(testOtpauthUri));
      expect(find.text(viL10n.authMfaPanelLaunchFailed), findsOneWidget);
    });

    testWidgets('WT-ENR-05: opened without a challenge, only a new sign-in is offered', (tester) async {
      final app = await _pumpSignIn(tester, location: Routes.mfaSetup, extra: null, api: {});

      expect(app.requests, isEmpty);
      expect(_errorText(tester), viL10n.errorMfaTokenInvalid);
      expect(find.byKey(const Key('retry_enroll')), findsNothing);

      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();

      expect(find.text('LOGIN_PAGE'), findsOneWidget);
    });

    testWidgets('WT-ENR-06: a failed enrolment can be retried', (tester) async {
      var calls = 0;
      await _pumpSignIn(
        tester,
        location: Routes.mfaSetup,
        extra: testMfaToken,
        api: {
          'POST /auth/mfa/enroll': (_) => ++calls == 1
              ? jsonBody(500, backendError(500, 'Internal server error'))
              : jsonBody(200, backendEnrollment()),
        },
      );

      expect(_errorText(tester), viL10n.errorStatusServer);
      expect(find.text(viL10n.authMfaEnrollRetryButton), findsOneWidget);

      await _tapKey(tester, 'retry_enroll');

      expect(calls, 2);
      expect(find.byType(QrImageView), findsOneWidget);
    });

    testWidgets('WT-ENR-07: a confirmation without recovery codes starts the session at once',
        (tester) async {
      final app = await _pumpSignIn(
        tester,
        location: Routes.mfaSetup,
        extra: testMfaToken,
        api: {
          'POST /auth/mfa/enroll': (_) => jsonBody(200, backendEnrollment()),
          'POST /auth/mfa/enroll/confirm': (_) => jsonBody(200, backendSession('dqtv')),
        },
      );

      await _enter(tester, 'enroll_code_field', '654321');
      await _tapKey(tester, 'enroll_confirm_button');

      expect(find.byType(RecoveryCodesScreen), findsNothing);
      expect(find.text('HOME_PAGE'), findsOneWidget);
      expect(app.storage.access, 'tok_access');
    });

    testWidgets('WT-ENR-08: a locked challenge during confirmation offers a new sign-in', (tester) async {
      await _pumpSignIn(
        tester,
        location: Routes.mfaSetup,
        extra: testMfaToken,
        api: {
          'POST /auth/mfa/enroll': (_) => jsonBody(200, backendEnrollment()),
          'POST /auth/mfa/enroll/confirm': (_) => jsonBody(429, backendError(429, 'mfa_locked')),
        },
      );

      await _enter(tester, 'enroll_code_field', '654321');
      await _tapKey(tester, 'enroll_confirm_button');

      expect(_errorText(tester), viL10n.errorMfaLocked);
      expect(_onPressed(tester, 'enroll_confirm_button'), isNull);
      expect(find.text(viL10n.authMfaRestartLoginButton), findsOneWidget);

      await _tapKey(tester, 'restart_login');

      expect(find.text('LOGIN_PAGE'), findsOneWidget);
    });
  });

  group('MfaEnrollmentPanel', () {
    Future<List<String>> pumpPanel(
      WidgetTester tester, {
      Future<MfaError?> Function(String code)? onConfirm,
      VoidCallback? onRestart,
      String? restartLabel,
    }) async {
      final confirmed = <String>[];
      await tester.pumpWidget(localizedApp(Scaffold(
        body: SingleChildScrollView(
          child: MfaEnrollmentPanel(
            enrollment: MfaEnrollment.fromJson(backendEnrollment()),
            onConfirm: (code) async {
              confirmed.add(code);
              return onConfirm == null ? null : onConfirm(code);
            },
            onRestart: onRestart,
            restartLabel: restartLabel,
          ),
        ),
      )));
      await tester.pumpAndSettle();
      return confirmed;
    }

    testWidgets('WT-PANEL-01: the secret can be copied', (tester) async {
      final copied = _mockClipboard(tester);
      await pumpPanel(tester);

      expect(find.byTooltip(viL10n.authMfaPanelCopySecretTooltip), findsOneWidget);
      expect(find.text(viL10n.authMfaPanelSecretIntro), findsOneWidget);
      await _tapKey(tester, 'copy_secret');

      expect(copied, [testTotpSecret]);
      expect(find.text(viL10n.authMfaPanelSecretCopied), findsOneWidget);
    });

    testWidgets('WT-PANEL-02: a short code is refused locally; a locked one offers the restart action',
        (tester) async {
      var restarted = false;
      final confirmed = await pumpPanel(
        tester,
        onConfirm: (_) async => const MfaError(code: MfaError.locked, restartLogin: true),
        onRestart: () => restarted = true,
        restartLabel: 'RESTART_LABEL',
      );

      await _enter(tester, 'enroll_code_field', '123');
      await _tapKey(tester, 'enroll_confirm_button');
      expect(find.text(viL10n.validationOtpFormat), findsOneWidget);
      expect(confirmed, isEmpty);

      await _enter(tester, 'enroll_code_field', '123456');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(confirmed, ['123456']);
      expect(_errorText(tester), viL10n.errorMfaLocked);
      await tester.ensureVisible(find.text('RESTART_LABEL'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('RESTART_LABEL'));
      expect(restarted, isTrue);
    });

    testWidgets('WT-PANEL-03: without an authenticator app the default launcher reports it',
        (tester) async {
      const channel = MethodChannel('plugins.flutter.io/url_launcher');
      final launched = <Object?>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
        launched.add((call.arguments as Map)['url']);
        throw PlatformException(code: 'ACTIVITY_NOT_FOUND');
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
      await pumpPanel(tester);

      await _tapKey(tester, 'open_authenticator');

      expect(launched, [testOtpauthUri]);
      expect(find.text(viL10n.authMfaPanelLaunchFailed), findsOneWidget);
    });
  });

  group('RecoveryCodesScreen', () {
    Future<void> openCodes(WidgetTester tester) async {
      await tester.pumpWidget(ProviderScope(
        child: localizedApp(Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (context) => const RecoveryCodesScreen(codes: testRecoveryCodes),
                )),
                child: const Text('OPEN'),
              ),
            ),
          ),
        )),
      ));
      await tester.tap(find.text('OPEN'));
      await tester.pumpAndSettle();
    }

    testWidgets('WT-RC-01: continue stays disabled until the codes are acknowledged',
        (tester) async {
      await openCodes(tester);

      expect(find.text(viL10n.authRecoveryCodesTitle), findsOneWidget);
      expect(find.text(viL10n.authRecoveryCodesWarning), findsOneWidget);
      expect(find.text(viL10n.authRecoveryCodesCopyAll), findsOneWidget);
      expect(find.text(viL10n.authRecoveryCodesShare), findsOneWidget);
      expect(find.text(viL10n.authRecoveryCodesAcknowledge), findsOneWidget);
      expect(find.text(testRecoveryCodes.last), findsOneWidget);
      expect(_onPressed(tester, 'continue_button'), isNull);

      await _tapKey(tester, 'ack_checkbox');
      expect(_onPressed(tester, 'continue_button'), isNotNull);

      await _tapKey(tester, 'continue_button');

      expect(find.byType(RecoveryCodesScreen), findsNothing);
      expect(find.text('OPEN'), findsOneWidget);
    });

    testWidgets('WT-RC-02: copy all puts every code on the clipboard', (tester) async {
      final copied = _mockClipboard(tester);
      await openCodes(tester);

      await _tapKey(tester, 'copy_all_codes');

      expect(copied, [testRecoveryCodes.join('\n')]);
      expect(find.text(viL10n.authRecoveryCodesCopied), findsOneWidget);
    });

    testWidgets('WT-RC-03: share sends the codes; a failed share says to copy them', (tester) async {
      const channel = MethodChannel('dev.fluttercommunity.plus/share');
      final shared = <Map>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
        shared.add(call.arguments as Map);
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
      await openCodes(tester);

      await _tapKey(tester, 'share_codes');

      expect(shared.single['text'], viL10n.authRecoveryCodesShareText(testRecoveryCodes.join('\n')));
      expect(shared.single['subject'], viL10n.authRecoveryCodesShareSubject);
      expect(find.text(viL10n.authRecoveryCodesShareFailed), findsNothing);

      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        channel,
        (call) async => throw PlatformException(code: 'unavailable'),
      );
      await _tapKey(tester, 'share_codes');

      expect(find.text(viL10n.authRecoveryCodesShareFailed), findsOneWidget);
    });

    testWidgets('WT-RC-04: a sign-in that cannot be completed says why and returns to login',
        (tester) async {
      final app = await _pumpSignIn(
        tester,
        location: Routes.mfaSetup,
        extra: testMfaToken,
        api: {
          'POST /auth/mfa/enroll': (_) => jsonBody(200, backendEnrollment()),
          'POST /auth/mfa/enroll/confirm': (_) =>
              jsonBody(200, backendSession('dqtv', {'recoveryCodes': testRecoveryCodes})),
        },
      );
      await _enter(tester, 'enroll_code_field', '654321');
      await _tapKey(tester, 'enroll_confirm_button');
      app.storage.failWrites = true;

      await _tapKey(tester, 'ack_checkbox');
      await _tapKey(tester, 'continue_button');

      expect(find.text('LOGIN_PAGE'), findsOneWidget);
      expect(find.text(viL10n.errorUnexpected), findsOneWidget);
      expect(app.storage.access, isNull);
    });
  });
}
