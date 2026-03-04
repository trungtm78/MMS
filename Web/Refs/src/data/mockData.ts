// Mock Data cho Hệ Thống Quản Lý Dân Quân Tự Vệ
// Phường Phú Định - TP.HCM

// Avatar URLs from Unsplash
const AVATAR_URLS = {
  // Male avatars
  male1: 'https://images.unsplash.com/photo-1661588156316-cdcbe2e0c8ad?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  male2: 'https://images.unsplash.com/photo-1734864489622-0406baee014f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  male3: 'https://images.unsplash.com/photo-1649573651096-c6e256708ec9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  male4: 'https://images.unsplash.com/photo-1609834265293-462cb479a028?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  
  // Female avatars
  female1: 'https://images.unsplash.com/photo-1490088715170-e367d03a58f7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  female2: 'https://images.unsplash.com/photo-1581065178026-390bc4e78dad?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  female3: 'https://images.unsplash.com/photo-1700577048134-8fa9991c54c6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  female4: 'https://images.unsplash.com/photo-1531498352491-042fbae4cf57?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  
  // Police/Military
  police1: 'https://images.unsplash.com/photo-1697131997056-287d3b732bf2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
  military1: 'https://images.unsplash.com/photo-1718590812275-ba4ac7cb5297?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400',
};

export interface User {
  id: number;
  username: string;
  password: string; // Plain text for demo only
  email: string;
  role: 'system_admin' | 'ubnd_leader' | 'police_ward' | 'police_area' | 'office_staff' | 'dqtv';
  fullName: string;
  phone: string;
  position?: string;
  badgeNumber?: string;
  dqtvCode?: string;
  districtId?: number;
  policeAreaId?: number;
  status: 'active' | 'on_leave' | 'suspended';
  avatar?: string;
}

export interface District {
  id: number;
  name: string;
  code: string;
  description: string;
  areaKm2: number;
  population: number;
  status: 'active';
}

export interface DQTVPersonnel {
  id: number;
  code: string;
  fullName: string;
  gender: 'male' | 'female';
  dateOfBirth: string;
  idCard: string;
  phone: string;
  email: string;
  address: string;
  districtId: number;
  policeAreaId: number;
  position: string;
  rank: string;
  status: 'active' | 'on_leave' | 'suspended';
  joinDate: string;
  avatar?: string;
}

export interface Task {
  id: number;
  code: string;
  title: string;
  description: string;
  type: 'patrol' | 'incident' | 'propaganda' | 'support';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'rejected';
  assignedBy: number;
  assignedTo: number;
  districtId: number;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  deadline: string;
  createdAt: string;
}

export interface Attendance {
  id: number;
  dqtvId: number;
  date: string;
  checkInTime?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutTime?: string;
  checkOutLat?: number;
  checkOutLng?: number;
  status: 'present' | 'late' | 'absent' | 'leave';
  notes?: string;
}

export interface LeaveRequest {
  id: number;
  dqtvId: number;
  fromDate: string;
  toDate: string;
  reason: string;
  type: 'paid' | 'unpaid' | 'sick';
  replacementId?: number;
  status: 'pending' | 'approved' | 'rejected';
  approverId?: number;
  approvedAt?: string;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  type: 'task_assigned' | 'task_overdue' | 'leave_approved' | 'leave_pending' | 'gps_alert' | 'monthly_report';
  title: string;
  message: string;
  priority: 'normal' | 'high' | 'urgent';
  isRead: boolean;
  relatedId?: number;
  createdAt: string;
}

export interface GPSLog {
  id: number;
  dqtvId: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number;
  address: string;
  batteryLevel: number;
  timestamp: string;
}

export interface KPIScore {
  id: number;
  dqtvId: number;
  month: number;
  year: number;
  attendanceScore: number;
  taskScore: number;
  disciplineScore: number;
  evaluationScore: number;
  attitudeScore: number;
  totalScore: number;
  rank: 'excellent' | 'good' | 'average' | 'poor';
  status: 'draft' | 'finalized';
  createdAt: string;
}

export interface ChiTieuScore {
  id: number;
  dqtvId: number;
}

// ===========================================
// DISTRICTS DATA
// ===========================================

export const districts: District[] = [
  {
    id: 1,
    name: 'Khu phố 1',
    code: 'KP-01',
    description: 'Khu vực trung tâm, thương mại sầm uất',
    areaKm2: 2.5,
    population: 8500,
    status: 'active'
  },
  {
    id: 2,
    name: 'Khu phố 2',
    code: 'KP-02',
    description: 'Khu dân cư đông đúc, nhiều chung cư',
    areaKm2: 3.2,
    population: 12000,
    status: 'active'
  },
  {
    id: 3,
    name: 'Khu phố 3',
    code: 'KP-03',
    description: 'Khu vực gần chợ, hoạt động buôn bán sôi động',
    areaKm2: 2.8,
    population: 9500,
    status: 'active'
  },
  {
    id: 4,
    name: 'Khu phố 4',
    code: 'KP-04',
    description: 'Khu công nghiệp nhẹ, nhà xưởng',
    areaKm2: 4.1,
    population: 6500,
    status: 'active'
  },
  {
    id: 5,
    name: 'Khu phố 5',
    code: 'KP-05',
    description: 'Khu dân cư yên tĩnh, nhiều công viên',
    areaKm2: 3.5,
    population: 7800,
    status: 'active'
  },
  {
    id: 6,
    name: 'Khu phố 6',
    code: 'KP-06',
    description: 'Khu vực ven, đang phát triển',
    areaKm2: 5.0,
    population: 5200,
    status: 'active'
  }
];

// ===========================================
// USERS DATA (TÀI KHOẢN DEMO)
// ===========================================

export const users: User[] = [
  // 1. SYSTEM ADMIN
  {
    id: 1,
    username: 'admin',
    password: 'Admin@123',
    email: 'admin@dqtv.com',
    role: 'system_admin',
    fullName: 'Nguyễn Văn Admin',
    phone: '0901234567',
    position: 'Quản trị viên hệ thống',
    status: 'active'
  },

  // 2-3. LÃNH ĐẠO UBND
  {
    id: 2,
    username: 'lanhdao1',
    password: 'Leader@123',
    email: 'lanhdao1@ubnd-phd.gov.vn',
    role: 'ubnd_leader',
    fullName: 'Trần Thị Minh Châu',
    phone: '0902345678',
    position: 'Phó Chủ tịch UBND',
    status: 'active'
  },
  {
    id: 3,
    username: 'lanhdao2',
    password: 'Leader@456',
    email: 'lanhdao2@ubnd-phd.gov.vn',
    role: 'ubnd_leader',
    fullName: 'Lê Văn Hùng',
    phone: '0903456789',
    position: 'Trưởng phòng Nội vụ',
    status: 'active'
  },

  // 4-5. CÔNG AN PHƯỜNG
  {
    id: 4,
    username: 'caphuong',
    password: 'Police@123',
    email: 'caphuong@catp.hcm.gov.vn',
    role: 'police_ward',
    fullName: 'Đại úy Phạm Minh Tuấn',
    phone: '0904567890',
    position: 'Trưởng Công An Phường',
    badgeNumber: 'CA-PHD-001',
    status: 'active'
  },
  {
    id: 5,
    username: 'phocaphuong',
    password: 'Police@456',
    email: 'phocaphuong@catp.hcm.gov.vn',
    role: 'police_ward',
    fullName: 'Thượng úy Nguyễn Văn Nam',
    phone: '0905678901',
    position: 'Phó Trưởng CA Phường',
    badgeNumber: 'CA-PHD-002',
    status: 'active'
  },

  // 6-11. CÔNG AN KHU VỰC (1 per district)
  {
    id: 6,
    username: 'cakv1',
    password: 'CAKV@123',
    email: 'cakv1@catp.hcm.gov.vn',
    role: 'police_area',
    fullName: 'Trung úy Võ Văn Tân',
    phone: '0906789012',
    position: 'CA Khu vực 1',
    badgeNumber: 'CA-KV-001',
    districtId: 1,
    status: 'active'
  },
  {
    id: 7,
    username: 'cakv2',
    password: 'CAKV@223',
    email: 'cakv2@catp.hcm.gov.vn',
    role: 'police_area',
    fullName: 'Trung úy Hoàng Minh Đức',
    phone: '0907890123',
    position: 'CA Khu vực 2',
    badgeNumber: 'CA-KV-002',
    districtId: 2,
    status: 'active'
  },
  {
    id: 8,
    username: 'cakv3',
    password: 'CAKV@323',
    email: 'cakv3@catp.hcm.gov.vn',
    role: 'police_area',
    fullName: 'Thượng úy Trần Văn Hải',
    phone: '0908901234',
    position: 'CA Khu vực 3',
    badgeNumber: 'CA-KV-003',
    districtId: 3,
    status: 'active'
  },
  {
    id: 9,
    username: 'cakv4',
    password: 'CAKV@423',
    email: 'cakv4@catp.hcm.gov.vn',
    role: 'police_area',
    fullName: 'Trung úy Lê Thị Lan',
    phone: '0909012345',
    position: 'CA Khu vực 4',
    badgeNumber: 'CA-KV-004',
    districtId: 4,
    status: 'active'
  },
  {
    id: 10,
    username: 'cakv5',
    password: 'CAKV@523',
    email: 'cakv5@catp.hcm.gov.vn',
    role: 'police_area',
    fullName: 'Trung úy Nguyễn Văn Phong',
    phone: '0910123456',
    position: 'CA Khu vực 5',
    badgeNumber: 'CA-KV-005',
    districtId: 5,
    status: 'active'
  },
  {
    id: 11,
    username: 'cakv6',
    password: 'CAKV@623',
    email: 'cakv6@catp.hcm.gov.vn',
    role: 'police_area',
    fullName: 'Thượng úy Phan Văn Long',
    phone: '0911234567',
    position: 'CA Khu vực 6',
    badgeNumber: 'CA-KV-006',
    districtId: 6,
    status: 'active'
  },

  // 12-14. NHÂN VIÊN VĂN PHÒNG
  {
    id: 12,
    username: 'nvvp1',
    password: 'Staff@123',
    email: 'nvvp1@ubnd-phd.gov.vn',
    role: 'office_staff',
    fullName: 'Nguyễn Thị Hoa',
    phone: '0912345678',
    position: 'Nhân viên Hành chính',
    status: 'active'
  },
  {
    id: 13,
    username: 'nvvp2',
    password: 'Staff@456',
    email: 'nvvp2@ubnd-phd.gov.vn',
    role: 'office_staff',
    fullName: 'Trần Văn Bình',
    phone: '0913456789',
    position: 'Nhân viên Tổng hợp',
    status: 'active'
  },
  {
    id: 14,
    username: 'nvvp3',
    password: 'Staff@789',
    email: 'nvvp3@ubnd-phd.gov.vn',
    role: 'office_staff',
    fullName: 'Lê Thị Mai',
    phone: '0914567890',
    position: 'Kế toán',
    status: 'active'
  },

  // 15-34. DQTV ACCOUNTS (20 demo accounts)
  // Khu phố 1
  {
    id: 15,
    username: 'dqtv001',
    password: 'DQTV@001',
    email: 'dqtv001@dqtv.com',
    role: 'dqtv',
    fullName: 'Nguyễn Văn An',
    phone: '0915678901',
    dqtvCode: 'HCM-PHD-T12-0001',
    districtId: 1,
    policeAreaId: 6,
    status: 'active',
    avatar: AVATAR_URLS.male1
  },
  {
    id: 16,
    username: 'dqtv002',
    password: 'DQTV@002',
    email: 'dqtv002@dqtv.com',
    role: 'dqtv',
    fullName: 'Trần Thị Bích',
    phone: '0916789012',
    dqtvCode: 'HCM-PHD-T12-0002',
    districtId: 1,
    policeAreaId: 6,
    status: 'active',
    avatar: AVATAR_URLS.female1
  },
  {
    id: 17,
    username: 'dqtv003',
    password: 'DQTV@003',
    email: 'dqtv003@dqtv.com',
    role: 'dqtv',
    fullName: 'Lê Văn Cường',
    phone: '0917890123',
    dqtvCode: 'HCM-PHD-T12-0003',
    districtId: 1,
    policeAreaId: 6,
    status: 'active',
    avatar: AVATAR_URLS.male2
  },
  {
    id: 18,
    username: 'dqtv004',
    password: 'DQTV@004',
    email: 'dqtv004@dqtv.com',
    role: 'dqtv',
    fullName: 'Phạm Thị Dung',
    phone: '0918901234',
    dqtvCode: 'HCM-PHD-T12-0004',
    districtId: 1,
    policeAreaId: 6,
    status: 'on_leave',
    avatar: AVATAR_URLS.female2
  },

  // Khu phố 2
  {
    id: 19,
    username: 'dqtv005',
    password: 'DQTV@005',
    email: 'dqtv005@dqtv.com',
    role: 'dqtv',
    fullName: 'Hoàng Văn Đức',
    phone: '0919012345',
    dqtvCode: 'HCM-PHD-T12-0005',
    districtId: 2,
    policeAreaId: 7,
    status: 'active',
    avatar: AVATAR_URLS.male3
  },
  {
    id: 20,
    username: 'dqtv006',
    password: 'DQTV@006',
    email: 'dqtv006@dqtv.com',
    role: 'dqtv',
    fullName: 'Võ Thị Em',
    phone: '0920123456',
    dqtvCode: 'HCM-PHD-T12-0006',
    districtId: 2,
    policeAreaId: 7,
    status: 'active',
    avatar: AVATAR_URLS.female3
  },
  {
    id: 21,
    username: 'dqtv007',
    password: 'DQTV@007',
    email: 'dqtv007@dqtv.com',
    role: 'dqtv',
    fullName: 'Đặng Văn Phúc',
    phone: '0921234567',
    dqtvCode: 'HCM-PHD-T12-0007',
    districtId: 2,
    policeAreaId: 7,
    status: 'active',
    avatar: AVATAR_URLS.male4
  },
  {
    id: 22,
    username: 'dqtv008',
    password: 'DQTV@008',
    email: 'dqtv008@dqtv.com',
    role: 'dqtv',
    fullName: 'Ngô Thị Giang',
    phone: '0922345678',
    dqtvCode: 'HCM-PHD-T12-0008',
    districtId: 2,
    policeAreaId: 7,
    status: 'active',
    avatar: AVATAR_URLS.female4
  },

  // Khu phố 3
  {
    id: 23,
    username: 'dqtv009',
    password: 'DQTV@009',
    email: 'dqtv009@dqtv.com',
    role: 'dqtv',
    fullName: 'Bùi Văn Hùng',
    phone: '0923456789',
    dqtvCode: 'HCM-PHD-T12-0009',
    districtId: 3,
    policeAreaId: 8,
    status: 'active',
    avatar: AVATAR_URLS.male1
  },
  {
    id: 24,
    username: 'dqtv010',
    password: 'DQTV@010',
    email: 'dqtv010@dqtv.com',
    role: 'dqtv',
    fullName: 'Trương Thị Hương',
    phone: '0924567890',
    dqtvCode: 'HCM-PHD-T12-0010',
    districtId: 3,
    policeAreaId: 8,
    status: 'active',
    avatar: AVATAR_URLS.female1
  },
  {
    id: 25,
    username: 'dqtv011',
    password: 'DQTV@011',
    email: 'dqtv011@dqtv.com',
    role: 'dqtv',
    fullName: 'Phan Văn Khoa',
    phone: '0925678901',
    dqtvCode: 'HCM-PHD-T12-0011',
    districtId: 3,
    policeAreaId: 8,
    status: 'active',
    avatar: AVATAR_URLS.male2
  },
  {
    id: 26,
    username: 'dqtv012',
    password: 'DQTV@012',
    email: 'dqtv012@dqtv.com',
    role: 'dqtv',
    fullName: 'Đinh Thị Linh',
    phone: '0926789012',
    dqtvCode: 'HCM-PHD-T12-0012',
    districtId: 3,
    policeAreaId: 8,
    status: 'active',
    avatar: AVATAR_URLS.female2
  },

  // Khu phố 4
  {
    id: 27,
    username: 'dqtv013',
    password: 'DQTV@013',
    email: 'dqtv013@dqtv.com',
    role: 'dqtv',
    fullName: 'Mai Văn Minh',
    phone: '0927890123',
    dqtvCode: 'HCM-PHD-T12-0013',
    districtId: 4,
    policeAreaId: 9,
    status: 'active',
    avatar: AVATAR_URLS.male3
  },
  {
    id: 28,
    username: 'dqtv014',
    password: 'DQTV@014',
    email: 'dqtv014@dqtv.com',
    role: 'dqtv',
    fullName: 'Lý Thị Ngọc',
    phone: '0928901234',
    dqtvCode: 'HCM-PHD-T12-0014',
    districtId: 4,
    policeAreaId: 9,
    status: 'active',
    avatar: AVATAR_URLS.female3
  },
  {
    id: 29,
    username: 'dqtv015',
    password: 'DQTV@015',
    email: 'dqtv015@dqtv.com',
    role: 'dqtv',
    fullName: 'Vũ Văn Phương',
    phone: '0929012345',
    dqtvCode: 'HCM-PHD-T12-0015',
    districtId: 4,
    policeAreaId: 9,
    status: 'active',
    avatar: AVATAR_URLS.male4
  },
  {
    id: 30,
    username: 'dqtv016',
    password: 'DQTV@016',
    email: 'dqtv016@dqtv.com',
    role: 'dqtv',
    fullName: 'Đỗ Thị Quỳnh',
    phone: '0930123456',
    dqtvCode: 'HCM-PHD-T12-0016',
    districtId: 4,
    policeAreaId: 9,
    status: 'active',
    avatar: AVATAR_URLS.female4
  },

  // Khu phố 5
  {
    id: 31,
    username: 'dqtv017',
    password: 'DQTV@017',
    email: 'dqtv017@dqtv.com',
    role: 'dqtv',
    fullName: 'Dương Văn Sơn',
    phone: '0931234567',
    dqtvCode: 'HCM-PHD-T12-0017',
    districtId: 5,
    policeAreaId: 10,
    status: 'active',
    avatar: AVATAR_URLS.male1
  },
  {
    id: 32,
    username: 'dqtv018',
    password: 'DQTV@018',
    email: 'dqtv018@dqtv.com',
    role: 'dqtv',
    fullName: 'Hồ Thị Thảo',
    phone: '0932345678',
    dqtvCode: 'HCM-PHD-T12-0018',
    districtId: 5,
    policeAreaId: 10,
    status: 'active',
    avatar: AVATAR_URLS.female1
  },

  // Khu phố 6
  {
    id: 33,
    username: 'dqtv019',
    password: 'DQTV@019',
    email: 'dqtv019@dqtv.com',
    role: 'dqtv',
    fullName: 'Cao Văn Tuấn',
    phone: '0933456789',
    dqtvCode: 'HCM-PHD-T12-0019',
    districtId: 6,
    policeAreaId: 11,
    status: 'active',
    avatar: AVATAR_URLS.male2
  },
  {
    id: 34,
    username: 'dqtv020',
    password: 'DQTV@020',
    email: 'dqtv020@dqtv.com',
    role: 'dqtv',
    fullName: 'Tô Thị Uyên',
    phone: '0934567890',
    dqtvCode: 'HCM-PHD-T12-0020',
    districtId: 6,
    policeAreaId: 11,
    status: 'active',
    avatar: AVATAR_URLS.female2
  }
];

// ===========================================
// DQTV PERSONNEL DATA (Mở rộng từ users)
// ===========================================

export const dqtvPersonnel: DQTVPersonnel[] = [
  {
    id: 1,
    code: 'HCM-PHD-T12-0001',
    fullName: 'Nguyễn Văn An',
    gender: 'male',
    dateOfBirth: '1990-05-15',
    idCard: '079090012345',
    phone: '0915678901',
    email: 'dqtv001@dqtv.com',
    address: '123 Đường Lê Lợi, Khu phố 1',
    districtId: 1,
    policeAreaId: 6,
    position: 'Dân quân',
    rank: 'Hạ sĩ',
    status: 'active',
    joinDate: '2020-01-15'
  },
  {
    id: 2,
    code: 'HCM-PHD-T12-0002',
    fullName: 'Trần Thị Bích',
    gender: 'female',
    dateOfBirth: '1992-08-20',
    idCard: '079092034567',
    phone: '0916789012',
    email: 'dqtv002@dqtv.com',
    address: '456 Đường Nguyễn Huệ, Khu phố 1',
    districtId: 1,
    policeAreaId: 6,
    position: 'Dân quân',
    rank: 'Binh nhì',
    status: 'active',
    joinDate: '2021-03-10'
  },
  {
    id: 3,
    code: 'HCM-PHD-T12-0003',
    fullName: 'Lê Văn Cường',
    gender: 'male',
    dateOfBirth: '1988-12-10',
    idCard: '079088056789',
    phone: '0917890123',
    email: 'dqtv003@dqtv.com',
    address: '789 Đường Hai Bà Trưng, Khu phố 1',
    districtId: 1,
    policeAreaId: 6,
    position: 'Tổ trưởng',
    rank: 'Trung sĩ',
    status: 'active',
    joinDate: '2019-06-01'
  },
  {
    id: 4,
    code: 'HCM-PHD-T12-0004',
    fullName: 'Phạm Thị Dung',
    gender: 'female',
    dateOfBirth: '1995-03-25',
    idCard: '079095078901',
    phone: '0918901234',
    email: 'dqtv004@dqtv.com',
    address: '321 Đường Trần Hưng Đạo, Khu phố 1',
    districtId: 1,
    policeAreaId: 6,
    position: 'Dân quân',
    rank: 'Binh nhì',
    status: 'on_leave',
    joinDate: '2022-09-15'
  },
  {
    id: 5,
    code: 'HCM-PHD-T12-0005',
    fullName: 'Hoàng Văn Đức',
    gender: 'male',
    dateOfBirth: '1991-07-18',
    idCard: '079091090123',
    phone: '0919012345',
    email: 'dqtv005@dqtv.com',
    address: '654 Đường Lý Thái Tổ, Khu phố 2',
    districtId: 2,
    policeAreaId: 7,
    position: 'Phó tổ trưởng',
    rank: 'Hạ sĩ',
    status: 'active',
    joinDate: '2020-11-20'
  },
  // Thêm các DQTV khác tương tự...
];

// ===========================================
// TASKS DATA
// ===========================================

export const tasks: Task[] = [
  {
    id: 1,
    code: 'NV-2024-001',
    title: 'Tuần tra khu vực chợ Bến Thành',
    description: 'Tuần tra, giữ gìn an ninh trật tự khu vực chợ Bến Thành giờ cao điểm',
    type: 'patrol',
    priority: 'high',
    status: 'in_progress',
    assignedBy: 4,
    assignedTo: 15,
    districtId: 1,
    locationLat: 10.7699,
    locationLng: 106.6980,
    locationAddress: 'Chợ Bến Thành, Khu phố 1',
    deadline: '2024-12-25T18:00:00',
    createdAt: '2024-12-23T08:00:00'
  },
  {
    id: 2,
    code: 'NV-2024-002',
    title: 'Xử lý sự vụ tranh chấp đất đai',
    description: 'Hỗ trợ giải quyết tranh chấp ranh giới giữa 2 hộ dân',
    type: 'incident',
    priority: 'urgent',
    status: 'pending',
    assignedBy: 4,
    assignedTo: 19,
    districtId: 2,
    locationLat: 10.7750,
    locationLng: 106.7010,
    locationAddress: '123 Đường Lê Lợi, Khu phố 2',
    deadline: '2024-12-24T16:00:00',
    createdAt: '2024-12-23T09:00:00'
  },
  {
    id: 3,
    code: 'NV-2024-003',
    title: 'Tuyên truyền phòng cháy chữa cháy',
    description: 'Tuyên truyền, phát tờ rơi về PCCC cho người dân',
    type: 'propaganda',
    priority: 'medium',
    status: 'in_progress',
    assignedBy: 6,
    assignedTo: 23,
    districtId: 3,
    locationLat: 10.7720,
    locationLng: 106.6995,
    locationAddress: 'Khu chung cư Vinhomes, Khu phố 3',
    deadline: '2024-12-26T17:00:00',
    createdAt: '2024-12-23T10:00:00'
  },
  {
    id: 4,
    code: 'NV-2024-004',
    title: 'Hỗ trợ người dân đăng ký CCCD',
    description: 'Hướng dẫn và hỗ trợ người cao tuổi đăng ký CCCD gắn chip',
    type: 'support',
    priority: 'low',
    status: 'in_progress',
    assignedBy: 7,
    assignedTo: 27,
    districtId: 4,
    locationLat: 10.7680,
    locationLng: 106.7050,
    locationAddress: 'UBND Khu phố 4',
    deadline: '2024-12-27T17:00:00',
    createdAt: '2024-12-23T11:00:00'
  },
  {
    id: 5,
    code: 'NV-2024-005',
    title: 'Kiểm tra điểm bán hàng rong',
    description: 'Kiểm tra, nhắc nhở người bán hàng rong lấn chiếm vỉa hè',
    type: 'patrol',
    priority: 'medium',
    status: 'pending',
    assignedBy: 8,
    assignedTo: 31,
    districtId: 5,
    locationLat: 10.7710,
    locationLng: 106.6970,
    locationAddress: 'Đường Nguyễn Huệ, Khu phố 5',
    deadline: '2024-12-25T12:00:00',
    createdAt: '2024-12-23T12:00:00'
  },
  {
    id: 6,
    code: 'NV-2024-006',
    title: 'Tuần tra đêm khu vực chợ đầu mối',
    description: 'Tuần tra ca đêm, đảm bảo an ninh',
    type: 'patrol',
    priority: 'high',
    status: 'completed',
    assignedBy: 4,
    assignedTo: 15,
    districtId: 1,
    locationLat: 10.7695,
    locationLng: 106.6975,
    locationAddress: 'Chợ đầu mối, Khu phố 1',
    deadline: '2024-12-22T06:00:00',
    createdAt: '2024-12-21T18:00:00'
  },
  {
    id: 7,
    code: 'NV-2024-007',
    title: 'Giải quyết mâu thuẫn hàng xóm',
    description: 'Hòa giải tranh chấp giữa 2 gia đình về tiếng ồn',
    type: 'incident',
    priority: 'medium',
    status: 'completed',
    assignedBy: 6,
    assignedTo: 19,
    districtId: 2,
    locationLat: 10.7745,
    locationLng: 106.7015,
    locationAddress: '456 Đường Lý Thái Tổ, Khu phố 2',
    deadline: '2024-12-23T15:00:00',
    createdAt: '2024-12-20T08:00:00'
  },
  {
    id: 8,
    code: 'NV-2024-008',
    title: 'Kiểm tra công trình xây dựng không phép',
    description: 'Kiểm tra và lập biên bản công trình xây dựng vi phạm',
    type: 'incident',
    priority: 'urgent',
    status: 'overdue',
    assignedBy: 8,
    assignedTo: 23,
    districtId: 3,
    locationLat: 10.7725,
    locationLng: 106.6990,
    locationAddress: '789 Đường Hai Bà Trưng, Khu phố 3',
    deadline: '2024-12-20T17:00:00',
    createdAt: '2024-12-18T09:00:00'
  },
  {
    id: 9,
    code: 'NV-2024-009',
    title: 'Thu thập ý kiến người dân về dự án',
    description: 'Khảo sát ý kiến về dự án nâng cấp hạ tầng',
    type: 'support',
    priority: 'low',
    status: 'overdue',
    assignedBy: 9,
    assignedTo: 27,
    districtId: 4,
    locationLat: 10.7685,
    locationLng: 106.7045,
    locationAddress: 'Khu vực công viên, Khu phố 4',
    deadline: '2024-12-21T17:00:00',
    createdAt: '2024-12-19T10:00:00'
  },
  {
    id: 10,
    code: 'NV-2024-010',
    title: 'Tuần tra vùng ngập nước',
    description: 'Tuần tra và cảnh báo khu vực ngập',
    type: 'patrol',
    priority: 'high',
    status: 'rejected',
    assignedBy: 10,
    assignedTo: 31,
    districtId: 5,
    locationLat: 10.7715,
    locationLng: 106.6965,
    locationAddress: 'Khu vực trũng, Khu phố 5',
    deadline: '2024-12-24T18:00:00',
    createdAt: '2024-12-23T13:00:00'
  }
];

// ===========================================
// ATTENDANCE DATA
// ===========================================

export const attendance: Attendance[] = [
  // DQTV001 - Good attendance
  { id: 1, dqtvId: 15, date: '2024-12-18', checkInTime: '08:00:00', checkInLat: 10.7699, checkInLng: 106.6980, checkOutTime: '17:00:00', checkOutLat: 10.7699, checkOutLng: 106.6980, status: 'present', notes: 'Đúng giờ' },
  { id: 2, dqtvId: 15, date: '2024-12-19', checkInTime: '08:02:00', checkInLat: 10.7699, checkInLng: 106.6980, checkOutTime: '17:05:00', checkOutLat: 10.7699, checkOutLng: 106.6980, status: 'present', notes: 'Đúng giờ' },
  { id: 3, dqtvId: 15, date: '2024-12-20', checkInTime: '07:58:00', checkInLat: 10.7699, checkInLng: 106.6980, checkOutTime: '17:00:00', checkOutLat: 10.7699, checkOutLng: 106.6980, status: 'present', notes: 'Đúng giờ' },
  { id: 4, dqtvId: 15, date: '2024-12-21', checkInTime: '08:00:00', checkInLat: 10.7699, checkInLng: 106.6980, checkOutTime: '17:02:00', checkOutLat: 10.7699, checkOutLng: 106.6980, status: 'present', notes: 'Đúng giờ' },
  { id: 5, dqtvId: 15, date: '2024-12-22', checkInTime: '08:05:00', checkInLat: 10.7699, checkInLng: 106.6980, checkOutTime: '17:00:00', checkOutLat: 10.7699, checkOutLng: 106.6980, status: 'present', notes: 'Đúng giờ' },

  // DQTV004 - On leave
  { id: 6, dqtvId: 18, date: '2024-12-18', status: 'leave', notes: 'Nghỉ phép có lương' },
  { id: 7, dqtvId: 18, date: '2024-12-19', status: 'leave', notes: 'Nghỉ phép có lương' },
  { id: 8, dqtvId: 18, date: '2024-12-20', status: 'leave', notes: 'Nghỉ phép có lương' },

  // DQTV007 - Some lates
  { id: 9, dqtvId: 21, date: '2024-12-18', checkInTime: '08:15:00', checkInLat: 10.7750, checkInLng: 106.7010, checkOutTime: '17:00:00', checkOutLat: 10.7750, checkOutLng: 106.7010, status: 'late', notes: 'Đi trễ 15 phút' },
  { id: 10, dqtvId: 21, date: '2024-12-19', checkInTime: '08:00:00', checkInLat: 10.7750, checkInLng: 106.7010, checkOutTime: '17:00:00', checkOutLat: 10.7750, checkOutLng: 106.7010, status: 'present', notes: 'Đúng giờ' },
  { id: 11, dqtvId: 21, date: '2024-12-20', checkInTime: '08:25:00', checkInLat: 10.7750, checkInLng: 106.7010, checkOutTime: '16:50:00', checkOutLat: 10.7750, checkOutLng: 106.7010, status: 'late', notes: 'Đi trễ 25 phút, về sớm' }
];

// ===========================================
// LEAVE REQUESTS DATA
// ===========================================

export const leaveRequests: LeaveRequest[] = [
  {
    id: 1,
    dqtvId: 18,
    fromDate: '2024-12-18',
    toDate: '2024-12-20',
    reason: 'Nghỉ việc gia đình',
    type: 'paid',
    replacementId: 16,
    status: 'approved',
    approverId: 4,
    approvedAt: '2024-12-15T10:00:00',
    createdAt: '2024-12-15T08:00:00'
  },
  {
    id: 2,
    dqtvId: 20,
    fromDate: '2024-12-26',
    toDate: '2024-12-27',
    reason: 'Đi khám bệnh',
    type: 'paid',
    replacementId: 19,
    status: 'pending',
    createdAt: '2024-12-22T14:00:00'
  },
  {
    id: 3,
    dqtvId: 25,
    fromDate: '2024-12-30',
    toDate: '2024-12-31',
    reason: 'Nghỉ tết dương lịch',
    type: 'paid',
    replacementId: 23,
    status: 'pending',
    createdAt: '2024-12-23T09:00:00'
  },
  {
    id: 4,
    dqtvId: 28,
    fromDate: '2024-12-24',
    toDate: '2024-12-25',
    reason: 'Nghỉ việc riêng',
    type: 'unpaid',
    status: 'rejected',
    approverId: 4,
    approvedAt: '2024-12-22T16:00:00',
    createdAt: '2024-12-22T08:00:00'
  }
];

// ===========================================
// NOTIFICATIONS DATA
// ===========================================

export const notifications: Notification[] = [
  {
    id: 1,
    userId: 15,
    type: 'task_assigned',
    title: 'Nhiệm vụ mới',
    message: 'Bạn được giao nhiệm vụ: Tuần tra khu vực chợ Bến Thành',
    priority: 'high',
    isRead: false,
    relatedId: 1,
    createdAt: '2024-12-23T08:00:00'
  },
  {
    id: 2,
    userId: 19,
    type: 'task_assigned',
    title: 'Nhiệm vụ khẩn cấp',
    message: 'Nhiệm vụ khẩn cấp: Xử lý sự vụ tranh chấp đất đai',
    priority: 'urgent',
    isRead: false,
    relatedId: 2,
    createdAt: '2024-12-23T09:00:00'
  },
  {
    id: 3,
    userId: 18,
    type: 'leave_approved',
    title: 'Đơn nghỉ phép đã duyệt',
    message: 'Đơn nghỉ phép của bạn đã được phê duyệt',
    priority: 'normal',
    isRead: true,
    relatedId: 1,
    createdAt: '2024-12-15T10:05:00'
  },
  {
    id: 4,
    userId: 6,
    type: 'task_overdue',
    title: 'Nhiệm vụ quá hạn',
    message: 'DQTV Bùi Văn Hùng có nhiệm vụ quá hạn',
    priority: 'high',
    isRead: false,
    relatedId: 8,
    createdAt: '2024-12-23T14:00:00'
  },
  {
    id: 5,
    userId: 7,
    type: 'leave_pending',
    title: 'Đơn chờ duyệt',
    message: 'Có 1 đơn nghỉ phép chờ phê duyệt',
    priority: 'normal',
    isRead: false,
    relatedId: 2,
    createdAt: '2024-12-23T15:00:00'
  },
  {
    id: 6,
    userId: 4,
    type: 'gps_alert',
    title: 'Cảnh báo GPS',
    message: '3 DQTV có cảnh báo vị trí',
    priority: 'high',
    isRead: false,
    createdAt: '2024-12-23T16:00:00'
  },
  {
    id: 7,
    userId: 4,
    type: 'monthly_report',
    title: 'Báo cáo tháng',
    message: 'Báo cáo tháng 11 đã sẵn sàng',
    priority: 'normal',
    isRead: true,
    createdAt: '2024-12-01T08:00:00'
  }
];

// ===========================================
// GPS LOGS DATA
// ===========================================

export const gpsLogs: GPSLog[] = [
  // DQTV001 movement
  { id: 1, dqtvId: 15, latitude: 10.7699, longitude: 106.6980, accuracy: 5.0, speed: 0.0, address: 'Chợ Bến Thành', batteryLevel: 95, timestamp: '2024-12-23T08:00:00' },
  { id: 2, dqtvId: 15, latitude: 10.7705, longitude: 106.6985, accuracy: 5.0, speed: 2.5, address: 'Đường Lê Lợi', batteryLevel: 94, timestamp: '2024-12-23T08:30:00' },
  { id: 3, dqtvId: 15, latitude: 10.7710, longitude: 106.6990, accuracy: 5.0, speed: 0.0, address: 'Công viên 23/9', batteryLevel: 93, timestamp: '2024-12-23T09:00:00' },
  { id: 4, dqtvId: 15, latitude: 10.7715, longitude: 106.6995, accuracy: 5.0, speed: 1.8, address: 'Đường Nguyễn Huệ', batteryLevel: 92, timestamp: '2024-12-23T10:00:00' },

  // DQTV002 stationary
  { id: 5, dqtvId: 16, latitude: 10.7700, longitude: 106.6982, accuracy: 5.0, speed: 0.0, address: 'Bốt gác Khu phố 1', batteryLevel: 88, timestamp: '2024-12-23T08:00:00' },
  { id: 6, dqtvId: 16, latitude: 10.7700, longitude: 106.6982, accuracy: 5.0, speed: 0.0, address: 'Bốt gác Khu phố 1', batteryLevel: 87, timestamp: '2024-12-23T09:00:00' },
  { id: 7, dqtvId: 16, latitude: 10.7700, longitude: 106.6982, accuracy: 5.0, speed: 0.0, address: 'Bốt gác Khu phố 1', batteryLevel: 86, timestamp: '2024-12-23T10:00:00' }
];

// ===========================================
// KPI SCORES DATA
// ===========================================

export const kpiScores: KPIScore[] = [
  // November 2024
  { id: 1, dqtvId: 15, month: 11, year: 2024, attendanceScore: 95.0, taskScore: 92.0, disciplineScore: 100.0, evaluationScore: 90.0, attitudeScore: 95.0, totalScore: 94.4, rank: 'excellent', status: 'finalized', createdAt: '2024-12-01T00:00:00' },
  { id: 2, dqtvId: 16, month: 11, year: 2024, attendanceScore: 88.0, taskScore: 85.0, disciplineScore: 95.0, evaluationScore: 88.0, attitudeScore: 90.0, totalScore: 89.2, rank: 'good', status: 'finalized', createdAt: '2024-12-01T00:00:00' },
  { id: 3, dqtvId: 19, month: 11, year: 2024, attendanceScore: 92.0, taskScore: 88.0, disciplineScore: 100.0, evaluationScore: 85.0, attitudeScore: 92.0, totalScore: 91.4, rank: 'good', status: 'finalized', createdAt: '2024-12-01T00:00:00' },
  { id: 4, dqtvId: 21, month: 11, year: 2024, attendanceScore: 75.0, taskScore: 80.0, disciplineScore: 90.0, evaluationScore: 75.0, attitudeScore: 80.0, totalScore: 80.0, rank: 'average', status: 'finalized', createdAt: '2024-12-01T00:00:00' },
  { id: 5, dqtvId: 23, month: 11, year: 2024, attendanceScore: 98.0, taskScore: 95.0, disciplineScore: 100.0, evaluationScore: 95.0, attitudeScore: 98.0, totalScore: 97.2, rank: 'excellent', status: 'finalized', createdAt: '2024-12-01T00:00:00' },

  // December 2024 (in progress)
  { id: 6, dqtvId: 15, month: 12, year: 2024, attendanceScore: 93.0, taskScore: 90.0, disciplineScore: 100.0, evaluationScore: 88.0, attitudeScore: 92.0, totalScore: 92.6, rank: 'excellent', status: 'draft', createdAt: '2024-12-23T00:00:00' },
  { id: 7, dqtvId: 16, month: 12, year: 2024, attendanceScore: 85.0, taskScore: 83.0, disciplineScore: 95.0, evaluationScore: 85.0, attitudeScore: 88.0, totalScore: 87.2, rank: 'good', status: 'draft', createdAt: '2024-12-23T00:00:00' }
];

// ===========================================
// AUTHENTICATION HELPER
// ===========================================

export const authenticateUser = (username: string, password: string): User | null => {
  const user = users.find(u => u.username === username && u.password === password);
  return user || null;
};

export const getUserById = (id: number): User | null => {
  return users.find(u => u.id === id) || null;
};

export const getDistrictById = (id: number): District | null => {
  return districts.find(d => d.id === id) || null;
};

// ===========================================
// QUICK LOGIN REFERENCE
// ===========================================

export const LOGIN_CREDENTIALS = {
  ADMIN: { username: 'admin', password: 'Admin@123' },
  LEADER_1: { username: 'lanhdao1', password: 'Leader@123' },
  LEADER_2: { username: 'lanhdao2', password: 'Leader@456' },
  POLICE_WARD_1: { username: 'caphuong', password: 'Police@123' },
  POLICE_WARD_2: { username: 'phocaphuong', password: 'Police@456' },
  POLICE_AREA_1: { username: 'cakv1', password: 'CAKV@123' },
  POLICE_AREA_2: { username: 'cakv2', password: 'CAKV@223' },
  POLICE_AREA_3: { username: 'cakv3', password: 'CAKV@323' },
  POLICE_AREA_4: { username: 'cakv4', password: 'CAKV@423' },
  POLICE_AREA_5: { username: 'cakv5', password: 'CAKV@523' },
  POLICE_AREA_6: { username: 'cakv6', password: 'CAKV@623' },
  STAFF_1: { username: 'nvvp1', password: 'Staff@123' },
  STAFF_2: { username: 'nvvp2', password: 'Staff@456' },
  STAFF_3: { username: 'nvvp3', password: 'Staff@789' },
  DQTV_001: { username: 'dqtv001', password: 'DQTV@001' },
  DQTV_002: { username: 'dqtv002', password: 'DQTV@002' },
  DQTV_007: { username: 'dqtv007', password: 'DQTV@007' }
};