import logoAntt from 'figma:asset/cccc01b1c29ac475b2229ca7212e280eb38c1430.png';

export function SystemHeader() {
  return (
    <div className="w-full bg-[#F4F269] border-b-4 border-[#C62828] py-6 px-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo và tên phường */}
        <div className="flex items-center gap-4">
          {/* Logo Shield */}
          <div className="relative">
            <img 
              src={logoAntt} 
              alt="Logo Bảo vệ An ninh Trật tự" 
              className="w-24 h-auto drop-shadow-lg"
            />
          </div>
          
          <div>
            <div className="text-[#C62828] text-xl font-bold tracking-wide">PHƯỜNG PHÚ ĐỊNH</div>
          </div>
        </div>

        {/* Tiêu đề hệ thống */}
        <div className="text-center flex-1 mx-8">
          <h1 className="text-[#C62828] text-3xl font-bold leading-tight tracking-wide">
            HỆ THỐNG QUẢN LÝ<br />
            LỰC LƯỢNG BẢO VỆ AN NINH TRẬT TỰ
          </h1>
          <p className="text-[#2E7D32] text-lg italic font-semibold mt-2">
            "Giữ vững bình yên, vững vàng cơ sở"
          </p>
        </div>

        {/* Spacer để cân đối */}
        <div className="w-[140px]"></div>
      </div>
    </div>
  );
}