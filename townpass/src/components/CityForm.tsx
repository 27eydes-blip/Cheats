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
      <Field label="Busy season name" name="peak_label" defaultValue={city?.peak_label ?? "Summer"} hint={'"Summer", or "Peak season" for winter towns'} />
      <Field label="Busy season starts (MM-DD)" name="summer_start" defaultValue={city?.summer_start ?? "05-22"} hint="Busy-season hours apply from this date…" />
      <Field label="Busy season ends (MM-DD)" name="summer_end" defaultValue={city?.summer_end ?? "09-08"} hint="…through this date. Can wrap New Year (12-15 → 04-30)" />
      <Field label="Latitude" name="lat" type="number" defaultValue={city?.lat} placeholder="41.0359" hint="For live weather & UV. Right-click the town in Google Maps to copy." />
      <Field label="Longitude" name="lon" type="number" defaultValue={city?.lon} placeholder="-71.9545" hint="US longitudes are negative" />
      <label className="flex items-center gap-2 self-center text-sm">
        <input type="checkbox" name="coastal" defaultChecked={city ? !!city.coastal : true} className="size-4 accent-[#2fc4b4]" />
        Coastal (show water temp & waves)
      </label>
      <label className="flex items-center gap-2 self-center text-sm">
        <input type="checkbox" name="published" defaultChecked={!!city?.published} className="size-4 accent-[#2fc4b4]" />
        Published (visible to the public)
      </label>
      <div className="md:col-span-3">
        <Btn>{city ? "Save city" : "Create city"}</Btn>
      </div>
    </div>
  );
}
