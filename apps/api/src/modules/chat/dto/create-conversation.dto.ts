import { IsUUID } from 'class-validator';

export class CreateConversationDto {
  @IsUUID('4', { message: 'participantId must be a valid UUID' })
  participantId!: string;
}
