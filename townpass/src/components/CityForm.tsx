import { Btn, Field } from "./admin";
import type { City } from "@/lib/db";

export function CityFields({ city }: { city?: City }) {
  const lifetime = !city || city.access_hours === null;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {!city && <Field label="URL slug" name="slug" required placeholder="montauk" hint="/city/<slug>, can't change later" />}
      <Field label="Name" name="name" required defaultValue={city?.name} placeholder="Montauk" />
      <Field label="State" name="state" required defaultValue={city?.state} placeholder="NY" />
      <Field label="Sticker code" name="code" required defaultValue={city?.code} placeholder="MTK" hint="Prefix of sticker IDs" />
      <Field label="Tagline" name="tagline" defaultValue={city?.tagline} className="md:col-span-2" placeholder="The End, done right." />
      <Field label="Timezone" name="timezone" defaultValue={city?.timezone ?? "America/New_York"} hint="IANA name, e.g. America/Chicago" />
      <Field label="Price (USD)" name="price" type="number" required defaultValue={city ? city.price_cents / 100 : 5} />
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Access</span>
        <select name="access_mode" defaultValue={lifetime ? "lifetime" : "hours"} className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm">
          <option value="lifetime">Lifetime (per city)</option>
          <option value="hours">Timed pass (hours below)</option>
        </select>
      </label>
      <Field label="Pass length (hours)" name="access_hours" type="number" defaultValue={city?.access_hours ?? 24} hint="Used only for timed passes" />
      <Field label="Summer starts (MM-DD)" name="summer_start" defaultValue={city?.summer_start ?? "05-22"} hint="Summer hours apply from this date…" />
      <Field label="Summer ends (MM-DD)" name="summer_end" defaultValue={city?.summer_end ?? "09-08"} hint="…through this date (inclusive)" />
      <label className="flex items-center gap-2 self-center text-sm">
        <input type="checkbox" name="published" defaultChecked={!!city?.published} className="size-4 accent-[#d4af37]" />
        Published (visible to the public)
      </label>
      <div className="md:col-span-3">
        <Btn>{city ? "Save city" : "Create city"}</Btn>
      </div>
    </div>
  );
}
