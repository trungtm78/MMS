// US-SS-08: UsersModule
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController, UnitsController } from './users.controller';
import { ProfileController } from './profile.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ContactPolicyModule } from './contact-policy.module';

@Module({
  // The directory search lists whom ContactPolicy lets the caller reach
  imports: [ContactPolicyModule],
  controllers: [UsersController, UnitsController, ProfileController],
  providers: [UsersService, JwtAuthGuard],
  exports: [UsersService],
})
export class UsersModule {}
