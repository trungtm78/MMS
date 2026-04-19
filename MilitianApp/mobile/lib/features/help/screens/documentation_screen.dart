import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';

class DocumentationScreen extends ConsumerWidget {
  const DocumentationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(children: [
        // Header
        Container(
          decoration: const BoxDecoration(gradient: AppColors.headerGradient,
            border: Border(bottom: BorderSide(color: AppColors.primary, width: 4))),
          child: SafeArea(bottom: false, child: Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 16, 12),
            child: Row(children: [
              IconButton(icon: const Icon(Icons.arrow_back_ios, color: AppColors.navy),
                onPressed: () => Navigator.of(context).maybePop()),
              const Expanded(child: Text('Hướng Dẫn Sử Dụng',
                style: TextStyle(color: AppColors.textPrimary, fontSize: 20,
                    fontWeight: FontWeight.w800), textAlign: TextAlign.center)),
              const SizedBox(width: 48),
            ]),
          )),
        ),

        // Body
        Expanded(child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: const [
            _IntroCard(),
            SizedBox(height: 12),
            _Section(
              icon: Icons.fingerprint,
              iconColor: AppColors.navy,
              title: 'Hướng dẫn chấm công',
              items: [
                _Item('Chấm công hàng ngày', [
                  'Vào tab "Điểm danh" → nhấn nút "Chấm công" lớn ở giữa.',
                  'Bật GPS và đứng trong bán kính 50m từ địa điểm quy định.',
                  'Nhấn xác nhận — hệ thống ghi nhận thời gian và vị trí.',
                  'Chấm công ra tương tự khi kết thúc ca làm việc.',
                ]),
                _Item('Xem lịch sử chấm công', [
                  'Vào tab "Điểm danh" → kéo xuống để xem lịch tháng.',
                  'Xanh: đúng giờ | Vàng: muộn | Đỏ: vắng mặt.',
                  'Nhấn ngày cụ thể để xem chi tiết.',
                ]),
              ],
            ),
            SizedBox(height: 12),
            _Section(
              icon: Icons.description_outlined,
              iconColor: AppColors.blue,
              title: 'Hướng dẫn báo cáo',
              items: [
                _Item('Gửi báo cáo công việc', [
                  'Nhấn "Báo cáo" trên Trang chủ → chọn loại báo cáo.',
                  'Chọn nhiệm vụ liên quan và điền mô tả (tối thiểu 20 ký tự).',
                  'Đính kèm ảnh/tài liệu nếu cần (tối đa 10 file).',
                  'Nhấn "Gửi báo cáo" — cấp trên nhận thông báo ngay.',
                ]),
                _Item('Báo cáo SOS khẩn cấp', [
                  'Nhấn nút đỏ "SOS" trên Trang chủ.',
                  'Chọn loại sự cố và mô tả ngắn gọn.',
                  'Ứng dụng tự động gửi vị trí GPS.',
                  'Toàn bộ DQTV trong bán kính 5km được thông báo.',
                ]),
              ],
            ),
            SizedBox(height: 12),
            _Section(
              icon: Icons.task_alt_outlined,
              iconColor: AppColors.success,
              title: 'Hướng dẫn nhiệm vụ',
              items: [
                _Item('Xem và tiếp nhận nhiệm vụ', [
                  'Vào tab "Nhiệm vụ" → nhiệm vụ mới có nhãn vàng "Chưa tiếp nhận".',
                  'Nhấn vào nhiệm vụ, đọc mô tả và hạn chót.',
                  'Nhấn "Tiếp nhận nhiệm vụ" để xác nhận bắt đầu.',
                ]),
                _Item('Cập nhật tiến độ', [
                  'Nhấn vào nhiệm vụ đang thực hiện → "Cập nhật tiến độ".',
                  'Chọn trạng thái mới và thêm ghi chú/ảnh minh chứng.',
                  'Nhấn "Lưu" — cấp trên nhận thông báo cập nhật.',
                ]),
                _Item('Giao nhiệm vụ mới (dành cho cấp trên)', [
                  'Vào tab "Nhiệm vụ" → nhấn nút "+" góc trên phải.',
                  'Chọn loại nhiệm vụ, ưu tiên, điền thông tin đầy đủ.',
                  'Chọn DQTV phụ trách → nhấn "Giao nhiệm vụ".',
                ]),
              ],
            ),
            SizedBox(height: 12),
            _Section(
              icon: Icons.help_outline,
              iconColor: AppColors.warning,
              title: 'Câu hỏi thường gặp',
              items: [
                _Item('Quên mật khẩu?', [
                  'Tại màn hình đăng nhập → nhấn "Quên mật khẩu?".',
                  'Nhập số điện thoại đã đăng ký và nhận mã OTP qua SMS.',
                  'Tạo mật khẩu mới ít nhất 8 ký tự gồm chữ và số.',
                ]),
                _Item('Ứng dụng không nhận GPS?', [
                  'Cài đặt điện thoại → Ứng dụng → MMS DQTV → Vị trí → "Luôn cho phép".',
                  'Đảm bảo Dịch vụ định vị đang bật.',
                  'Ra ngoài nếu đang ở trong nhà — GPS yếu khi có mái che.',
                ]),
                _Item('Dữ liệu không đồng bộ khi mất mạng?', [
                  'Ứng dụng có chế độ offline — dữ liệu được lưu cục bộ.',
                  'Khi có mạng, ứng dụng tự đồng bộ trong vòng 30 giây.',
                  'Nhấn biểu tượng làm mới (↻) để đồng bộ thủ công.',
                ]),
                _Item('Liên hệ hỗ trợ kỹ thuật?', [
                  'Tab "Cá nhân" → "Hỗ trợ & Phản hồi" → mô tả vấn đề.',
                  'Hotline: 1800-xxxx (miễn phí, 8:00–17:00 ngày làm việc).',
                  'Email: support@dqtv-phudinhh.gov.vn',
                ]),
              ],
            ),
          ],
        )),
      ]),
    );
  }
}

// ── Intro card ────────────────────────────────────────────────────────────────
class _IntroCard extends StatelessWidget {
  const _IntroCard();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: [AppColors.navy, AppColors.navyLight]),
      borderRadius: BorderRadius.circular(12)),
    child: Row(children: [
      Container(width: 48, height: 48,
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.2),
            shape: BoxShape.circle),
        child: const Icon(Icons.menu_book_outlined, color: Colors.white, size: 26)),
      const SizedBox(width: 14),
      const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Hệ thống Quản lý DQTV',
          style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
        SizedBox(height: 4),
        Text('Phường Phú Định • TP.HCM\nTài liệu hướng dẫn sử dụng',
          style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.4)),
      ])),
    ]),
  );
}

// ── Data model ────────────────────────────────────────────────────────────────
class _Item {
  final String title;
  final List<String> steps;
  const _Item(this.title, this.steps);
}

// ── Accordion section ─────────────────────────────────────────────────────────
class _Section extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final List<_Item> items;
  const _Section({required this.icon, required this.iconColor,
      required this.title, required this.items});

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)]),
    child: Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        leading: Container(width: 36, height: 36,
          decoration: BoxDecoration(color: iconColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, color: iconColor, size: 20)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700,
            fontSize: 14, color: AppColors.textPrimary)),
        childrenPadding: EdgeInsets.zero,
        children: items.map((item) => _ItemTile(item: item)).toList(),
      ),
    ),
  );
}

// ── Nested item tile ──────────────────────────────────────────────────────────
class _ItemTile extends StatelessWidget {
  final _Item item;
  const _ItemTile({required this.item});

  @override
  Widget build(BuildContext context) => Theme(
    data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
    child: ExpansionTile(
      tilePadding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      leading: const Icon(Icons.chevron_right, color: AppColors.textSecondary, size: 18),
      title: Text(item.title, style: const TextStyle(fontSize: 13,
          fontWeight: FontWeight.w600, color: AppColors.textDark)),
      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      children: [
        Container(
          width: double.infinity, padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.cardHover,
              borderRadius: BorderRadius.circular(8)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start,
            children: item.steps.asMap().entries.map((e) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(width: 20, height: 20,
                  margin: const EdgeInsets.only(right: 8, top: 1),
                  decoration: const BoxDecoration(color: AppColors.navy, shape: BoxShape.circle),
                  child: Center(child: Text('${e.key + 1}',
                    style: const TextStyle(color: Colors.white,
                        fontSize: 10, fontWeight: FontWeight.bold)))),
                Expanded(child: Text(e.value, style: const TextStyle(
                    fontSize: 12, color: AppColors.textDark, height: 1.5))),
              ]))).toList()),
        ),
      ],
    ),
  );
}
