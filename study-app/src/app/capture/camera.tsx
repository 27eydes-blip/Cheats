"use client";
import { motion } from "framer-motion";
import { IconCheck, IconClose } from "@/components/icons";
import { useEffect, useRef, useState } from "react";

/**
 * Full-screen rear camera for rapid multi-page capture: tap the shutter for
 * each page, then Done. Falls back to the system camera if the browser
 * won't give us a stream.
 */
export function CameraView({
  count,
  onShot,
  onDone,
  onUnavailable,
}: {
  count: number;
  onShot: (blob: Blob) => void;
  onDone: () => void;
  onUnavailable: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
          setReady(true);
        }
      } catch {
        if (!cancelled) onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onUnavailable]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onShot(b), "image/jpeg", 0.92);
    setFlash((f) => f + 1);
    navigator.vibrate?.(15);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={video} playsInline muted className="min-h-0 flex-1 object-contain" />
      <motion.div key={flash} initial={{ opacity: flash ? 0.7 : 0 }} animate={{ opacity: 0 }} className="pointer-events-none absolute inset-0 bg-white" />
      <div className="pb-safe flex items-center justify-between px-8 pt-4">
        <button type="button" onClick={onDone} aria-label="Close camera" className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur">
          <IconClose size={24} />
        </button>
        <button
          type="button"
          onClick={shoot}
          disabled={!ready}
          aria-label="Take photo"
          className="size-[76px] rounded-full border-[5px] border-white bg-[#c4f82a] shadow-[0_0_40px_-6px_rgb(196_248_42/0.8)] transition active:scale-90 disabled:opacity-40"
        />
        <button
          type="button"
          onClick={onDone}
          aria-label={`Done, ${count} pages`}
          className="flex h-12 min-w-12 items-center justify-center gap-1 rounded-full bg-white px-3 font-bold text-black"
        >
          {count > 0 ? count : <IconCheck size={24} />}
        </button>
      </div>
      <p className="pb-4 text-center text-sm text-white/70">Fill the frame with one page. Snap as many pages as you like.</p>
    </div>
  );
}
