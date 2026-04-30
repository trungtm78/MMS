import ncscLogo from '@/assets/01c1e386ac3d00655221fee6db98ffe82cf0338c.png'

export function GlobalFooter() {
  return (
    <footer className="bg-[#F4F269] border-t-4 border-[#C62828] py-3 px-6 md:px-16 shrink-0">
      <div className="max-w-[1240px] mx-auto">
        <h3 className="text-[#C62828] text-sm font-bold mb-1.5 leading-tight">
          ỦY BAN NHÂN DÂN PHƯỜNG PHÚ ĐỊNH
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-x-12 gap-y-1 items-start">
          <div className="space-y-1.5 text-xs text-gray-800 leading-tight">
            <p><span className="font-semibold">Địa chỉ:</span> Số 184 đường Lưu Hữu Phước, phường Phú Định, TP.HCM</p>
            <p><span className="font-semibold">Điện thoại:</span> 0283. 5359502</p>
            <p className="text-[#2E7D32] font-semibold text-[10px]">"Quý chế quản lý, vận hành và khai thác Hệ thống quản lý Lực lượng bảo vệ an ninh trật tự"</p>
          </div>
          <div className="space-y-1 text-xs text-gray-800 leading-tight">
            <p><span className="font-semibold">Email:</span> <a href="mailto:phudinh@tphcm.gov.vn" className="text-blue-600 hover:underline">phudinh@tphcm.gov.vn</a></p>
            <p><span className="font-semibold">Fanpage:</span> <a href="https://www.facebook.com/phudinh" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">facebook.com/phudinh</a></p>
            <p><span className="font-semibold">Zalo Official:</span> <a href="https://oa.zalo.me/ubndphuongphudinh" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">oa.zalo.me/ubndphuongphudinh</a></p>
          </div>
          <div className="flex items-start justify-center md:justify-end">
            <img src={ncscLogo} alt="NCSC.vn - Website đạt chứng nhận tin nhiệm mạng" className="h-10 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} />
          </div>
        </div>
      </div>
    </footer>
  )
}
