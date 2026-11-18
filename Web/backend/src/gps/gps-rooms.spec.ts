import { rooms } from '../notifications/rooms';
import { gpsRoomOf, gpsUnitRoom, gpsWardRoom } from './gps-rooms';

const TID = '11111111-1111-4111-8111-111111111111';

describe('gps rooms', () => {
  it('names the staff rooms through the tenant rooms', () => {
    expect(gpsWardRoom(TID)).toBe(rooms.gpsWard(TID));
    expect(gpsUnitRoom(TID, 'KV1')).toBe(rooms.gpsUnit(TID, 'KV1'));
    expect(gpsWardRoom(undefined)).toBe('t:legacy:gps:ward');
  });

  describe('gpsRoomOf', () => {
    it('gives ward-wide staff the ward room of their tenant', () => {
      expect(gpsRoomOf({ role: 'police_ward', unitScope: null }, TID)).toBe(
        rooms.gpsWard(TID),
      );
    });

    it('gives unit staff the room of their unit in their tenant', () => {
      expect(gpsRoomOf({ role: 'police_area', unitScope: 'KV1' }, TID)).toBe(
        rooms.gpsUnit(TID, 'KV1'),
      );
    });

    it('keeps the unit rooms of two tenants apart', () => {
      const other = '22222222-2222-4222-8222-222222222222';
      const staff = { role: 'police_area', unitScope: 'KV1' };

      expect(gpsRoomOf(staff, TID)).not.toBe(gpsRoomOf(staff, other));
    });

    it('uses the legacy namespace without a tenant', () => {
      expect(
        gpsRoomOf({ role: 'police_area', unitScope: 'KV1' }, undefined),
      ).toBe('t:legacy:gps:unit:KV1');
    });

    it.each([
      ['a member', { role: 'dqtv', unitScope: 'KV1' }],
      ['a CA officer', { role: 'ca_officer', unitScope: 'KV1' }],
      ['an area role without a unit', { role: 'police_area', unitScope: null }],
    ])('gives %s no room', (_label, actor) => {
      expect(gpsRoomOf(actor, TID)).toBeNull();
    });
  });
});
