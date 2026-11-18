import { rooms } from './rooms';

const TID = '11111111-1111-4111-8111-111111111111';

describe('rooms', () => {
  it('namespaces every room by tenant', () => {
    expect(rooms.user(TID, 'u1')).toBe(`t:${TID}:user:u1`);
    expect(rooms.unit(TID, 'KP1')).toBe(`t:${TID}:unit:KP1`);
    expect(rooms.gpsWard(TID)).toBe(`t:${TID}:gps:ward`);
    expect(rooms.gpsUnit(TID, 'KP1')).toBe(`t:${TID}:gps:unit:KP1`);
    expect(rooms.conversation(TID, 'c1')).toBe(`t:${TID}:conv_c1`);
    expect(rooms.tenant(TID)).toBe(`t:${TID}`);
  });

  it('never shares a room between tenants that use the same unit code', () => {
    const other = '22222222-2222-4222-8222-222222222222';
    expect(rooms.unit(TID, 'KP1')).not.toBe(rooms.unit(other, 'KP1'));
  });

  describe('without a tenant', () => {
    const original = process.env.TENANCY_MODE;
    afterEach(() => {
      if (original === undefined) delete process.env.TENANCY_MODE;
      else process.env.TENANCY_MODE = original;
    });

    it('uses one namespace for the single-tenant legacy mode', () => {
      delete process.env.TENANCY_MODE;
      expect(rooms.unit(undefined, 'KP1')).toBe('t:legacy:unit:KP1');
      expect(rooms.tenant(undefined)).toBe('t:legacy');
    });

    it('uses a namespace nobody joins when a tenant is missing in enforced mode', () => {
      process.env.TENANCY_MODE = 'enforced';
      expect(rooms.unit(undefined, 'KP1')).toBe('t:none:unit:KP1');
      expect(rooms.user(undefined, 'u1')).toBe('t:none:user:u1');
      expect(rooms.tenant(undefined)).toBe('t:none');
      expect(rooms.tenant(undefined)).not.toBe('t:legacy');
    });

    it('leaves the namespace of a known tenant alone in either mode', () => {
      process.env.TENANCY_MODE = 'enforced';
      expect(rooms.tenant(TID)).toBe(`t:${TID}`);
      process.env.TENANCY_MODE = 'legacy';
      expect(rooms.tenant(TID)).toBe(`t:${TID}`);
    });
  });
});
