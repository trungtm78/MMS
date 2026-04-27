import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../../core/storage/secure_storage_service.dart';
import '../../features/auth/providers/auth_provider.dart';

/// Android notification channel — high-importance so heads-up alerts show
const AndroidNotificationChannel _channel = AndroidNotificationChannel(
  'mms_high_importance',
  'Thông báo MMS',
  description: 'Kênh thông báo quan trọng của ứng dụng Dân Quân',
  importance: Importance.high,
  playSound: true,
);

final FlutterLocalNotificationsPlugin _localNotifications =
    FlutterLocalNotificationsPlugin();

/// Push notification service — uses WebSocket gateway for delivery
/// (Firebase removed; notifications arrive via NotificationsGateway WS events)
class PushNotificationService {
  final SecureStorageService _storage;

  PushNotificationService(this._storage);

  /// Wire GoRouter navigation for notification taps.
  static void setRouteCallback(void Function(String path) callback) {
    _onRoute = callback;
  }

  // ─── Initialise ─────────────────────────────────────────────────────────────
  Future<void> initialize() async {
    await _localNotifications.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: _onLocalNotificationTap,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    debugPrint('[Push] Initialized (WebSocket mode — no Firebase)');
  }

  // ─── Show a local notification (called by WebSocket gateway handler) ────────
  Future<void> show({
    required String title,
    required String body,
    Map<String, dynamic>? data,
  }) async {
    try {
      await _localNotifications.show(
        DateTime.now().millisecondsSinceEpoch & 0x7FFFFFFF,
        title,
        body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _channel.id,
            _channel.name,
            channelDescription: _channel.description,
            importance: Importance.high,
            priority: Priority.high,
            icon: '@mipmap/ic_launcher',
          ),
          iOS: const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
      );
    } catch (e) {
      debugPrint('[Push] show() failed: $e');
    }
  }

  // ─── Token (no-op — no FCM) ──────────────────────────────────────────────────
  Future<String?> getToken() async => null;
  Future<void> deleteToken() async {}

  // ─── Tap routing ─────────────────────────────────────────────────────────────
  void _onLocalNotificationTap(NotificationResponse response) {
    final type = response.id?.toString();
    if (type != null && _onRoute != null) {
      _onRoute!('/notifications');
    }
  }

  void routeFromPayload(Map<String, dynamic> data) {
    final type = data['type'] as String?;
    final id = data['id'] as String?;
    String? path;
    if (type == 'task' && id != null) {
      path = '/tasks/$id';
    } else if (type == 'chat' && id != null) {
      path = '/chat/$id';
    } else if (type == 'notification') {
      path = '/notifications';
    }
    if (path != null && _onRoute != null) {
      _onRoute!(path);
    }
  }

  static void Function(String path)? _onRoute;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

final pushNotificationServiceProvider =
    Provider<PushNotificationService>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return PushNotificationService(storage);
});
