import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ROLE_CODES } from '../common/constants/roles';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ROLES_KEY, RolesGuard } from '../common/guards/roles.guard';
import { DeviceSessionsController } from './device-sessions.controller';
import { DeviceSessionsService } from './device-sessions.service';

const sessions = {
  list: jest.fn(),
  revoke: jest.fn(),
  revokeOthers: jest.fn(),
};

describe('DeviceSessionsController', () => {
  let controller: DeviceSessionsController;
  const req = {
    user: { sub: 'u-1', role: 'dqtv', unitScope: null, sid: 's-1' },
    ip: '10.0.0.9',
    headers: { 'user-agent': 'Mozilla/5.0' },
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DeviceSessionsController],
      providers: [{ provide: DeviceSessionsService, useValue: sessions }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(DeviceSessionsController);
    jest.clearAllMocks();
  });

  it('serves /devices/sessions to every role, each for their own sessions', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DeviceSessionsController)).toBe(
      'devices/sessions',
    );
    expect(
      [
        ...(Reflect.getMetadata(
          ROLES_KEY,
          DeviceSessionsController,
        ) as string[]),
      ].sort(),
    ).toEqual([...ROLE_CODES].sort());
  });

  it('lists with the user and paging asked for', async () => {
    sessions.list.mockResolvedValueOnce({ data: [] });
    await controller.list(req, 'b9f0d7a2-4b0e-4c55-9d3c-0f1e2d3c4b5a', 2, 10);
    expect(sessions.list).toHaveBeenCalledWith(req.user, {
      userId: 'b9f0d7a2-4b0e-4c55-9d3c-0f1e2d3c4b5a',
      page: 2,
      limit: 10,
    });
  });

  it('revokes one session with 204, passing where the request came from', async () => {
    await controller.revoke(req, 'b9f0d7a2-4b0e-4c55-9d3c-0f1e2d3c4b5a');
    expect(sessions.revoke).toHaveBeenCalledWith(
      req.user,
      'b9f0d7a2-4b0e-4c55-9d3c-0f1e2d3c4b5a',
      { ip: '10.0.0.9', userAgent: 'Mozilla/5.0' },
    );
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        Object.getOwnPropertyDescriptor(
          DeviceSessionsController.prototype,
          'revoke',
        )?.value as object,
      ),
    ).toBe(HttpStatus.NO_CONTENT);
  });

  it('revokes the other sessions with 200 and the count', async () => {
    sessions.revokeOthers.mockResolvedValueOnce({ revoked: 3 });
    await expect(controller.revokeOthers(req)).resolves.toEqual({ revoked: 3 });
    expect(sessions.revokeOthers).toHaveBeenCalledWith(req.user, {
      ip: '10.0.0.9',
      userAgent: 'Mozilla/5.0',
    });
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        Object.getOwnPropertyDescriptor(
          DeviceSessionsController.prototype,
          'revokeOthers',
        )?.value as object,
      ),
    ).toBe(HttpStatus.OK);
  });
});
