// US-SS-08: UsersModule
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController, UnitsController } from './users.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Module({
  controllers: [UsersController, UnitsController],
  providers: [UsersService, JwtAuthGuard],
  exports: [UsersService],
})
export class UsersModule {}
