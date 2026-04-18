import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../../core/storage/secure_storage_service.dart';
import '../../features/auth/providers/auth_provider.dart';

/// Background message handler — must be top-level function
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('[FCM] Background message: ${message.messageId}');
  // Background messages are shown automatically by the OS when app is killed.
  // No extra handling needed unless you want local DB writes.
}

/// Notification channel for Android
const AndroidNotificationChannel _channel = AndroidNotificationChannel(
  'mms_high_importance',
  'Thông báo MMS',
  description: 'Kênh thông báo quan trọng của ứng dụng Dân Quân',
  importance: Importance.high,
  playSound: true,
);

final FlutterLocalNotificationsPlugin _localNotifications =
    FlutterLocalNotificationsPlugin();

class PushNotificationService {
  final SecureStorageService _storage;

  PushNotificationService(this._storage);

  /// Wire GoRouter navigation for push notification taps.
  static void setRouteCallback(void Function(String path) callback) {
    _onRoute = callback;
  }

  // ─── Initialise ────────────────────────────────────────────────────────────
  Future<void> initialize() async {
    // Register background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Setup local notifications plugin (for foreground display on Android)
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

    // Create high-importance channel on Android
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    // Request permission (iOS + Android 13+)
    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    debugPrint('[FCM] Permission status: ${settings.authorizationStatus}');

    // Disable FCM foreground notification on iOS (we show manually)
    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
      alert: false,
      badge: true,
      sound: true,
    );

    // Get & store FCM token
    await _refreshAndStoreToken();

    // Listen for token refresh
    FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
      await _storage.write('fcm_token', token);
      debugPrint('[FCM] Token refreshed');
    });

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Handle when app is opened from a notification (background → foreground)
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpenedApp);

    // Handle initial message (app was terminated and opened by notification)
    final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
    if (initialMessage != null) {
      _handleMessageOpenedApp(initialMessage);
    }
  }

  // ─── Token management ──────────────────────────────────────────────────────
  Future<void> _refreshAndStoreToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await _storage.write('fcm_token', token);
        debugPrint('[FCM] Token stored (${token.substring(0, 20)}...)');
      }
    } catch (e) {
      debugPrint('[FCM] Failed to get token: $e');
    }
  }

  Future<String?> getToken() async {
    return _storage.read('fcm_token');
  }

  Future<void> deleteToken() async {
    await FirebaseMessaging.instance.deleteToken();
    await _storage.delete('fcm_token');
  }

  // ─── Foreground message handler ────────────────────────────────────────────
  void _handleForegroundMessage(RemoteMessage message) {
    debugPrint('[FCM] Foreground message: ${message.messageId}');
    final notification = message.notification;
    if (notification == null) return;

    // Show local notification on Android (iOS shows it via the system when
    // setForegroundNotificationPresentationOptions alert:false is overridden)
    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          styleInformation: notification.body != null
              ? BigTextStyleInformation(notification.body!)
              : null,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }

  // ─── Tapped notification (from background / terminated) ───────────────────
  void _handleMessageOpenedApp(RemoteMessage message) {
    debugPrint('[FCM] Notification tapped, data: ${message.data}');
    // Route based on data payload
    _routeFromPayload(message.data);
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    if (response.payload == null) return;
    try {
      final data = jsonDecode(response.payload!) as Map<String, dynamic>;
      _routeFromPayload(data);
    } catch (_) {}
  }

  void _routeFromPayload(Map<String, dynamic> data) {
    debugPrint('[FCM] Route from payload: $data');
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

  /// Set by App after GoRouter is ready — routes push taps into the navigator.
  static void Function(String path)? _onRoute;

  // ─── Subscribe / unsubscribe topics ───────────────────────────────────────
  Future<void> subscribeToTopic(String topic) async {
    await FirebaseMessaging.instance.subscribeToTopic(topic);
    debugPrint('[FCM] Subscribed to topic: $topic');
  }

  Future<void> unsubscribeFromTopic(String topic) async {
    await FirebaseMessaging.instance.unsubscribeFromTopic(topic);
    debugPrint('[FCM] Unsubscribed from topic: $topic');
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

final pushNotificationServiceProvider =
    Provider<PushNotificationService>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return PushNotificationService(storage);
});
