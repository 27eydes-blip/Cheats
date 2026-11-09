import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestPlayer } from "./guest-player";

export const metadata: Metadata = { title: "Play" };

export default function SharedPlayPage() {
  return (
    <Suspense>
      <GuestPlayer />
    </Suspense>
  );
}
