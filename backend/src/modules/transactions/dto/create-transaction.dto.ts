import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TransactionEntryMode, TransactionType } from '@prisma/client';
import { CreateTransactionItemDto } from './create-transaction-item.dto.js';

const amountPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type!: TransactionType;

  @ValidateIf((dto: CreateTransactionDto) => dto.type === TransactionType.STORE_ITEMS)
  @IsEnum(TransactionEntryMode)
  entryMode?: TransactionEntryMode;

  @ValidateIf(
    (dto: CreateTransactionDto) =>
      dto.type === TransactionType.MONEY_LOAN ||
      (dto.type === TransactionType.STORE_ITEMS &&
        dto.entryMode === TransactionEntryMode.TOTAL_ONLY),
  )
  @IsString()
  @Matches(amountPattern)
  totalAmount?: string;

  @ValidateIf(
    (dto: CreateTransactionDto) =>
      dto.type === TransactionType.STORE_ITEMS &&
      dto.entryMode === TransactionEntryMode.ITEMIZED,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionItemDto)
  items?: CreateTransactionItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  occurredAt?: string;
}
