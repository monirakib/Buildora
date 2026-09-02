"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Mail, Monitor, Trash2 } from "lucide-react";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type PushDevice,
} from "@buildora/shared";
import {
  currentSubscription,
  disablePush,
  enablePush,
  getNotificationPreferences,
  getPushConfig,
  isPushSupported,
  listPushDevices,
  pushPermission,
  removePushDevice,
  sendTestEmail,
  sendTestPush,
  updateNotificationPreferences,
  type PushConfig,
} from "@/lib/apiPush";
import { Card, EmptyState, FieldRow, List, ghostButtonClass } from "./ui";

/**
 * Notification settings: the two channels that reach you when you aren't
 * looking at Buildora, and the browsers registered for push.
 *
 * The subscribed state is always read from the browser's own PushManager
 * rather than from anything stored, because a user can revoke permission in
 * site settings without the server ever hearing about it — and a toggle that
 * claims "on" when the browser says otherwise is worse than no toggle.
 */
export function NotificationsSection({
  token,
  email,
  emailVerified,
  onToast,
}: {
  token: string;
  /** The account's own address — where every email below actually lands. */
  email: string;
  /** Unconfirmed addresses are sent nothing, whatever the preference says. */
  emailVerified: boolean;
  onToast: (message: string, tone?: "success" | "error") => void;
}) {
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [cfg, savedPrefs, subscription] = await Promise.all([
        getPushConfig(),
        getNotificationPreferences(token),
        currentSubscription(),
      ]);
      setConfig(cfg);
      setPrefs(savedPrefs);
      setSubscribedHere(!!subscription);
      setDevices(await listPushDevices(token).catch(() => []));
    } catch {
      // Non-critical — the section renders with defaults and says push is off.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function togglePushHere() {
    setBusy(true);
    try {
      if (subscribedHere) {
        await disablePush(token);
        onToast("Push turned off for this browser");
      } else {
        await enablePush(token);
        onToast("Push is on for this browser", "success");
      }
      await refresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Couldn't change that", "error");
    } finally {
      setBusy(false);
    }
  }

  async function setPreference(partial: Partial<NotificationPreferences>) {
    // Optimistic: a checkbox that waits for a round trip feels broken.
    const previous = prefs;
    setPrefs({ ...prefs, ...partial });
    try {
      setPrefs(await updateNotificationPreferences(token, partial));
    } catch {
      setPrefs(previous);
      onToast("Couldn't save that preference", "error");
    }
  }

  const permission = pushPermission();
  const supported = isPushSupported();

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="How Buildora reaches you"
        description="The in-app bell is always on. These two find you when you're away."
        bodyClassName=""
      >
        <List>
          <FieldRow
            label="Browser push"
            hint={
              !supported
                ? "This browser doesn't support push notifications."
                : !config?.pushEnabled
                  ? "Not configured on this server yet."
                  : permission === "denied"
                    ? "Blocked for this site, allow notifications in your browser's site settings."
                    : "Alerts even when Buildora is closed."
            }
          >
            <label className="flex items-center gap-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={prefs.push}
                disabled={loading}
                onChange={(e) => setPreference({ push: e.target.checked })}
                className="h-4 w-4 accent-amber-500"
              />
              {prefs.push ? "On" : "Off"}
            </label>
          </FieldRow>

          <FieldRow
            label="Email"
            hint={
              config && !config.emailEnabled
                ? "Not configured on this server yet."
                : !emailVerified
                  ? "Confirm your address first, nothing is sent to an unconfirmed inbox."
                  : "Only the things that matter: decisions, money, and booked meetings."
            }
          >
            <label className="flex items-center gap-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={prefs.email}
                disabled={loading}
                onChange={(e) => setPreference({ email: e.target.checked })}
                className="h-4 w-4 accent-amber-500"
              />
              {prefs.email ? "On" : "Off"}
            </label>
          </FieldRow>
        </List>
      </Card>

      <Card
        title="This browser"
        description="Push has to be switched on once per browser you use."
        bodyClassName=""
        action={
          subscribedHere && (
            <button
              type="button"
              className={ghostButtonClass}
              onClick={async () => {
                try {
                  const sent = await sendTestPush(token);
                  onToast(`Test sent to ${sent} device${sent === 1 ? "" : "s"}`, "success");
                } catch (err) {
                  onToast(err instanceof Error ? err.message : "Couldn't send", "error");
                }
              }}
            >
              Send a test
            </button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <BellRing className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {subscribedHere ? "Notifications are on here" : "Notifications are off here"}
            </p>
            <p className="text-xs text-stone-500 dark:text-slate-400">
              {subscribedHere
                ? "This browser will buzz even with every Buildora tab closed."
                : "Turn them on to get alerts without keeping a tab open."}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !supported || !config?.pushEnabled || permission === "denied"}
            onClick={togglePushHere}
            className={ghostButtonClass}
          >
            {busy ? "Working…" : subscribedHere ? "Turn off" : "Turn on"}
          </button>
        </div>
      </Card>

      <Card
        title="Email"
        description="One message per significant event, never a digest, never marketing."
        bodyClassName=""
        action={
          <button
            type="button"
            className={ghostButtonClass}
            disabled={emailBusy || !config?.emailEnabled || !emailVerified}
            onClick={async () => {
              setEmailBusy(true);
              try {
                const sentTo = await sendTestEmail(token);
                onToast(`Test email sent to ${sentTo}`, "success");
              } catch (err) {
                // The server passes the mail provider's own refusal through, so
                // a wrong app password says so instead of "couldn't send".
                onToast(err instanceof Error ? err.message : "Couldn't send", "error");
              } finally {
                setEmailBusy(false);
              }
            }}
          >
            {emailBusy ? "Sending…" : "Send a test"}
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Mail className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="truncate">{email}</span>
              <span
                className={
                  emailVerified
                    ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.7rem] font-bold text-emerald-700 dark:text-emerald-300"
                    : "rounded-full bg-amber-500/20 px-2 py-0.5 text-[0.7rem] font-bold text-amber-800 dark:text-amber-300"
                }
              >
                {emailVerified ? "Confirmed" : "Not confirmed"}
              </span>
            </p>
            <p className="text-xs text-stone-500 dark:text-slate-400">
              {!config?.emailEnabled
                ? "Sending isn't configured on this server yet."
                : !emailVerified
                  ? "Use the banner at the top of this page to send yourself a confirmation link."
                  : prefs.email
                    ? "Change it under Security if this address is out of date."
                    : "Turned off above, only the test button will reach you."}
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Registered devices"
        description="Every browser signed up for push on this account."
        bodyClassName=""
      >
        {devices.length === 0 ? (
          <EmptyState
            icon={<Monitor className="h-5 w-5" />}
            title="No devices yet"
            sub="Turn push on above and this browser will appear here."
          />
        ) : (
          <List>
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-500/10 text-stone-600 dark:bg-white/10 dark:text-slate-300">
                  <Monitor className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {device.label}
                    {device.current && (
                      <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.7rem] font-bold text-emerald-700 dark:text-emerald-300">
                        This browser
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-slate-400">
                    Added {new Date(device.createdAt).toLocaleDateString()}
                    {device.lastUsedAt
                      ? ` · last alert ${new Date(device.lastUsedAt).toLocaleDateString()}`
                      : " · no alerts yet"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${device.label}`}
                  onClick={async () => {
                    try {
                      // Removing the row for *this* browser would leave it
                      // subscribed but unknown to the server, so unsubscribe
                      // properly instead.
                      if (device.current) await disablePush(token);
                      else await removePushDevice(token, device.id);
                      await refresh();
                      onToast("Device removed");
                    } catch {
                      onToast("Couldn't remove that device", "error");
                    }
                  }}
                  className={`${ghostButtonClass} !px-2.5`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </List>
        )}
      </Card>

      <p className="inline-flex items-start gap-2 px-1 text-xs text-stone-500 dark:text-slate-400">
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Chat messages, missed calls and site diary entries stay in the app, they never email you,
        and platform announcements never buzz your phone.
      </p>
    </div>
  );
}
