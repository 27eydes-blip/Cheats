/** Print a new VAPID key pair for web push. Paste both into Railway variables; never commit them. */
import webpush from "web-push";

const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:you@yourdomain.com   (or your site's https URL)`);
