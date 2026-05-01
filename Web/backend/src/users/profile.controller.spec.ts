import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockUsersService = {
  getProfile: jest.fn(),
  getPoliceProfile: jest.fn(),
};

const userReq = { user: { sub: 'user-1', role: 'ca_officer', unitScope: 'UNIT_001' } };

describe('ProfileController', () => {
  let controller: ProfileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfileController>(ProfileController);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('returns profile for calling user', () => {
      const profile = { id: 'user-1', username: 'ca_officer1', role: 'ca_officer' };
      mockUsersService.getProfile.mockReturnValueOnce(profile);

      const result = controller.getProfile(userReq as any);

      expect(result).toEqual(profile);
      expect(mockUsersService.getProfile).toHaveBeenCalledWith('user-1');
    });

    it('propagates error when user not found', () => {
      mockUsersService.getProfile.mockImplementationOnce(() => {
        throw new Error('not_found');
      });

      expect(() => controller.getProfile(userReq as any)).toThrow('not_found');
    });
  });

  describe('getPoliceProfile', () => {
    it('returns police-specific profile', () => {
      const policeProfile = { id: 'user-1', badgeNumber: 'CA001', rank: 'Trung úy' };
      mockUsersService.getPoliceProfile.mockReturnValueOnce(policeProfile);

      const result = controller.getPoliceProfile(userReq as any);

      expect(result).toEqual(policeProfile);
      expect(mockUsersService.getPoliceProfile).toHaveBeenCalledWith('user-1');
    });

    it('propagates error when police profile not found', () => {
      mockUsersService.getPoliceProfile.mockImplementationOnce(() => {
        throw new Error('not_found');
      });

      expect(() => controller.getPoliceProfile(userReq as any)).toThrow('not_found');
    });
  });
});
