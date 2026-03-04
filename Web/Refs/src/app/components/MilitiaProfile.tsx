import { useState } from 'react';
import { User, Edit, ArrowLeft, MapPin, Phone, Mail, Calendar, Award, Shield, Briefcase } from 'lucide-react';
import { users, dqtvPersonnel } from '@/data/mockData';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';

interface MilitiaProfileProps {
  militiaId: string | null;
  onEdit: (id: string) => void;
  onBack: () => void;
}

export function MilitiaProfile({ militiaId, onEdit, onBack }: MilitiaProfileProps) {
  const [activeTab, setActiveTab] = useState('personal');

  // Find DQTV from mock data
  const dqtvUser = users.find(u => u.dqtvCode === militiaId || u.id.toString() === militiaId);
  const dqtvDetail = dqtvPersonnel.find(d => d.code === militiaId);

  // Mock data - in real app, this would be fetched based on militiaId
  const profileData = {
    id: militiaId || 'DQTV001',
    name: dqtvUser?.fullName || 'Nguyễn Văn Minh',
    position: 'Phó chỉ huy',
    status: 'active',
    cccd: dqtvDetail?.idCard || '079095001234',
    dob: dqtvDetail?.dateOfBirth || '15/03/1995',
    gender: dqtvDetail?.gender === 'male' ? 'Nam' : 'Nữ',
    ethnicity: 'Kinh',
    address: dqtvDetail?.address || '123 Đường Nguyễn Văn Linh, Khu phố 1, Phường Tân Phú, Quận 7, TP.HCM',
    phone: dqtvUser?.phone || '0901234567',
    email: dqtvUser?.email || 'nguyenvanminh@email.com',
    unit: 'Khu phố 1',
    joinDate: dqtvDetail?.joinDate || '01/01/2020',
    rank: dqtvDetail?.rank || 'Hạ sĩ',
    yearsOfService: 4,
    avatar: dqtvUser?.avatar,
  };

  const tabs = [
    { id: 'personal', label: 'Hồ sơ cá nhân', icon: User },
    { id: 'history', label: 'Quá trình công tác', icon: Briefcase },
    { id: 'training', label: 'Huấn luyện', icon: Award },
    { id: 'rewards', label: 'Khen thưởng - Kỷ luật', icon: Award },
    { id: 'documents', label: 'Hồ sơ đính kèm', icon: Shield },
    { id: 'changelog', label: 'Lịch sử chỉnh sửa', icon: Calendar },
  ];

  const workHistory = [
    { period: '01/2023 - Hiện tại', position: 'Phó chỉ huy', unit: 'Khu phố 1', notes: 'Thăng chức' },
    { period: '01/2021 - 12/2022', position: 'Tổ trưởng', unit: 'Khu phố 1', notes: '' },
    { period: '01/2020 - 12/2020', position: 'Chiến sĩ', unit: 'Khu phố 1', notes: 'Mới tuyển' },
  ];

  const trainingHistory = [
    { date: '15/11/2023', course: 'Huấn luyện chiến đấu cơ bản', duration: '5 ngày', result: 'Đạt' },
    { date: '20/05/2023', course: 'Kỹ năng chỉ huy đơn vị', duration: '3 ngày', result: 'Khá' },
    { date: '10/12/2022', course: 'Phòng cháy chữa cháy', duration: '2 ngày', result: 'Giỏi' },
    { date: '05/06/2022', course: 'Sơ cứu cấp cứu', duration: '2 ngày', result: 'Đạt' },
  ];

  const rewardsPunishments = [
    { date: '01/09/2023', type: 'Khen thưởng', title: 'Chiến sĩ thi đua cơ sở', level: 'Cấp Phường' },
    { date: '15/04/2022', type: 'Khen thưởng', title: 'Hoàn thành xuất sắc nhiệm vụ', level: 'Cấp Quận' },
  ];

  const changeLog = [
    { date: '22/01/2026 10:30', user: 'Đại úy Nguyễn Văn An', action: 'Cập nhật số điện thoại' },
    { date: '15/01/2026 14:20', user: 'Thượng úy Trần Văn B', action: 'Cập nhật địa chỉ thường trú' },
    { date: '10/01/2026 09:15', user: 'Đại úy Nguyễn Văn An', action: 'Thăng chức Phó chỉ huy' },
  ];

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'active': return { label: 'Đang hoạt động', class: 'bg-green-100 text-green-700' };
      case 'reserve': return { label: 'Dự bị', class: 'bg-yellow-100 text-yellow-700' };
      case 'inactive': return { label: 'Đã xuất ngũ', class: 'bg-gray-100 text-gray-700' };
      default: return { label: status, class: 'bg-gray-100 text-gray-700' };
    }
  };

  const statusInfo = getStatusDisplay(profileData.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Chi tiết Dân Quân Tự Vệ</h1>
            <p className="text-sm text-gray-500 mt-1">Thông tin đầy đủ và lịch sử hoạt động</p>
          </div>
        </div>
        <button
          onClick={() => militiaId && onEdit(militiaId)}
          className="px-4 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
        >
          <Edit size={16} />
          Chỉnh sửa
        </button>
      </div>

      {/* Profile Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="flex items-start gap-6">
          <div className="w-32 h-32 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center rounded-lg border-2 border-gray-300">
            {profileData.avatar ? (
              <ImageWithFallback
                src={profileData.avatar}
                alt={profileData.name}
                className="w-32 h-32 rounded-lg"
              />
            ) : (
              <User size={56} className="text-gray-400" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{profileData.name}</h2>
                <p className="text-base text-gray-600 mb-4">
                  Mã DQTV: <span className="font-semibold text-[#1F3A5F]">{profileData.id}</span>
                </p>
                <div className="flex flex-wrap items-center gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-2 rounded-lg">
                    <Shield size={16} className="text-[#2E7D32]" />
                    <span className="font-medium">{profileData.position}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-2 rounded-lg">
                    <MapPin size={16} className="text-gray-500" />
                    <span>{profileData.unit}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-2 rounded-lg">
                    <Calendar size={16} className="text-gray-500" />
                    <span>Tham gia: {profileData.joinDate}</span>
                  </div>
                </div>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${statusInfo.class}`}>
                  {statusInfo.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200 flex overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 relative ${
                  activeTab === tab.id
                    ? 'text-[#1F3A5F] bg-gray-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1F3A5F]"></div>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-8">
          {activeTab === 'personal' && (
            <div className="grid grid-cols-2 gap-x-12 gap-y-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Số CCCD</label>
                <p className="text-sm text-gray-900 font-medium">{profileData.cccd}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Ngày sinh</label>
                <p className="text-sm text-gray-900 font-medium">{profileData.dob}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Giới tính</label>
                <p className="text-sm text-gray-900 font-medium">{profileData.gender}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Dân tộc</label>
                <p className="text-sm text-gray-900 font-medium">{profileData.ethnicity}</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Địa chỉ thường trú</label>
                <p className="text-sm text-gray-900 font-medium">{profileData.address}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Số điện thoại</label>
                <p className="text-sm text-gray-900 font-medium flex items-center gap-2">
                  <Phone size={14} className="text-gray-500" />
                  {profileData.phone}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Email</label>
                <p className="text-sm text-gray-900 font-medium flex items-center gap-2">
                  <Mail size={14} className="text-gray-500" />
                  {profileData.email}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Quân hàm</label>
                <p className="text-sm text-gray-900 font-medium">{profileData.rank}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Số năm phục vụ</label>
                <p className="text-sm text-gray-900 font-medium">{profileData.yearsOfService} năm</p>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tl-lg">Thời gian</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Chức vụ</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Đơn vị</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tr-lg">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {workHistory.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 text-sm text-gray-700">{item.period}</td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{item.position}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.unit}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{item.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'training' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tl-lg">Ngày</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Khóa huấn luyện</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Thời gian</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tr-lg">Kết quả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {trainingHistory.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 text-sm text-gray-700">{item.date}</td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{item.course}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.duration}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.result === 'Giỏi' ? 'bg-green-100 text-green-700' :
                          item.result === 'Khá' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {item.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'rewards' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tl-lg">Ngày</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Loại</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Nội dung</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tr-lg">Cấp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rewardsPunishments.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 text-sm text-gray-700">{item.date}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium gap-1 ${
                          item.type === 'Khen thưởng' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {item.type === 'Khen thưởng' && <Award size={12} />}
                          {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{item.title}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">Chưa có tài liệu đính kèm</p>
            </div>
          )}

          {activeTab === 'changelog' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tl-lg">Thời gian</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Người thực hiện</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase rounded-tr-lg">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {changeLog.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 text-sm text-gray-700">{item.date}</td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{item.user}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{item.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}