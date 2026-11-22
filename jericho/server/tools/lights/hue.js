// Philips Hue provider — not implemented yet (no bulbs). When you get a bridge:
//  1. Find its IP (https://discovery.meethue.com) and create an app key by pressing
//     the bridge button, then POST {"devicetype":"jericho#laptop"} to http://<ip>/api
//  2. Put HUE_BRIDGE_IP and HUE_APP_KEY in .env
//  3. Map each room in settings.json to a Hue group id and implement setLight with:
//     PUT http://<ip>/api/<key>/groups/<id>/action  {"on":true,"bri":<1-254>}
// Then set "lights.provider": "hue" in settings.json.
export async function setLight() {
  throw new Error("Hue lights are not set up yet. See server/tools/lights/hue.js.");
}
export async function getState() {
  return {};
}
