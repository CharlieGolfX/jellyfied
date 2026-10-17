import { describe, expect, it, vi } from 'vitest';
import type { JellyfinApi } from '@/api/client';
import { socketClientName } from './RealtimeProvider';

describe('socketClientName', () => {
  it('is the app name of the session this browser’s WebSocket is in', async () => {
    const get = vi.fn().mockResolvedValue([
      // Made by requests under the new name, without a WebSocket.
      { Client: 'Jellyfied', SupportsRemoteControl: false },
      // The WebSocket's, filed under the name the sign-in was issued under.
      { Client: 'Jellyplex', SupportsRemoteControl: true },
    ]);
    const api = { get, deviceId: 'device-1' } as unknown as JellyfinApi;
    await expect(socketClientName(api)).resolves.toBe('Jellyplex');
    expect(get).toHaveBeenCalledWith('/Sessions', { deviceId: 'device-1' });
  });

  it('is unknown while the server has no session with a WebSocket for this browser', async () => {
    const api = { get: vi.fn().mockResolvedValue([{ Client: 'Jellyfied' }]), deviceId: 'd' } as unknown as JellyfinApi;
    await expect(socketClientName(api)).resolves.toBeNull();
  });
});
