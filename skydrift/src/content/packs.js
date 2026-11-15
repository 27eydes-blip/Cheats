// Themed practice packs for "Unlimited Skies" owners. Practice rounds score from the estimates only
// and are never recorded, so they don't affect the daily rarity numbers.

export const PACKS = [
  {
    id: 'dragon-daycare',
    name: 'Dragon Daycare',
    blurb: 'Tiny wings, big tantrums.',
    emoji: '🐉',
    prompts: [
      { prompt: 'Name something a baby dragon would chew on', answers: `
Bone | bones | 12
Sword | swords, knight's sword | 8
Rock | rocks, boulder | 6
Gold | gold coin, coins, treasure | 10
Teething ring | teether, pacifier | 4
Shoe | shoes, boot | 5
Armor | knight armor, helmet | 5
Stick | sticks, branch | 4
Chair leg | furniture, table leg | 2
Castle | tower | 1.5
Knight | knights | 3
Charcoal | coal | 2
Dinosaur toy | toy, stuffed animal, teddy bear | 3
Fire hydrant | | 0.4
Mailbox | | 0.3
Lava rock | | 0.5
Crown | | 0.6
Bicycle | bike | 0.3
` },
      { prompt: 'Name a reason a dragon gets sent to time-out', answers: `
Burning things | fire, setting fire, arson, burning the house | 18
Biting | bit someone, bite | 10
Eating the knight | ate a knight, eating people | 6
Stealing treasure | stealing, stealing gold | 8
Flying indoors | flying in the house | 5
Smoking | smoke | 3
Roaring | yelling, screaming | 5
Breaking things | broke a vase, breaking stuff | 4
Eating the cat | ate the cat | 1
Toasting the teacher | | 0.3
Sneezing fire | sneezing | 1.5
Melting crayons | crayons | 0.4
Hoarding toys | not sharing | 2
Kidnapping a princess | princess | 1
` },
      { prompt: 'Name something on a dragon daycare snack menu', answers: `
Goldfish crackers | goldfish | 4
Sheep | lamb | 8
Hot peppers | chili, jalapeno, hot sauce | 6
Charcoal | coal | 6
Knights | knight | 5
Toast | | 3
Marshmallows | s'mores, smores | 6
Cow | cows, beef | 5
Fire ants | ants | 1
Lava cake | | 1.5
Chicken nuggets | nuggets, chicken | 4
Juice box | juice | 2
Gold coins | gold | 2
Spicy cheetos | flamin hot cheetos, hot cheetos | 2
Apple slices | apple, apples | 2
Rocks | rock | 1
Volcano pudding | | 0.2
` },
      { prompt: 'Name a nap-time song for baby dragons', answers: `
Twinkle Twinkle Little Star | twinkle twinkle | 12
Rock-a-bye Baby | rockabye baby, rock a bye | 10
Puff the Magic Dragon | puff | 10
Fire and Rain | | 1
Light My Fire | | 2
Burning Love | | 2
Ring of Fire | | 3
We Didn't Start the Fire | | 3
Girl on Fire | | 1.5
Smoke on the Water | | 1.5
Hush Little Baby | | 4
Let It Go | | 2
Great Balls of Fire | | 1.5
Brahms Lullaby | lullaby | 3
` },
      { prompt: 'Name something a dragon parent would forget at pickup', answers: `
Their kid | the baby, baby dragon, child | 16
Keys | car keys | 6
Backpack | bag, diaper bag | 6
Lunchbox | | 4
Fire extinguisher | | 1
Treasure | gold, hoard | 4
Wallet | money | 3
Phone | | 3
Wings | | 1
Sunglasses | | 1
Their name | name | 0.4
Permission slip | | 0.6
Spare scales | scales | 0.3
` },
    ],
  },
  {
    id: 'pirate-kitchen',
    name: 'Pirate Kitchen',
    blurb: 'Arr-tisanal cooking.',
    emoji: '🏴‍☠️',
    prompts: [
      { prompt: 'Name a dish on a pirate ship menu', answers: `
Fish | fish and chips, fried fish | 12
Fish sticks | fish fingers | 3
Hardtack | ship biscuit, biscuits | 4
Stew | fish stew | 6
Rum cake | rum | 6
Grog | | 3
Crab | crab legs, crab cakes | 4
Shrimp | prawns | 3
Lobster | | 3
Parrot pie | parrot | 1
Seaweed salad | seaweed | 2
Salted pork | salt pork | 2
Lime | limes | 2
Sea biscuit | | 1
Kraken calamari | calamari, squid | 2
Peg leg of lamb | leg of lamb | 0.4
Treasure chest pizza | | 0.2
` },
      { prompt: 'Name a terrible pirate restaurant name', answers: `
Arrby's | arrbys | 4
The Rusty Hook | rusty hook | 2
Long John Silver's | long john silvers | 8
Captain's Galley | the galley | 2
Walk the Plank | the plank | 3
Davy Jones' Diner | davy jones | 2
Sea Sick | seasick | 2
Scurvy | scurvy shack | 2
Peg Leg Pete's | peg leg | 2
Treasure Chest | | 2
The Black Pearl | black pearl | 3
Shipwreck | the shipwreck | 2
Barnacle Bistro | barnacles | 1
Mutiny Muffins | | 0.3
` },
      { prompt: 'Name something a pirate cook would use as a spoon', answers: `
Hook | hook hand | 18
Sword | cutlass, dagger, knife | 10
Shell | seashell, clam shell | 8
Peg leg | wooden leg | 6
Hand | hands, fingers | 5
Bone | bones | 3
Boot | shoe | 2
Cannonball | | 0.6
Coconut shell | coconut | 2
Skull | | 2
Oar | paddle | 3
Eyepatch | | 1
Parrot | | 1
Compass | | 0.4
Gold coin | coin | 1
` },
      { prompt: 'Name an ingredient you’d find in a sea monster smoothie', answers: `
Seaweed | kelp, algae | 16
Fish | sardines, tuna | 8
Salt water | sea water, ocean | 8
Ink | squid ink | 5
Shrimp | krill | 4
Sailors | sailor, pirate | 4
Barnacles | barnacle | 2
Coral | | 2
Banana | | 2
Jellyfish | | 2
Sand | | 2
Pearl | | 1
Boat | ship, ship wreck | 1
Mermaid hair | | 0.3
Anchor | | 0.4
` },
      { prompt: 'Name something a parrot would complain about on deck', answers: `
Crackers | no crackers, stale crackers | 16
Wind | | 4
Rain | storm | 4
Cannons | cannon, noise, too loud | 6
Captain | the captain | 4
Seasick | seasickness | 4
Food | | 3
Cage | | 3
Being called polly | polly | 4
Sharks | | 1
Seagulls | | 2
Cats | ship's cat, cat | 2
Being repeated | repeating | 1
The cook | | 0.4
Hats | | 0.3
` },
    ],
  },
  {
    id: 'haunted-gift-shop',
    name: 'Haunted Gift Shop',
    blurb: 'Souvenirs from beyond.',
    emoji: '👻',
    prompts: [
      { prompt: 'Name a souvenir sold at a haunted gift shop', answers: `
Keychain | keychains | 8
T-shirt | shirt, tee shirt | 8
Ouija board | | 6
Candle | candles | 5
Skull | skulls | 5
Mug | coffee mug | 5
Ghost plushie | plushie, stuffed ghost, plush | 4
Snow globe | | 3
Postcard | postcards | 4
Cursed doll | doll, creepy doll | 4
Tarot cards | | 3
Ectoplasm | slime | 2
Haunted mirror | mirror | 1.5
Bottled scream | scream in a jar | 0.3
Spare chains | chains | 0.6
` },
      { prompt: 'Name something a ghost cashier would say', answers: `
Boo | | 14
Paper or plastic | | 6
Next | next customer | 6
Have a nice day | | 6
Boo-ty please | | 0.2
Cash or card | | 5
Would you like a receipt | receipt | 4
Find everything okay | | 4
Ooooh | | 4
No refunds | | 3
Rest in peace | rip | 2
I'll be haunting you | | 1
Have a nice afterlife | afterlife | 1
Spooky discount | | 0.4
` },
      { prompt: 'Name a bad thing to find in a haunted gift shop bag', answers: `
Spider | spiders | 10
Severed hand | hand, finger | 8
Curse | a curse, cursed item | 8
Ghost | | 6
Skull | bones | 4
Snake | | 3
Blood | | 3
Eyeball | eye | 3
Rat | mouse | 3
Your own photo | | 0.6
Receipt for your soul | | 0.2
Old tooth | tooth | 1
Hair | | 2
` },
    ],
  },
];
