import clsx from 'clsx';
import { ArrowLeft, KeyRound, Server, User as UserIcon, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { JellyfinApi } from '@/api/client';
import type { AuthenticationResult, PublicSystemInfo, QuickConnectResult, UserDto } from '@/api/types';
import { LAST_SERVER_KEY, useAuth } from '@/auth/AuthProvider';
import { useGuardedSwitch } from '@/auth/PinPrompt';
import { appPath } from '@/lib/basePath';
import { t } from '@/i18n';
import { APP_VERSION, normalizeServerUrl, runtimeConfig } from '@/config';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Form';
import { Spinner } from '@/components/ui/Spinner';
import { Img } from '@/components/ui/States';
import { errorMessage } from '@/components/ui/Toast';
import { usePageTitle } from '@/lib/usePageTitle';
import { useLatest } from '@/lib/useLatest';

function initialServer(): string {
  if (runtimeConfig.serverUrl) return runtimeConfig.serverUrl;
  try {
    return localStorage.getItem(LAST_SERVER_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function LoginPage() {
  const { session, completeLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  usePageTitle(t('login.title'));

  const [serverUrl, setServerUrl] = useState(initialServer);
  const [serverInput, setServerInput] = useState(serverUrl);
  const [info, setInfo] = useState<PublicSystemInfo | null>(null);
  const [checking, setChecking] = useState(Boolean(serverUrl));
  const [serverError, setServerError] = useState<string | null>(null);

  const api = useMemo(() => (serverUrl ? new JellyfinApi(serverUrl) : null), [serverUrl]);

  const connect = useCallback(async (url: string) => {
    setChecking(true);
    setServerError(null);
    try {
      const normalized = normalizeServerUrl(url);
      const probe = new JellyfinApi(normalized);
      const result = await probe.get<PublicSystemInfo>('/System/Info/Public');
      if (!result || typeof result !== 'object' || !result.Id) {
        throw new Error(t('login.notJellyfin'));
      }
      setServerUrl(normalized);
      setInfo(result);
    } catch (err) {
      setInfo(null);
      setServerError(err instanceof TypeError ? t('login.invalidAddress') : errorMessage(err));
    } finally {
      setChecking(false);
    }
  }, []);

  // Only on first mount: check the server that is already known (configured, or used last time).
  // oxlint-disable react/set-state-in-effect, react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps
  useEffect(() => {
    if (serverUrl && !info) void connect(serverUrl);
  }, []);
  // oxlint-enable react/set-state-in-effect, react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps

  if (session) return <Navigate to={from} replace />;

  const onAuthenticated = (result: AuthenticationResult) => {
    completeLogin(serverUrl, info?.ServerName || 'Jellyfin', result);
    navigate(from, { replace: true });
  };

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-base-950 px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(1000px 600px at 15% 10%, rgba(170,92,195,0.16), transparent 60%), radial-gradient(900px 600px at 90% 90%, rgba(0,164,220,0.12), transparent 60%)',
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo className="text-5xl" />
        </div>
        <div className="rounded-xl bg-base-850/90 p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur sm:p-8">
          {checking && !info ? (
            <div className="flex flex-col items-center gap-3 py-10 text-muted">
              <Spinner size={32} className="text-accent" />
              <span className="text-sm">{t('login.connecting')}</span>
            </div>
          ) : !info || !api ? (
            <ServerStep
              value={serverInput}
              onChange={setServerInput}
              error={serverError}
              loading={checking}
              onSubmit={() => connect(serverInput)}
            />
          ) : (
            <LoginStep
              api={api}
              info={info}
              onBack={
                runtimeConfig.lockServer
                  ? undefined
                  : () => {
                      setInfo(null);
                      setServerInput(serverUrl);
                    }
              }
              onAuthenticated={onAuthenticated}
            />
          )}
        </div>
        <p className="mt-6 text-center text-xs text-faint">
          {t('login.tagline', { version: APP_VERSION })}
          {' · '}
          <a href={appPath('/licenses.txt')} target="_blank" rel="noopener" className="underline-offset-2 hover:text-muted hover:underline">
            {t('login.licences')}
          </a>
        </p>
      </div>
    </div>
  );
}

function ServerStep({
  value,
  onChange,
  error,
  loading,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-5"
    >
      <div>
        <h1 className="text-xl font-semibold">{t('login.connectTitle')}</h1>
        <p className="mt-1 text-sm text-muted">{t('login.connectHelp')}</p>
      </div>
      <Field label={t('login.serverAddress')} hint={t('login.serverAddressHint')}>
        <div className="relative">
          <Server size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="http://jellyfin:8096"
            className="pl-9"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </Field>
      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={loading} disabled={!value.trim()}>
        {t('login.connect')}
      </Button>
    </form>
  );
}

function LoginStep({
  api,
  info,
  onBack,
  onAuthenticated,
}: {
  api: JellyfinApi;
  info: PublicSystemInfo;
  onBack?: () => void;
  onAuthenticated: (r: AuthenticationResult) => void;
}) {
  const { otherAccounts, forgetAccount } = useAuth();
  const { switchTo, dialog: pinDialog } = useGuardedSwitch();
  // Accounts that are still signed in on this browser can be continued without a password.
  const saved = otherAccounts.filter((a) => a.serverUrl === api.serverUrl);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [quickConnect, setQuickConnect] = useState(false);
  const [disclaimer, setDisclaimer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const [qc, setQc] = useState<QuickConnectResult | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const onAuthRef = useLatest(onAuthenticated);

  useEffect(() => {
    let cancelled = false;
    api
      .get<UserDto[]>('/Users/Public')
      .then((u) => !cancelled && setUsers(Array.isArray(u) ? u : []))
      .catch(() => {});
    api
      .get<boolean>('/QuickConnect/Enabled')
      .then((v) => !cancelled && setQuickConnect(v === true))
      .catch(() => {});
    api
      .get<{ LoginDisclaimer?: string | null }>('/Branding/Configuration')
      .then((b) => !cancelled && setDisclaimer(disclaimerText(b?.LoginDisclaimer)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);

  const login = async (name: string, pw: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<AuthenticationResult>('/Users/AuthenticateByName', { Username: name, Pw: pw });
      onAuthenticated(result);
    } catch (err) {
      setError((err as { status?: number }).status === 401 ? t('login.invalidCredentials') : errorMessage(err));
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    void login(username.trim(), password);
  };

  // Quick Connect polling.
  useEffect(() => {
    if (!qc) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const state = await api.get<QuickConnectResult>('/QuickConnect/Connect', { secret: qc.Secret });
        if (state.Authenticated && !stopped) {
          stopped = true;
          window.clearInterval(timer);
          const result = await api.post<AuthenticationResult>('/Users/AuthenticateWithQuickConnect', { Secret: qc.Secret });
          onAuthRef.current(result);
        }
      } catch (err) {
        stopped = true;
        window.clearInterval(timer);
        setQc(null);
        setError(errorMessage(err));
      }
    }, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [qc, api, onAuthRef]);

  const startQuickConnect = async () => {
    setError(null);
    try {
      setQc(await api.post<QuickConnectResult>('/QuickConnect/Initiate'));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const pickUser = (u: UserDto) => {
    setUsername(u.Name);
    setPassword('');
    setError(null);
    if (!u.HasPassword) {
      void login(u.Name, '');
      return;
    }
    setManual(true);
    window.setTimeout(() => passwordRef.current?.focus(), 0);
  };

  if (qc) {
    return (
      <div className="space-y-5 text-center">
        <h1 className="text-xl font-semibold">{t('login.quickConnect')}</h1>
        <p className="text-sm text-muted">{t('login.quickConnectHelp')}</p>
        <div className="rounded-lg bg-base-950 py-5 font-mono text-4xl font-bold tracking-[0.3em] text-accent">{qc.Code}</div>
        <div className="flex items-center justify-center gap-2 text-sm text-muted">
          <Spinner size={14} /> {t('login.waitingForAuthorization')}
        </div>
        <Button variant="ghost" onClick={() => setQc(null)}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  const showPicker = users.length > 0 && !manual;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="mt-0.5 rounded-full p-1 text-muted hover:bg-white/10 hover:text-fg"
            aria-label={t('login.changeServer')}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{showPicker ? t('login.whoIsWatching') : t('login.title')}</h1>
          <p className="mt-0.5 truncate text-sm text-muted">
            {t('login.serverInfo', { name: info.ServerName ?? '', version: info.Version ?? '' })}
          </p>
        </div>
      </div>

      {info.StartupWizardCompleted === false && (
        <p className="rounded-md bg-star/10 px-3 py-2 text-sm text-star">{t('login.setupIncomplete')}</p>
      )}

      {pinDialog}
      {saved.length > 0 && (
        <div data-testid="saved-accounts">
          <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{t('login.signedInHere')}</div>
          <ul className="space-y-1">
            {saved.map((a) => (
              <li key={a.userId} className="flex items-center gap-1">
                <button
                  onClick={() => switchTo(a)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
                >
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-purple to-accent font-bold text-accent-ink">
                    <Img
                      src={api.userImageUrl(a.userId, undefined, 96)}
                      className="absolute inset-0 h-full w-full object-cover"
                      fallback={a.userName.charAt(0).toUpperCase()}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t('login.continueAs', { name: a.userName })}</span>
                </button>
                <button
                  onClick={() => void forgetAccount(a)}
                  className="rounded-full p-2 text-muted hover:bg-white/10 hover:text-fg"
                  aria-label={t('login.signOutAccount', { name: a.userName })}
                  title={t('login.signOutAccount', { name: a.userName })}
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showPicker ? (
        <>
          <div className="grid grid-cols-3 gap-4">
            {users.map((u) => (
              <button
                key={u.Id}
                onClick={() => pickUser(u)}
                disabled={loading}
                className="group flex flex-col items-center gap-2 rounded-lg p-2 transition hover:bg-white/5"
              >
                <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-purple to-accent text-2xl font-bold text-accent-ink ring-2 ring-transparent transition group-hover:ring-accent">
                  {u.PrimaryImageTag ? (
                    <Img
                      src={api.userImageUrl(u.Id, u.PrimaryImageTag, 160)}
                      className="absolute inset-0 h-full w-full object-cover"
                      fallback={u.Name.charAt(0).toUpperCase()}
                    />
                  ) : (
                    u.Name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="w-full truncate text-sm">{u.Name}</span>
              </button>
            ))}
          </div>
          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="justify-center" icon={<UserIcon size={16} />} onClick={() => setManual(true)}>
              {t('login.signInManually')}
            </Button>
            {quickConnect && (
              <Button variant="ghost" className="justify-center" icon={<KeyRound size={16} />} onClick={startQuickConnect}>
                {t('login.useQuickConnect')}
              </Button>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t('login.username')}>
            <Input
              autoFocus={!username}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          <Field label={t('login.password')}>
            <Input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus={Boolean(username)}
            />
          </Field>
          {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full justify-center" loading={loading} disabled={!username.trim()}>
            {t('login.signIn')}
          </Button>
          <div className={clsx('flex gap-2', users.length > 0 ? 'justify-between' : 'justify-center')}>
            {users.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setManual(false)}>
                {t('login.backToUsers')}
              </Button>
            )}
            {quickConnect && (
              <Button variant="ghost" size="sm" icon={<KeyRound size={14} />} onClick={startQuickConnect}>
                {t('login.quickConnect')}
              </Button>
            )}
          </div>
        </form>
      )}

      {disclaimer && (
        <p className="border-t border-white/10 pt-4 text-center text-xs whitespace-pre-wrap text-muted" data-testid="login-disclaimer">
          {disclaimer}
        </p>
      )}
    </div>
  );
}

/**
 * The server's login disclaimer as plain text. Jellyfin's web interface accepts HTML there; the
 * tags are dropped here rather than shown, and nothing in it is ever run.
 */
export function disclaimerText(value: string | null | undefined): string {
  if (!value) return '';
  return (new DOMParser().parseFromString(value, 'text/html').body.textContent ?? '').trim();
}
