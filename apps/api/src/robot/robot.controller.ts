import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPlayer } from '../auth/decorators/current-player.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { AllocateAttributeDto } from './dto/allocate-attribute.dto';
import { RobotService } from './robot.service';

@Controller('robot')
@UseGuards(JwtAuthGuard)
export class RobotController {
  constructor(private readonly robotService: RobotService) {}

  @Get()
  getRobot(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.robotService.getRobot(currentPlayer.sub);
  }

  @Post('equip/:itemInstanceId')
  equip(@CurrentPlayer() currentPlayer: JwtPayload, @Param('itemInstanceId') itemInstanceId: string) {
    return this.robotService.equip(currentPlayer.sub, itemInstanceId);
  }

  @Post('unequip/:slot')
  unequip(@CurrentPlayer() currentPlayer: JwtPayload, @Param('slot') slot: string) {
    return this.robotService.unequip(currentPlayer.sub, slot);
  }

  @Get('attributes')
  getAttributes(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.robotService.getAttributes(currentPlayer.sub);
  }

  @Get('combat-stats')
  getCombatStats(@CurrentPlayer() currentPlayer: JwtPayload) {
    return this.robotService.getCombatStats(currentPlayer.sub);
  }

  @Post('attributes/allocate')
  allocateAttribute(@CurrentPlayer() currentPlayer: JwtPayload, @Body() dto: AllocateAttributeDto) {
    return this.robotService.allocateAttribute(currentPlayer.sub, dto.stat);
  }
}
