import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WeaponsController } from './weapons.controller';
import { WeaponsService } from './weapons.service';
import { WeaponInventoryController } from './weapon-inventory.controller';
import { WeaponInventoryService } from './weapon-inventory.service';
import { WeaponItem } from './entities/weapon-item.entity';
import { WeaponAllocation } from './entities/weapon-allocation.entity';
import { ExcelExportService } from '../common/services/excel-export.service';

@Module({
  imports: [TypeOrmModule.forFeature([WeaponItem, WeaponAllocation])],
  // WeaponInventoryController first: /weapons/inventory must be matched before
  // WeaponsController's GET /weapons/:id
  controllers: [WeaponInventoryController, WeaponsController],
  providers: [WeaponsService, WeaponInventoryService, ExcelExportService],
  exports: [WeaponsService, WeaponInventoryService],
})
export class WeaponsModule {}
