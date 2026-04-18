import 'package:socket_io_client/socket_io_client.dart' as IO;

import '../../core/constants/api_constants.dart';
import '../../core/storage/secure_storage_service.dart';

typedef LocationUpdateCallback = void Function(Map<String, dynamic> data);
typedef NotificationCallback = void Function(Map<String, dynamic> data);

class WebSocketService {
  static WebSocketService? _instance;
  IO.Socket? _socket;

  final List<LocationUpdateCallback> _locationListeners = [];
  final List<NotificationCallback> _notifListeners = [];

  WebSocketService._();

  static WebSocketService get instance {
    _instance ??= WebSocketService._();
    return _instance!;
  }

  bool get isConnected => _socket?.connected == true;

  Future<void> connect(SecureStorageService storage) async {
    if (isConnected) return;
    final token = await storage.getAccessToken();
    if (token == null) return;

    _socket = IO.io(
      ApiConstants.wsUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );

    _socket!.onConnect((_) {
      // Connected
    });

    _socket!.on('location_update', (data) {
      if (data is Map<String, dynamic>) {
        for (final cb in _locationListeners) {
          cb(data);
        }
      }
    });

    _socket!.on('notification', (data) {
      if (data is Map<String, dynamic>) {
        for (final cb in _notifListeners) {
          cb(data);
        }
      }
    });

    _socket!.onDisconnect((_) {
      // Disconnected
    });

    _socket!.connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  void addLocationListener(LocationUpdateCallback cb) {
    if (!_locationListeners.contains(cb)) _locationListeners.add(cb);
  }

  void removeLocationListener(LocationUpdateCallback cb) {
    _locationListeners.remove(cb);
  }

  void addNotificationListener(NotificationCallback cb) {
    if (!_notifListeners.contains(cb)) _notifListeners.add(cb);
  }

  void removeNotificationListener(NotificationCallback cb) {
    _notifListeners.remove(cb);
  }

  void emit(String event, dynamic data) {
    _socket?.emit(event, data);
  }
}
