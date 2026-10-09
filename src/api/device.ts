const DEVICE_ID_KEY = 'jellyplex.deviceId';

/** UUID generator that also works on insecure (plain http) origins, where crypto.randomUUID is unavailable. */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' && window.isSecureContext) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    /* storage unavailable */
  }
  if (!id) {
    id = generateId();
    try {
      localStorage.setItem(DEVICE_ID_KEY, id);
    } catch {
      /* storage unavailable */
    }
  }
  cachedDeviceId = id;
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  let os = '';
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';

  return os ? `${browser} on ${os}` : browser;
}

export function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\//.test(ua);
}

export function isChromium(): boolean {
  return /Chrome\/|Chromium\//.test(navigator.userAgent);
}
