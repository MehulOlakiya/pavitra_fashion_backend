import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@Req() req: any) {
    const userId = req.user.id || req.user.userId || req.user.sub || req.user._id;
    const user = await this.usersService.findById(userId);
    if (!user) {
      return null;
    }
    const userObj = user.toObject();
    delete userObj.password;
    return userObj;
  }

  @Patch('me')
  async updateProfile(@Req() req: any, @Body() updateData: any) {
    const userId = req.user.id || req.user.userId || req.user.sub || req.user._id;
    // Ensure we don't update sensitive fields blindly
    delete updateData.password;
    delete updateData.role;
    delete updateData.isActive;
    
    const updatedUser = await this.usersService.update(userId, updateData);
    if (!updatedUser) {
      return null;
    }
    const userObj = updatedUser.toObject();
    delete userObj.password;
    return userObj;
  }
}
