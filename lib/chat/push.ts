"use client";

import { useCallback, useEffect, useState } from "react";
import type { PushSubscriptionInfo } from "./types";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Push needs a service worker, the Push API and the server's public key. */
export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined" &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Register public/sw.js once per page (it shows pushes and makes the app
 * installable). Null where service workers aren't available (e.g. plain http
 * other than localhost).
 */
export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  registration ??= navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch((error) => {
      console.warn("service worker registration failed:", error);
      return null;
    });
  return registration;
}

/** The VAPID key as the bytes PushManager.subscribe wants. */
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function toInfo(subscription: PushSubscription): PushSubscriptionInfo | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

type Save = (subscription: PushSubscriptionInfo) => Promise<string | undefined>;
type Forget = (endpoint: string) => Promise<string | undefined>;

/**
 * Re-send this browser's existing subscription (on each connection), so it
 * follows whoever is signed in here now.
 */
export async function syncPushSubscription(save: Save) {
  if (!pushSupported()) return;
  const reg = await registerServiceWorker();
  const existing = await reg?.pushManager.getSubscription();
  const info = existing && toInfo(existing);
  if (info) await save(info);
}

/** This browser's push subscription: while it's on, the server pushes to it when you have no tab open. */
export function usePush(save: Save, forget: Forget) {
  const supported = pushSupported();
  /** `undefined` until checked. */
  const [subscribed, setSubscribed] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void registerServiceWorker().then(async (reg) => {
      const existing = await reg?.pushManager.getSubscription();
      if (active) setSubscribed(Boolean(existing));
    });
    return () => {
      active = false;
    };
  }, [supported]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      // Asked inside the click, so browsers allow the prompt.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications are blocked for this site in your browser's settings.");
        return;
      }
      const reg = await registerServiceWorker();
      if (!reg) {
        setError("This browser can't run the notification service here.");
        return;
      }
      await navigator.serviceWorker.ready;
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY!) }));
      const info = toInfo(subscription);
      const failure = info ? await save(info) : "Your browser gave an incomplete subscription.";
      if (failure) {
        await subscription.unsubscribe();
        setError(failure);
        return;
      }
      setSubscribed(true);
    } catch {
      setError("Couldn't turn on push notifications in this browser.");
    } finally {
      setBusy(false);
    }
  }, [save]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const reg = await registerServiceWorker();
      const subscription = await reg?.pushManager.getSubscription();
      if (subscription) {
        const failure = await forget(subscription.endpoint);
        if (failure) {
          setError(failure);
          return;
        }
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, [forget]);

  return { supported, subscribed, busy, error, enable, disable };
}
