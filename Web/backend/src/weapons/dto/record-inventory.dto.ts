import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDateOnly } from '../../common/validation/is-date-only';
import {
  WEAPON_CONDITIONS,
  type WeaponCondition,
} from '../weapon-inventory-codes';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
// A filter left blank in the web form arrives as an empty query parameter
const blankAsAbsent = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

// One weapon as the checker found it
export class InventoryItemDto {
  @IsUUID('all')
  weaponId!: string;

  @IsBoolean()
  found!: boolean;

  // The condition seen at the check, for a weapon that was found
  @IsOptional()
  @IsIn(WEAPON_CONDITIONS)
  observedCondition?: WeaponCondition;
}

// POST /weapons/inventory { confirmedCount, notes?, items? }
export class RecordInventoryDto {
  // Weapons the checker confirmed as present
  @IsInt()
  @Min(0)
  @Max(100_000)
  confirmedCount!: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // Item-level results; when given they must cover every active weapon
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10_000)
  @ArrayUnique((item: InventoryItemDto) => item?.weaponId)
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  items?: InventoryItemDto[];
}

// GET /weapons/inventory?from=&to=
export class InventoryQueryDto {
  @Transform(blankAsAbsent)
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @Transform(blankAsAbsent)
  @IsOptional()
  @IsDateOnly()
  to?: string;
}
