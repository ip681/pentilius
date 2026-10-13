import { Body, Controller, HttpCode, HttpStatus, Module, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { AccountEmailService } from './account-email.service';
import { EmailLocale } from './email-templates';
import { EmailService } from './email.service';

const LOCALES = ['bg', 'en'];

class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(LOCALES)
  locale?: EmailLocale;
}

class ResetPasswordDto {
  @IsString()
  @MaxLength(200)
  token!: string;

  // Same minimum as registration.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

class VerifyEmailDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}

class ResendVerificationDto {
  @IsOptional()
  @IsIn(LOCALES)
  locale?: EmailLocale;
}

/** Public endpoints: the token in the emailed link is the proof. */
@Controller('auth')
export class AccountEmailController {
  constructor(private readonly accountEmail: AccountEmailService) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.accountEmail.requestPasswordReset(dto.email, dto.locale ?? 'bg');
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.accountEmail.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ ok: true }> {
    await this.accountEmail.verifyEmail(dto.token);
    return { ok: true };
  }
}

/** "Send the confirmation email again" from the Command Center reminder. */
@Controller('player/me')
@UseGuards(JwtAuthGuard)
export class VerificationResendController {
  constructor(private readonly accountEmail: AccountEmailService) {}

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.OK)
  async resend(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: ResendVerificationDto): Promise<{ ok: true }> {
    await this.accountEmail.resendVerification(currentPlayer.sub, dto.locale ?? 'bg');
    return { ok: true };
  }
}

@Module({
  controllers: [AccountEmailController, VerificationResendController],
  providers: [EmailService, AccountEmailService],
  exports: [AccountEmailService],
})
export class EmailModule {}
