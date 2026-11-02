import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreatePaymentAllocationDto } from './create-payment-allocation.dto.js';

const amountPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class CreatePaymentDto {
  @IsString()
  @Matches(amountPattern)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentMethod?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  paidAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePaymentAllocationDto)
  allocations!: CreatePaymentAllocationDto[];
}
