import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ContactPolicy } from './contact-policy';

// Shared by the users directory search and chat, which must agree on whom a user may reach
@Module({
  imports: [AssignmentsModule],
  providers: [ContactPolicy],
  exports: [ContactPolicy],
})
export class ContactPolicyModule {}
