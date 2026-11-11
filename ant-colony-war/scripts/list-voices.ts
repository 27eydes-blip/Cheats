// Lists the voices on your ElevenLabs account so you can pick a different narrator.
import 'dotenv/config';

(async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Set ELEVENLABS_API_KEY in .env first.');
  const res = await fetch(`${process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io'}/v1/voices`, { headers: { 'xi-api-key': key } });
  if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${await res.text()}`);
  const { voices } = (await res.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] };
  for (const v of voices) console.log(`${v.voice_id}  ${v.name.padEnd(24)} ${Object.values(v.labels ?? {}).join(', ')}`);
  console.log('\nSet ELEVENLABS_VOICE_ID=<id> in .env to use one.');
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
