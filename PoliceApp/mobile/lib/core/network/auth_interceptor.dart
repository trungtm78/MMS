import 'package:dio/dio.dart';
import '../constants/api_constants.dart';
import '../storage/secure_storage_service.dart';

class AuthInterceptor extends Interceptor {
  final Dio dio;
  final SecureStorageService storage;
  bool _isRefreshing = false;

  AuthInterceptor({required this.dio, required this.storage});

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await storage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401 && !_isRefreshing) {
      _isRefreshing = true;
      try {
        final refreshToken = await storage.getRefreshToken();
        if (refreshToken == null) {
          _isRefreshing = false;
          handler.next(err);
          return;
        }

        final response = await dio.post(
          ApiConstants.refreshToken,
          data: {'refreshToken': refreshToken},
          options: Options(headers: {'Authorization': null}),
        );

        final newAccessToken = response.data['accessToken'] as String;
        final newRefreshToken = response.data['refreshToken'] as String?;
        await storage.saveAccessToken(newAccessToken);
        if (newRefreshToken != null) {
          await storage.saveRefreshToken(newRefreshToken);
        }

        // Retry original request
        final retryOptions = err.requestOptions;
        retryOptions.headers['Authorization'] = 'Bearer $newAccessToken';
        final retryResponse = await dio.fetch(retryOptions);
        _isRefreshing = false;
        handler.resolve(retryResponse);
      } catch (_) {
        _isRefreshing = false;
        await storage.clearTokens();
        handler.next(err);
      }
    } else {
      handler.next(err);
    }
  }
}
