import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '@marketplace/shared';
import { AuthService, AuthenticatedUser } from '../services/auth.service';
import { TokenPair } from '../services/token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '../strategies/jwt.strategy';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';

interface AuthResponse {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<AuthResponse>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Registration request',
      email: dto.email,
      correlationId,
    });

    const result = await this.authService.register(dto, correlationId);

    return {
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      },
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<AuthResponse>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Login request',
      email: dto.email,
      correlationId,
    });

    const result = await this.authService.login(dto, correlationId);

    return {
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      },
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body('refreshToken') refreshToken: string,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<Omit<AuthResponse, 'user'>>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Token refresh request',
      correlationId,
    });

    const tokens: TokenPair = await this.authService.refresh(
      refreshToken,
      correlationId,
    );

    return {
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Logout request',
      userId: user.id,
      correlationId,
    });

    await this.authService.logout(user.id, correlationId);

    return {
      success: true,
      data: { message: 'Logged out successfully' },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<AuthenticatedUser>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Profile request',
      userId: user.id,
      correlationId,
    });

    const profile = await this.authService.getProfile(user.id);

    return {
      success: true,
      data: profile,
    };
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateProfileDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<AuthenticatedUser>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Profile update request',
      userId: user.id,
      correlationId,
    });

    const updated = await this.authService.updateProfile(
      user.id,
      dto,
      correlationId,
    );

    return {
      success: true,
      data: updated,
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangePasswordDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Password change request',
      userId: user.id,
      correlationId,
    });

    const result = await this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      correlationId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @CurrentUser() user: JwtUser,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Account deletion request',
      userId: user.id,
      correlationId,
    });

    const result = await this.authService.deleteAccount(
      user.id,
      correlationId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Email verification request',
      correlationId,
    });

    const result = await this.authService.verifyEmail(
      dto.token,
      correlationId,
    );

    return { success: true, data: result };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Forgot password request',
      email: dto.email,
      correlationId,
    });

    const result = await this.authService.forgotPassword(
      dto.email,
      correlationId,
    );

    return { success: true, data: { message: result.message } };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    this.logger.log({
      message: 'Password reset request',
      correlationId,
    });

    const result = await this.authService.resetPassword(
      dto.token,
      dto.newPassword,
      correlationId,
    );

    return { success: true, data: result };
  }
}
