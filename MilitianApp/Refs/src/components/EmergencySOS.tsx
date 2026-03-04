import { useState } from 'react';
import { ChevronRight, Phone, MapPin, Camera, Mic, Upload, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';

interface EmergencySOSProps {
  onClose: () => void;
}

export function EmergencySOS({ onClose }: EmergencySOSProps) {
  const [showReport, setShowReport] = useState(true);
  const [showSOSCountdown, setShowSOSCountdown] = useState(false);
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState('');
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const incidentTypes = [
    { id: 'security', icon: '🚨', name: 'Mất an ninh' },
    { id: 'fire', icon: '🔥', name: 'Hỏa hoạn' },
    { id: 'medical', icon: '💊', name: 'Y tế khẩn cấp' },
    { id: 'accident', icon: '🚗', name: 'Tai nạn giao thông' },
    { id: 'utility', icon: '⚡', name: 'Sự cố điện nước' },
    { id: 'other', icon: '📝', name: 'Khác' },
  ];

  const severityLevels = [
    { id: 'low', icon: '🟢', name: 'Thấp', desc: 'Quan sát, không khẩn' },
    { id: 'medium', icon: '🟡', name: 'Trung bình', desc: 'Cần xử lý sớm' },
    { id: 'high', icon: '🟠', name: 'Cao', desc: 'Cần xử lý ngay' },
    { id: 'urgent', icon: '🔴', name: 'Khẩn cấp', desc: 'Nguy hiểm, SOS' },
  ];

  const emergencyContacts = [
    { id: '1', name: 'Công An Khu Vực', phone: '0901234567', icon: '🚨', color: 'bg-[#EF4444]' },
    { id: '2', name: 'Công An Phường', phone: '0901234568', icon: '🚓', color: 'bg-[#F59E0B]' },
    { id: '3', name: 'Cấp cứu 115', phone: '115', icon: '🚑', color: 'bg-[#10B981]' },
    { id: '4', name: 'Cứu hỏa 114', phone: '114', icon: '🔥', color: 'bg-[#EF4444]' },
    { id: '5', name: 'Người thân', phone: '0916789012', icon: '👨‍👩‍👧', color: 'bg-[#3B82F6]' },
  ];

  const handleSubmitReport = () => {
    setShowSuccess(true);
    setTimeout(() => {
      onClose();
    }, 2500);
  };

  const handleSOSPress = () => {
    setShowSOSCountdown(true);
    setTimeout(() => {
      setShowSOSCountdown(false);
      // Trigger emergency call
      alert('Đã gửi cảnh báo khẩn cấp và gọi Công An Khu Vực!');
    }, 3000);
  };

  if (showSOSCountdown) {
    return (
      <div className="fixed inset-0 bg-[#EF4444] z-50 flex flex-col items-center justify-center p-4">
        <div className="text-white text-center">
          <AlertTriangle className="w-24 h-24 mx-auto mb-6 animate-pulse" />
          <h1 className="text-6xl font-bold mb-4 animate-pulse">SOS</h1>
          <p className="text-2xl mb-2">Đang gọi khẩn cấp...</p>
          <p className="text-lg">Công An Khu Vực</p>
        </div>
        <button
          onClick={() => setShowSOSCountdown(false)}
          className="mt-12 px-8 py-3 bg-white text-[#EF4444] rounded-xl font-bold"
        >
          HỦY
        </button>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-[#F8FAFC] z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg text-center max-w-sm w-full animate-[scaleIn_0.5s_ease-out]">
          <div className="w-20 h-20 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[#10B981] mb-2">Đã gửi báo cáo!</h2>
          <p className="text-[#64748B] mb-1">Mã báo cáo: BC-2024-001</p>
          <p className="text-sm text-[#64748B] mb-2">CA KV đang xử lý</p>
          <p className="text-xs text-[#64748B]">Thời gian phản hồi dự kiến: 10-15 phút</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#F8FAFC] z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-[#366092] text-white px-4 py-3 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">SOS & Báo Cáo Sự Cố</h1>
            <p className="text-xs text-white/80">Báo cáo khẩn cấp & liên hệ hỗ trợ</p>
          </div>
        </div>
      </div>

      {showReport ? (
        <div className="p-4 space-y-4 pb-24">
          {/* Incident Type */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-[#0F172A] mb-3">Loại sự cố</h3>
            <div className="grid grid-cols-2 gap-3">
              {incidentTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setIncidentType(type.id)}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    incidentType === type.id
                      ? 'border-[#366092] bg-[#EFF6FF]'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="text-3xl mb-2">{type.icon}</div>
                  <p className="text-sm font-medium text-[#0F172A]">{type.name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-[#0F172A] mb-3">Mức độ nghiêm trọng</h3>
            <div className="space-y-2">
              {severityLevels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setSeverity(level.id)}
                  className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                    severity === level.id
                      ? 'border-[#366092] bg-[#EFF6FF]'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{level.icon}</span>
                    <div className="flex-1">
                      <p className="font-medium text-[#0F172A] text-sm">{level.name}</p>
                      <p className="text-xs text-[#64748B]">{level.desc}</p>
                    </div>
                    {severity === level.id && (
                      <CheckCircle2 className="w-5 h-5 text-[#366092]" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-[#0F172A] mb-3">Vị trí sự cố</h3>
            <div className="bg-gray-200 h-32 rounded-lg mb-3 flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-[#366092]" />
                <p className="text-sm text-[#64748B]">🗺️ Bản đồ GPS</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#64748B]">Vị trí hiện tại</span>
                <span className="text-sm font-medium text-[#10B981]">Đã xác định ✓</span>
              </div>
              <p className="text-sm text-[#0F172A]">123 Đường ABC, Khu phố 1, Phường Phú Định</p>
              <label className="flex items-center gap-2 mt-3">
                <input type="checkbox" className="w-4 h-4 text-[#366092]" defaultChecked />
                <span className="text-sm text-[#0F172A]">Chia sẻ vị trí chính xác</span>
              </label>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-[#0F172A] mb-3">Mô tả sự cố</h3>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tiêu đề sự cố"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:border-[#366092]"
            />
            <div className="relative mb-3">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả chi tiết..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#366092] min-h-24"
                maxLength={500}
              />
              <button className="absolute bottom-3 right-3 p-2 bg-[#366092] text-white rounded-lg">
                <Mic className="w-4 h-4" />
              </button>
            </div>
            <p className={`text-xs ${description.length < 20 ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>
              {description.length < 20 ? `Tối thiểu 20 ký tự (còn ${20 - description.length})` : `${description.length}/500`}
            </p>
          </div>

          {/* Evidence */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-[#0F172A] mb-3">Bằng chứng</h3>
            <div className="grid grid-cols-3 gap-3">
              <button className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-[#366092] transition-colors">
                <Camera className="w-6 h-6 text-[#64748B] mb-1" />
                <span className="text-xs text-[#64748B]">Chụp ảnh</span>
              </button>
              <button className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-[#366092] transition-colors">
                <Upload className="w-6 h-6 text-[#64748B] mb-1" />
                <span className="text-xs text-[#64748B]">Tải ảnh</span>
              </button>
              <button className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-[#366092] transition-colors">
                <Mic className="w-6 h-6 text-[#64748B] mb-1" />
                <span className="text-xs text-[#64748B]">Ghi âm</span>
              </button>
            </div>
            <p className="text-xs text-[#64748B] mt-2">Ảnh: Tối đa 10 ảnh • Video: Tối đa 30s • Âm thanh: Tối đa 60s</p>
          </div>

          {/* People Involved */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-[#0F172A] mb-3">Người liên quan</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-[#64748B] mb-1 block">Số người liên quan</label>
                <div className="flex items-center gap-3">
                  <button className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center font-bold text-[#366092]">
                    -
                  </button>
                  <input
                    type="number"
                    defaultValue="0"
                    className="flex-1 text-center py-2 border border-gray-300 rounded-lg"
                  />
                  <button className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center font-bold text-[#366092]">
                    +
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="w-4 h-4 text-[#366092]" />
                <span className="text-sm text-[#0F172A]">Có người bị thương</span>
              </label>
            </div>
          </div>

          {/* Immediate Actions */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-[#0F172A] mb-3">Hành động đã thực hiện</h3>
            <div className="space-y-2">
              {[
                'Đã gọi cấp cứu 115',
                'Đã thông báo CA Phường',
                'Đã sơ tán người dân',
                'Đã phong tỏa hiện trường',
              ].map((action, index) => (
                <label key={index} className="flex items-center gap-2">
                  <input type="checkbox" className="w-4 h-4 text-[#366092]" />
                  <span className="text-sm text-[#0F172A]">{action}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4 pb-24">
          {/* SOS Button */}
          <div className="bg-gradient-to-br from-[#EF4444] to-[#DC2626] rounded-xl p-6 shadow-lg">
            <div className="text-center mb-4">
              <AlertTriangle className="w-16 h-16 text-white mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-white mb-2">Khẩn Cấp SOS</h2>
              <p className="text-white/90 text-sm">Nhấn giữ 2 giây để kích hoạt</p>
            </div>
            <button
              onMouseDown={handleSOSPress}
              className="w-full py-4 bg-white text-[#EF4444] rounded-xl font-bold text-lg active:scale-95 transition-transform"
            >
              KÍCH HOẠT SOS
            </button>
            <p className="text-white/80 text-xs text-center mt-3">
              Sẽ tự động gọi CA Khu Vực và gửi vị trí của bạn
            </p>
          </div>

          {/* Emergency Contacts */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-semibold text-[#0F172A] mb-4">Liên hệ khẩn cấp</h3>
            <div className="space-y-3">
              {emergencyContacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className={`w-12 h-12 ${contact.color} rounded-full flex items-center justify-center text-2xl`}>
                    {contact.icon}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-[#0F172A] text-sm">{contact.name}</p>
                    <p className="text-xs text-[#64748B]">{contact.phone}</p>
                  </div>
                  <button className="px-4 py-2 bg-[#10B981] text-white rounded-lg font-medium text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Gọi
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Submit Button - Only show for report form */}
      {showReport && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 p-4">
          <button
            onClick={handleSubmitReport}
            disabled={!incidentType || !severity || description.length < 20 || !title}
            className={`w-full py-3 rounded-xl font-bold text-white transition-all ${
              incidentType && severity && description.length >= 20 && title
                ? severity === 'urgent'
                  ? 'bg-[#EF4444]'
                  : severity === 'high'
                  ? 'bg-[#F59E0B]'
                  : 'bg-[#366092]'
                : 'bg-gray-300 cursor-not-allowed'
            }`}
          >
            {severity === 'urgent' ? 'GỬI BÁO CÁO KHẨN' : 'GỬI BÁO CÁO'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}