import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WeaponsController } from './weapons.controller'
import { WeaponsService } from './weapons.service'
import { WeaponItem } from './entities/weapon-item.entity'
import { WeaponAllocation } from './entities/weapon-allocation.entity'
import { ExcelExportService } from '../common/services/excel-export.service'

@Module({
  imports: [TypeOrmModule.forFeature([WeaponItem, WeaponAllocation])],
  controllers: [WeaponsController],
  providers: [WeaponsService, ExcelExportService],
  exports: [WeaponsService],
})
export class WeaponsModule {}
