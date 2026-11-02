import { IsString, IsUUID, Matches } from 'class-validator';

const amountPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class CreatePaymentAllocationDto {
  @IsUUID('4')
  transactionId!: string;

  @IsString()
  @Matches(amountPattern)
  allocatedAmount!: string;
}
