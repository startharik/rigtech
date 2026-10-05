"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import Image from "next/image";

type InstallPromptOutcome = "accepted" | "dismissed";
type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: InstallPromptOutcome; platform: string }>;
};

type InstallPlatform = "android" | "ios";

const dismissalStorageKey = "rigtech:pwa-install-dismissed-at";
const installedStorageKey = "rigtech:pwa-installed";
const dismissalPeriodMs = 30 * 24 * 60 * 60 * 1000;

export default function PwaRegister() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);

  const isInstalled = useCallback(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = "standalone" in navigator && navigator.standalone === true;
    return standalone || iosStandalone || localStorage.getItem(installedStorageKey) === "true";
  }, []);

  const dismissPrompt = useCallback(() => {
    localStorage.setItem(dismissalStorageKey, String(Date.now()));
    setShowPrompt(false);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Offline support is progressive; a registration failure must not affect the app.
      });
    }

    const userAgent = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(userAgent);
    if (!isIOS && !isAndroid) return;

    if (isInstalled()) return;

    const dismissedAt = Number(localStorage.getItem(dismissalStorageKey) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < dismissalPeriodMs) return;

    let showTimer = 0;
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => {
        if (!isInstalled()) {
          setPlatform("android");
          setShowPrompt(true);
        }
      }, 1200);
    };
    const onAppInstalled = () => {
      localStorage.setItem(installedStorageKey, "true");
      setInstallPrompt(null);
      setShowPrompt(false);
    };
    const onDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        localStorage.setItem(installedStorageKey, "true");
        setShowPrompt(false);
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    displayMode.addEventListener("change", onDisplayModeChange);

    if (isIOS) {
      showTimer = window.setTimeout(() => {
        if (!isInstalled()) {
          setPlatform("ios");
          setShowPrompt(true);
        }
      }, 1200);
    } else {
      showTimer = window.setTimeout(() => {
        if (!isInstalled()) {
          setPlatform("android");
          setShowPrompt(true);
        }
      }, 3500);
    }

    return () => {
      window.clearTimeout(showTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      displayMode.removeEventListener("change", onDisplayModeChange);
    };
  }, [isInstalled]);

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }

    setInstalling(true);
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (outcome === "accepted") {
        localStorage.setItem(installedStorageKey, "true");
        setShowPrompt(false);
      } else {
        dismissPrompt();
      }
    } catch (error) {
      console.error("Unable to open the browser install prompt.", error);
      setShowInstructions(true);
    } finally {
      setInstalling(false);
    }
  };

  if (!showPrompt || !platform) return null;

  const isIOS = platform === "ios";
  const canPromptNatively = !isIOS && installPrompt !== null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:items-center sm:p-5" onClick={dismissPrompt}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <Image src="/logo.png" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-2xl bg-slate-50 object-contain p-1" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Rigtech Operations</div>
            <h2 id="pwa-install-title" className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-900">Install the app</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">Get quick access to your workspace from your home screen.</p>
          </div>
          <button type="button" onClick={dismissPrompt} aria-label="Dismiss install prompt" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {showInstructions && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
              {isIOS ? <Share className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              {isIOS ? "Add from Safari" : "Add from your browser"}
            </div>
            <ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm leading-5 text-emerald-900/80">
              {isIOS ? (
                <>
                  <li>Open this page in Safari and tap the Share button.</li>
                  <li>Choose “Add to Home Screen”.</li>
                  <li>Tap “Add” to finish installing.</li>
                </>
              ) : (
                <>
                  <li>Open your browser menu (⋮).</li>
                  <li>Choose “Install app” or “Add to Home screen”.</li>
                  <li>Confirm the installation.</li>
                </>
              )}
            </ol>
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={dismissPrompt} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Not now
          </button>
          <button type="button" onClick={() => showInstructions ? dismissPrompt() : void handleInstall()} disabled={installing} className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60">
            {installing ? "Opening…" : showInstructions ? "Got it" : canPromptNatively ? "Install app" : "How to install"}
          </button>
        </div>
      </section>
    </div>
  );
}
