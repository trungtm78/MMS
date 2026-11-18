import { Global, Module } from '@nestjs/common';
import { AuthStateService } from './auth-state.service';

// JwtAuthGuard is provided by many feature modules; the session check it depends on is
// global so every one of them can resolve it
@Global()
@Module({
  providers: [AuthStateService],
  exports: [AuthStateService],
})
export class AuthStateModule {}
