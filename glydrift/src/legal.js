/*! Glydrift — © 2026 Gleyde Technologies, LLC. All rights reserved. See LICENSE. */
// The publisher credit, the creator credit and the copyright, shown on the home screen, in
// Settings (CREDITS), on the loading screen (index.html) and in the website footer. NEVER remove
// or hide these: a test (tests/e2e/credit.spec.js) fails the build if any of them goes missing.
// Spell the company exactly "Gleyde Technologies, LLC".
export const PUBLISHER = "Gleyde Technologies, LLC";
export const PUBLISHED_BY = `Published by ${PUBLISHER}`;
export const CREATOR = "Sam Eyde III";
export const CREATED_BY = `Created by ${CREATOR}`;
export const CREATOR_ROLE = `Created by ${CREATOR}, Founder & CEO`;
export const PRODUCER = "Juwon Shon";
export const PRODUCED_BY = `Produced by ${PRODUCER}`;
export const PRODUCER_ROLE = `Produced by ${PRODUCER}, COO`;
/** The home screen footer: the publisher, the creator and the producer on one line. */
export const HOME_CREDIT = `${PUBLISHER} · ${CREATED_BY} · ${PRODUCED_BY}`;
export const COPYRIGHT = `© 2026 ${PUBLISHER}. All rights reserved.`;
