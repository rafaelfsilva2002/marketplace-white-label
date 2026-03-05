import { Module } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { AuthModule } from '@/modules/auth/auth.module';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [DatabaseProvider, ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
