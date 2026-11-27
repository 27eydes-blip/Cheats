# Content packs (mods)

Drop a JSON file in this folder to add content without touching code. Any of these keys are merged
into the base game data at boot:

```json
{
  "items": { "my_item": { "name": "...", "desc": "...", "value": 1, "weight": 0.1, "tags": ["material"] } },
  "recipes": [ { "id": "...", "name": "...", "in": {}, "out": {}, "station": null } ],
  "events": [ { "id": "...", "ages": [18, 60], "title": "...", "text": "...", "choices": [] } ],
  "logs": { "my_log": { "title": "...", "form": "note", "era": "now", "text": "..." } },
  "bottles": [ "A note that will drift in a bottle." ],
  "radioLines": { "freevoice": [ { "text": "..." } ] }
}
```
See `example-pack.json`.
