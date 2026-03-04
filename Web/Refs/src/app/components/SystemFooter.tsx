import ncscLogo from 'figma:asset/01c1e386ac3d00655221fee6db98ffe82cf0338c.png';

export function SystemFooter() {
  return (
    <div className="w-full bg-[#F4F269] border-t-4 border-[#C62828] py-6 px-8 mt-auto">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-[#C62828] text-lg font-bold mb-3">
              ỦY BAN NHÂN DÂN PHƯỜNG PHÚ ĐỊNH
            </h3>
            <div className="space-y-1 text-sm">
              <p className="text-[#2E7D32]">
                <span className="font-semibold">Địa chỉ:</span> Số 184 đường Lưu Hữu Phước, phường Phú Định, Thành phố Hồ Chí Minh
              </p>
              <p className="text-[#2E7D32]">
                <span className="font-semibold">Điện thoại:</span> 0283. 5359502
              </p>
              <p className="text-[#2E7D32]">
                <span className="font-semibold">Email:</span> phudinh@tphcm.gov.vn
              </p>
              <p className="text-[#2E7D32]">
                <span className="font-semibold">Fanpage:</span> https://ww.facebook.com/phudinh
              </p>
              <p className="text-[#2E7D32]">
                <span className="font-semibold">Zalo Official:</span> https://oa.zalo.me/ubndphuongphudinh
              </p>
            </div>
            <p className="text-[#2E7D32] text-xs italic mt-3">
              "Quy chế quản lý, vận hành và khai thác Hệ thống quản lý Lực lượng bảo vệ an ninh trật tự"
            </p>
          </div>

          {/* Logo NCSC */}
          <div className="ml-8">
            <img 
              src={ncscLogo} 
              alt="NCSC - Website đạt chứng nhận Tin nhiệm mạng" 
              className="h-16 object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}