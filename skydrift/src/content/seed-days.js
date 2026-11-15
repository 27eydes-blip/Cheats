// The first three days of SKYDRIFT ISLES. Once the admin page saves a day to the database,
// that version wins over anything here. Format of `answers`: see public/shared/match.js.
// The last number on each line is an estimated % of players; the long tail is what makes rare answers rare.

export const SEED_DAYS = {
  '2026-11-15': [
    {
      prompt: 'Name something you’d regret licking',
      answers: `
Battery | 9v battery, nine volt battery, aa battery, batteries | 12
Cactus | cacti, cactuses | 10
Frozen pole | flagpole, frozen flagpole, lamppost, frozen lamp post, metal pole | 9
Toilet | toilet seat, toliet, toilet bowl | 8
Doorknob | door handle, door knob | 4
Subway pole | subway rail, bus pole, train pole | 3
Floor | the floor, ground | 3
Shoe | shoes, sneaker, boot | 3
Electric fence | electrical fence | 2.5
Toad | frog, poison dart frog, cane toad | 2.5
Slug | snail, banana slug | 2
Hot stove | stove, stovetop, hot pan, frying pan, iron | 2
Knife | blade, razor, razor blade, sword | 2
Light socket | outlet, power outlet, plug socket, electrical outlet | 2
Gym mat | gym floor, yoga mat | 1.2
Bowling ball | bowling ball holes | 1
Keyboard | computer keyboard | 1
Mailbox | post box | 0.8
Hand sanitizer | sanitiser, hand sanitiser | 0.8
Soap | bar of soap, dish soap | 1.5
Jellyfish | jelly fish | 1
Porcupine | hedgehog | 1
Phone screen | phone, cell phone, smartphone | 1
Shopping cart handle | trolley handle, cart handle, shopping trolley | 0.8
Ice cube tray | ice tray | 0.4
Ghost pepper | carolina reaper, hot pepper, chili pepper, habanero | 1.5
Escalator handrail | escalator, escalator rail | 0.5
Your cat | cat, a cat | 1
Wasp nest | beehive, wasp, bee, bees nest, hornet nest | 1
Mousetrap | mouse trap | 0.6
Sea urchin | urchin | 0.5
Glue stick | glue | 0.6
Grandma’s cheek | grandma, aunt cheek | 0.3
A wizard’s staff | wizard staff, magic staff | 0.2
Lava lamp | lava | 0.6
Dragon | dragon scale, dragon tongue | 0.4
Thunderstorm cloud | storm cloud, cloud | 0.2
Envelope glue | envelope, stamp, stamps | 1
`,
    },
    {
      prompt: 'Name a terrible name for a pet dragon',
      answers: `
Fluffy | fluffie | 12
Puff | puff the magic dragon, puffy | 6
Sparky | sparkles, sparkle | 6
Steve | stevie | 5
Bob | bobby | 4
Kevin | kev | 4
Princess | princess fluffy | 3
Smokey | smoky, smokie | 3
Snuggles | snuggle, snugglebug | 3
Cupcake | muffin | 2.5
Mr Whiskers | whiskers | 2
Fireproof | fire proof | 0.8
Matchstick | matches, match | 0.8
Lizard | big lizard, liz | 1.5
Wet Blanket | wet blanket | 0.4
Ash | ashes | 1.5
Toast | toasty | 2
Marshmallow | marshmellow | 1.5
Barbecue | bbq | 1
Gary | garry | 1.5
Karen | | 1.2
Nugget | chicken nugget | 1.5
Tiny | lil guy, little guy | 2
Dave | david | 1
Gerald | gerold | 0.6
Extinguisher | fire extinguisher | 0.6
Sir Burns-a-Lot | burns a lot, burnsalot | 0.5
Insurance Claim | insurance, insurance claim | 0.2
Kindling | | 0.4
Puddle | | 0.3
Cheddar | cheese | 0.6
Linda | | 0.6
Pickles | pickle | 1
Doug | douglas | 0.8
Lunch | dinner, breakfast, snack | 0.6
Charcoal | coal | 0.8
Hot Sauce | sriracha | 0.6
Toaster | | 0.6
Frank | frankie | 0.6
Chimney | | 0.3
`,
    },
    {
      prompt: 'Name something a pirate would hide in a sandwich',
      answers: `
Gold coin | gold, coins, gold coins, doubloon, doubloons, coin | 18
Treasure map | map | 14
Treasure | | 8
Parrot | parrot feather, bird | 5
Key | treasure key, skeleton key | 5
Rum | bottle of rum, rum bottle | 5
Jewels | jewel, gems, gem, ruby, emerald, diamond, diamonds | 5
Eyepatch | eye patch | 3
Hook | hook hand | 3
Fish | sardine, sardines, anchovy, anchovies, tuna | 3
Compass | | 3
Message in a bottle | bottle, note, secret message, letter | 2
Wooden leg | peg leg, pegleg | 1.2
Glass eye | eyeball | 0.8
Sword | cutlass, dagger, knife | 1.5
Pickle | pickles | 1.2
Cannonball | cannon ball | 0.8
Seaweed | sea weed, kelp | 1
Lime | limes, lemon | 0.6
Earring | gold earring, earrings | 0.5
Spyglass | telescope | 0.7
Black spot | the black spot | 0.2
Crab | crab claw | 1
Pearl | pearls | 1
Hardtack | ship biscuit | 0.3
Mutiny plans | mutiny, escape plan | 0.3
Toenail | toenails, fingernail | 0.3
Wanted poster | | 0.3
Ship in a bottle | | 0.3
Kraken tentacle | tentacle, kraken, squid, octopus | 0.5
Bomb | gunpowder, dynamite | 0.8
Lockpick | lock pick | 0.3
Barnacles | barnacle | 0.3
Cheese | | 0.5
Sock | socks | 0.3
`,
    },
    {
      prompt: 'Name a snack that would survive a tornado',
      answers: `
Twinkie | twinkies, twinky | 14
Beef jerky | jerky | 9
Rice cake | rice cakes | 1.2
Granola bar | granola, protein bar, energy bar, cereal bar | 5
Pretzel | pretzels | 4
Rock candy | | 2
Fruitcake | fruit cake | 4
Jawbreaker | jaw breaker, gobstopper | 4
Hardtack | | 0.5
Peanut | peanuts, nuts, almond, almonds, cashews, mixed nuts | 3
Pringles | pringle, can of pringles | 4
Canned beans | beans, can of beans, canned food, tin of beans | 2
Honey | | 1.2
Saltine | saltines, crackers, cracker | 2
Popcorn | | 2
Candy corn | | 1.2
Gummy bears | gummies, gummy bear, gummi bears | 2.5
Rock | rocks, a rock | 0.5
Coconut | coconuts | 2
Potato | potatoes, baked potato | 1
Cheese wheel | wheel of cheese, parmesan | 1
Stale bagel | bagel | 0.8
Biscotti | | 0.6
Peanut butter | pb | 1
Marshmallow | marshmallows, marshmellow | 1
Hot dog | hotdog | 0.4
Frozen pizza | pizza | 0.6
Space food | astronaut ice cream | 0.3
Licorice | liquorice, twizzlers | 1
Lollipop | lolly, sucker | 1
Pemmican | | 0.2
Cheese puff | cheetos, cheese puffs | 0.6
Sunflower seeds | seeds | 0.6
Brick of fudge | fudge | 0.5
Dried mango | dried fruit, raisins, raisin | 0.8
Moon pie | moonpie | 0.4
Rice | uncooked rice | 0.3
Taffy | salt water taffy | 0.6
Anchor-shaped cookie | anchor, heavy cookie | 0.1
`,
    },
    {
      prompt: 'Name something a cloud would keep in its pocket',
      answers: `
Rain | raindrops, raindrop, rain drop | 16
Lightning | lightning bolt, bolt | 10
Snow | snowflake, snowflakes | 8
Rainbow | | 7
Thunder | | 4
Hail | hailstones | 3
Umbrella | | 4
Sunglasses | shades | 2
Bird | birds, a bird | 3
Airplane | plane, jet | 2
Kite | | 2
Balloon | balloons | 2.5
Sunshine | sun, sunbeam, sun beam | 3
Wind | breeze, gust | 2.5
Fog | mist | 1.5
Feather | feathers | 1
Mittens | gloves | 0.5
Moon | moonbeam | 1
Star | stars | 1.2
Tissue | tissues, hanky, handkerchief | 0.6
Weather report | forecast | 0.4
Cotton candy | candy floss | 1
Pillow | | 0.8
Lost frisbee | frisbee | 0.3
Drone | | 0.4
Snack | snacks, lunch | 0.6
Phone | cell phone | 0.6
Map | | 0.3
Sock | lost sock | 0.3
Wishes | wish | 0.5
Dandelion fluff | dandelion, dandelion seed | 0.3
Chapstick | lip balm | 0.2
Spare puddle | puddle | 0.3
`,
    },
    {
      prompt: 'Name something that would be weird to find in a lunchbox',
      answers: `
Frog | toad | 7
Snake | | 4
Rock | rocks, a rock, pebble | 5
Shoe | sneaker, shoes, sock, socks | 5
Money | cash, wad of cash, dollar | 4
Phone | cell phone, iphone | 4
Spider | spiders, tarantula | 4
Worm | worms, gummy worm | 4
Mouse | rat, hamster | 4
Bug | bugs, insects, cockroach, roach, beetle | 4
Fish | goldfish, live fish | 3
Teeth | tooth, dentures, false teeth | 3
Hair | wig, toupee | 2
Homework | book, textbook | 2
Love letter | note, letter, love note | 2
Raw egg | egg | 1.5
Key | keys, car keys | 1.5
Bar of soap | soap | 1.5
Brick | | 1
Toilet paper | tp | 1.5
Diamond ring | ring, engagement ring | 1
Cat | kitten | 1
Ransom note | | 0.4
Live lobster | lobster | 0.6
Skull | bone, bones | 1
Glitter | | 0.6
Tax return | taxes, tax forms | 0.3
Baby tooth | | 0.3
Treasure map | map | 0.4
Grenade | bomb | 0.4
Remote control | tv remote, remote | 0.6
Tiny horse | pony, horse | 0.3
Birthday candles | candle, candles | 0.4
A smaller lunchbox | lunchbox, another lunchbox | 0.2
Sand | | 0.6
`,
    },
    {
      prompt: 'Name a job a sky whale could have',
      answers: `
Taxi | taxi driver, cab driver, uber driver, uber, chauffeur | 10
Airplane | plane, airline, flying bus, bus, bus driver | 10
Pilot | | 4
Mail carrier | mailman, postman, delivery, delivery driver, courier | 8
Lifeguard | | 4
Weather forecaster | meteorologist, weatherman, weather reporter | 5
Rain maker | rainmaker, sprinkler, firefighter, fire fighter | 4
Tour guide | tour bus, sightseeing | 4
Singer | opera singer, choir, musician | 4
Cloud cleaner | window washer, sky cleaner, janitor | 1.5
Lighthouse | lighthouse keeper | 1
Ferry | ferry captain, boat | 1.5
Bouncer | | 1
Babysitter | nanny | 2
Blimp | advertising blimp, billboard | 2
Teacher | | 1.5
Garbage collector | garbage man, trash collector | 1
Ice cream truck | | 0.5
Architect | builder | 0.4
Doctor | | 0.6
Air traffic controller | | 0.6
Night light | nightlight | 0.3
Moon polisher | | 0.2
Hot air balloon | | 0.6
Umbrella | | 0.4
Sky librarian | librarian | 0.3
Therapist | counselor | 0.5
Security guard | guard | 0.6
DJ | disc jockey | 0.3
Accountant | | 0.4
Cloud shepherd | shepherd | 0.2
`,
    },
  ],
  '2026-11-16': [
    {
      prompt: 'Name something you should never microwave',
      answers: `
Metal | fork, spoon, aluminum foil, tin foil, foil, aluminium foil | 18
Egg | eggs, hard boiled egg | 10
Phone | cell phone, iphone | 6
Cat | kitten, pet, dog | 6
Grapes | grape | 4
Fish | salmon | 4
Baby | | 2
Water | plain water | 2
Microwave | another microwave | 1
Styrofoam | polystyrene | 2
Popcorn | | 2
Laptop | computer | 1.5
Battery | batteries | 2
Soap | bar of soap, ivory soap | 1
Light bulb | lightbulb | 1
Marshmallow peeps | peeps | 1
Hot dog | hotdog | 1
Credit card | | 0.6
Gold | gold ring, ring, jewelry | 1
Shoes | shoe | 1
Chili pepper | hot pepper, peppers | 0.6
Ice cream | | 1
Tamagotchi | | 0.3
Glow stick | | 0.3
Grandma’s fine china | fine china, china plates | 0.3
Love letter | letter, mail | 0.3
Breast milk | baby bottle | 0.3
Ketchup packet | ketchup | 0.3
Burrito | | 0.6
Pizza | | 0.6
Your homework | homework | 0.3
Cd | dvd, cds | 0.6
A snowman | snowman | 0.2
Thermos | travel mug | 0.4
Hand grenade | grenade, fireworks, firework | 0.4
`,
    },
    {
      prompt: 'Name something a wizard would buy at a gas station',
      answers: `
Snacks | snack, chips, candy, candy bar | 10
Energy drink | red bull, monster, monster energy | 10
Gas | fuel, gasoline, petrol | 6
Map | road map | 4
Lottery ticket | scratch off, lotto ticket, scratch card | 6
Coffee | | 5
Beef jerky | jerky | 4
Sunglasses | | 2
Hot dog | hotdog, roller hot dog | 3
Batteries | battery | 2
Lighter | matches | 2
Cigarettes | cigars, cigar, tobacco, pipe tobacco | 2
Slushie | slurpee, icee | 3
Air freshener | | 1.5
Gummy worms | gummies | 1.5
Windshield wiper fluid | wiper fluid | 0.6
Motor oil | oil | 1.5
Ice | bag of ice | 1
Phone charger | charger | 1
Crystals | crystal, mood ring | 1
Car wash | | 1
Broom air freshener | broom | 0.5
Toad jerky | | 0.1
Tire pressure gauge | tire gauge | 0.3
Mints | gum | 1.5
Hat | beanie, trucker hat | 0.6
Newt eyes | eye of newt | 0.4
Gas station sushi | sushi | 0.6
Novelty keychain | keychain | 0.4
Fortune cookie | | 0.3
Stamps | | 0.2
Pickled egg | pickled eggs | 0.4
Sandwich | | 0.6
Postcard | | 0.3
`,
    },
    {
      prompt: 'Name something that sounds delicious but isn’t food',
      answers: `
Candle | scented candle, yankee candle | 6
Play-Doh | playdough, play doh, playdoh | 8
Soap | bubble bath, body wash | 6
Lip balm | chapstick, lip gloss, lipstick | 4
Toothpaste | | 5
Cupcake perfume | perfume, cologne | 3
Hot cocoa bath bomb | bath bomb | 2
Crayon | crayons | 2
Lava cake lamp | lava lamp | 0.5
Brownie points | | 3
Couch potato | | 3
Hot tub | | 1
Cheesy movie | cheesy pickup line, cheese | 1
Jelly fish | jellyfish | 3
Peanut gallery | | 0.6
Butterfly | butter fly | 2.5
Honey badger | | 1
Pound cake hammer | | 0.1
Cookie | browser cookie, cookies | 3
Apple | apple computer, apple phone, mac | 2
Blackberry | blackberry phone | 1
Raspberry pi | raspberry pi computer | 0.8
Gingerbread house | | 0.6
Breadboard | | 0.3
Sugarcane toad | cane toad | 0.2
Caramel sauce hair dye | hair dye | 0.2
Pumpkin spice | pumpkin spice latte | 1
Salt lamp | | 0.4
Marshmallow fluff pillow | pillow | 0.4
Sweet pea | sweet peas | 0.4
Toffee hammer | | 0.1
Cotton candy clouds | clouds, cloud | 0.6
Coconut sunscreen | sunscreen | 0.8
Glue | glue stick | 1
Sugar glider | | 0.4
Muffin top | | 0.6
`,
    },
    {
      prompt: 'Name a thing that would make a terrible parachute',
      answers: `
Brick | bricks | 4
Rock | a rock, boulder | 5
Paper | paper towel, napkin, tissue, newspaper | 8
Umbrella | | 10
Anvil | | 4
Plastic bag | grocery bag, trash bag | 6
Blanket | sheet, bedsheet, bed sheet | 5
Net | fishing net | 4
Cheese | swiss cheese, slice of cheese | 3
Pizza | pizza slice | 2
Toilet paper | tp | 2
Spaghetti | noodles, pasta | 2
Lace | doily, lace curtain | 1.5
Sock | socks | 2
Tortilla | taco | 1.5
Leaf | leaves | 2
Bowling ball | | 2
Piano | | 1
Cloud | clouds | 1
Feather | feathers | 1
Underwear | boxers, undies | 2
Sweater | hoodie, jacket | 1
Hat | | 1
Fishnet stockings | fishnets | 0.4
Balloon | | 1
Pancake | pancakes, waffle | 1
Duct tape | tape | 0.4
Lettuce | lettuce leaf, cabbage | 0.6
Cake | | 0.6
Kite | | 0.6
Bubble wrap | bubble | 0.4
Shower curtain | curtain | 0.6
Toaster | | 0.4
A cat | cat | 0.5
Origami crane | origami | 0.3
Spiderweb | spider web, cobweb | 0.4
Wet tissue | wet napkin | 0.3
Lasagna | | 0.3
`,
    },
    {
      prompt: 'Name something a robot would be scared of',
      answers: `
Water | rain, puddle, ocean, pool | 22
Magnet | magnets | 12
Virus | computer virus, malware, hacker, hackers | 8
Rust | | 6
Power outage | blackout, unplugged, being unplugged, dead battery, low battery | 6
Lightning | thunderstorm, storm | 3
Hammer | sledgehammer | 2
Emp | electromagnetic pulse | 2
Fire | | 2
Humans | human, people | 3
Update | software update, updates, reboot, restart | 2
Bluescreen | blue screen of death | 1
Captcha | recaptcha, i am not a robot | 1
Static | static electricity | 1
Soup | | 0.4
Bath | bathtub, shower | 1
Off switch | off button, power button | 1.5
Toaster | | 0.6
Cat | cats | 0.6
Sand | | 0.6
Vacuum | roomba | 0.5
Recycling | recycling bin, junkyard, scrapyard, scrap metal | 1.5
Feelings | emotions, love | 1
Dust | dust bunny, dust bunnies | 0.5
Pop up ads | ads | 0.3
Spilled juice | juice, soda | 0.6
Wi-fi outage | no wifi, bad wifi, wifi | 1
Seagulls | seagull | 0.2
Glitter | | 0.3
Car wash | | 0.4
Older model | old phone, flip phone | 0.3
Typewriter | | 0.2
Microwave | | 0.4
A bigger robot | bigger robot | 0.3
Grandma with a cardigan | grandma | 0.2
`,
    },
    {
      prompt: 'Name something that would be a bad thing to say at a wedding',
      answers: `
I object | objection, i do not, i don't | 14
I'm pregnant | pregnant | 4
I love you | i love the groom, i love the bride | 6
Wrong name | wrong name in vows, calling the bride the wrong name | 5
It won't last | this won't last, they'll divorce, divorce | 6
Run | run away, run while you can | 3
I slept with | cheating, they cheated | 3
The food is bad | the food sucks, gross | 2
Who are you | who invited you | 2
Is there an open bar | open bar | 1
Free at last | | 0.3
Nice dress | ugly dress, is that a dress | 1.5
When's the funeral | funeral | 0.6
Congrats on the second marriage | second marriage | 0.4
I'm the real father | | 0.4
Good luck | good luck with that | 2
Rip | rest in peace | 0.5
Sorry for your loss | | 1
Happy birthday | | 1.5
Speak now | | 0.6
Second time's the charm | | 0.4
I kept the receipt | receipt | 0.3
She said yes to me first | | 0.2
The cake is a lie | | 0.2
Wrong wedding | i'm at the wrong wedding | 0.4
`,
    },
    {
      prompt: 'Name something you’d pack for a trip to the moon',
      answers: `
Spacesuit | space suit, astronaut suit, suit | 14
Oxygen | oxygen tank, air, air tank | 14
Food | snacks, space food | 8
Camera | | 4
Water | | 5
Flag | | 4
Helmet | space helmet | 3
Cheese | crackers | 4
Phone | phone charger, charger | 2
Toothbrush | | 2
Sunscreen | | 2
Blanket | jacket, coat, sweater | 2
Pillow | | 1
Telescope | binoculars | 1.5
Golf club | golf ball | 1
Book | | 1.5
Rocket | spaceship, rocket fuel | 2
Teddy bear | stuffed animal | 1
Map | | 1
Wine | | 0.6
Ping pong paddle | | 0.2
Trampoline | | 0.4
Pogo stick | | 0.3
Ziploc bags | ziploc, bags | 0.4
Moon boots | boots | 1.5
Lip balm | chapstick | 0.4
Spare gravity | gravity | 0.2
Dog | cat | 0.6
Passport | | 0.6
Wifi router | wifi | 0.4
Duct tape | | 0.6
Sombrero | | 0.1
A friend | friend, buddy | 0.6
`,
    },
  ],
  '2026-11-17': [
    {
      prompt: 'Name something a ghost would get mad about',
      answers: `
Ghostbusters | ghost hunters, ghost hunter, exorcist | 10
Vacuum | vacuum cleaner | 3
Being ignored | ignored | 5
Light | lights, flashlight, sunlight | 5
People in their house | new owners, new tenants, renovations | 7
Salt | | 3
Sage | burning sage | 3
Holy water | priest, exorcism | 4
Bedsheet costume | costume, halloween costume, sheet | 3
Not being scary | not scary, nobody scared | 3
Walls | walking into walls | 0.6
Chains | rusty chains | 1
Proton pack | | 0.6
Being called casper | casper | 1.5
Wifi | no wifi | 1
Can't eat | food, can't eat food | 1.5
Halloween decorations | | 1
Mirror | | 0.8
Doorbell | | 0.4
Ouija board | | 1
Skeptics | nonbelievers, people who don't believe in ghosts | 1
Dogs barking | dog, dogs | 1
Lint roller | | 0.2
Cold coffee | | 0.2
Moving furniture | furniture | 0.6
Wrong name on tombstone | tombstone, gravestone, headstone | 0.6
Sleepovers | slumber party | 0.3
Air conditioning | ac, air conditioner | 0.4
Spider webs | cobwebs | 0.4
Bed bugs | | 0.2
`,
    },
    {
      prompt: 'Name the worst thing to hear from your pilot',
      answers: `
Oops | uh oh, whoops, oh no | 14
Brace for impact | brace yourselves, crash | 9
We're going down | going down | 7
First time flying | it's my first day, first flight, first time | 8
Mayday | | 4
Does anyone know how to fly | anyone know how to fly | 5
We're out of fuel | out of fuel, no fuel, out of gas | 5
I'm drunk | drunk, i'm tipsy | 3
Where are we | i'm lost, we're lost | 4
Hold my beer | | 2
Engine failure | the engine fell off, engine fire | 3
Snakes on the plane | snakes on a plane | 2
Turbulence | | 1
I forgot | i forgot how to land | 1.5
Nice knowing you | goodbye, it was nice knowing you | 2
Is that a mountain | mountain | 1
Watch this | | 1
Siri, how do I land | siri | 0.4
Autopilot is broken | autopilot | 1
Bermuda triangle | | 0.6
We're landing in the ocean | water landing | 1
I left the stove on | stove | 0.4
The wings are just decorative | | 0.1
Taking a nap | i'm going to sleep, zzz | 0.6
We've been hijacked | hijacked | 1
`,
    },
    {
      prompt: 'Name something a raccoon would put on its birthday wishlist',
      answers: `
Trash | garbage, trash can, garbage can, dumpster | 25
Food | snacks, pizza | 8
Shiny things | shiny, shiny objects, jewelry | 5
Mask | new mask, ski mask | 3
Cat food | dog food, pet food | 4
Gloves | mittens | 2
Bread | | 1
Cheese | | 1
Grapes | fruit | 1
Marshmallows | marshmallow | 1
Corn | corn on the cob | 1
Cotton candy | | 2
Crayfish | crawfish | 0.3
Lock pick | lockpick, crowbar | 1
Flashlight | | 0.6
Bigger trash can | bigger bin | 1
Hamburger | burger | 0.6
Burglar outfit | stripes, striped shirt | 0.6
Night vision goggles | | 0.4
Leftovers | | 1.5
Mirror | | 0.3
Bath towel | towel, soap | 0.4
Stolen bike | bike | 0.3
Tiny hat | hat | 0.4
Hand sanitizer | | 0.4
A sidekick | friend, possum, opossum | 0.6
Pancakes | | 0.4
Tax evasion | taxes | 0.1
`,
    },
    {
      prompt: 'Name a bad superpower',
      answers: `
Talking to fish | talk to fish | 3
Invisible only when no one's looking | | 1
Super sneezing | sneezing | 2
Turning into a chair | | 0.2
Flying at 1 mph | slow flying, flying slowly | 2
Super slow | slow motion, super slowness, slowness | 4
Making toast | toast | 1
Glowing | glow in the dark | 2
Super smell | super smelling | 2
Knowing when milk expires | milk | 0.4
Shrinking | shrinking forever | 2
Bad luck | | 1
Smelly feet | smelly | 2
Laser eyes that only shoot glitter | glitter | 0.4
Teleporting 1 inch | teleport 1 inch, teleportation one inch | 1.5
Instant hiccups | hiccups | 1
Mind reading pets | mind reading, read minds | 2
Burping | super burp, burps | 2
Invisible to cats | | 0.2
Super farts | farting, farts, fart | 6
Changing color | color changing, chameleon | 1
Cold hands | | 0.4
Turning invisible when naked | | 0.3
Stretchy | stretching | 0.6
Predicting rain | weather | 0.3
Always knowing the time | knowing the time, time | 0.4
Super hearing | hearing everything | 1.5
Unlimited socks | socks | 0.3
Talking to plants | | 1
Summoning pigeons | pigeons | 0.4
`,
    },
    {
      prompt: 'Name something that would ruin a picnic',
      answers: `
Ants | ant | 20
Rain | storm, thunderstorm | 18
Bees | bee, wasps, wasp, hornets | 9
Bear | bears, yogi bear | 6
Wind | windy | 3
Mosquitoes | bugs, flies, mosquito | 4
Mud | | 1
Forgot the food | no food, forgot food | 3
Spilled drink | spilled juice, spilled wine | 1.5
Seagulls | seagull, birds | 2
Snake | snakes | 2
Goose | geese | 1.5
Dog | dogs | 2
Raccoon | raccoons | 1
Skunk | | 1
Sunburn | | 1
Food poisoning | | 1
Ex | your ex, ex boyfriend, ex girlfriend | 0.6
Tornado | | 1
Sprinklers | sprinkler | 1.5
Poison ivy | | 0.8
Meteor | asteroid | 0.4
Mime | | 0.2
Soggy sandwich | soggy bread | 0.5
Bagpipes | | 0.2
Bird poop | | 1
Lawnmower | | 0.3
Sky whale sneeze | | 0.1
`,
    },
    {
      prompt: 'Name something you could find under a giant’s couch cushion',
      answers: `
Coins | coin, money, change, giant coin | 16
Remote | remote control, tv remote | 12
Crumbs | crumb, cheeto, chips | 8
Human | person, people, a person, villager | 6
Cow | cows, sheep, goat | 3
Sword | knight, armor | 2
Keys | key, giant keys | 3
Phone | | 2
Boulder | rock, rocks | 2
Car | cars | 2
Tree | trees | 2
Jack | jack and the beanstalk, beanstalk | 2
Sock | socks | 2
Horse | | 1
Pizza | pizza crust | 1.5
Toenail | toenail clipping | 1
Lost treasure | treasure | 1
Popcorn | | 1
Bone | bones | 1
Golden egg | golden goose, goose | 1.5
House | small house | 0.6
Dragon | | 0.4
Cat | kitten | 0.6
Boat | ship | 0.4
Lego | legos | 0.6
Village | town, city | 0.4
Bus | school bus | 0.4
Hairball | hair | 0.6
Map | | 0.3
Lost kingdom | kingdom | 0.2
`,
    },
    {
      prompt: 'Name something you’d hear at a sky island farmer’s market',
      answers: `
Birds | bird song, chirping, birds singing | 8
Wind | wind chimes, whoosh | 8
Bargaining | haggling, how much | 6
Thunder | | 5
Cloud for sale | fresh clouds, clouds, cloud | 4
Rain | raindrops | 3
Music | fiddle, banjo, singing | 3
Wings flapping | flapping | 3
Airship | airplane, blimp | 2
Rooster | chickens, chicken | 2
Whale song | whales, sky whale | 2
Fresh rainbows | rainbow, rainbows | 2
Free samples | samples | 1.5
Organic | organic lightning | 1
Echo | echoes | 1
Kids laughing | laughter | 1
Bells | | 1
Goats | goat | 1
Dragon | dragons | 1
Stars on sale | starlight | 0.5
Someone falling | aaaaaah, screaming | 0.6
Balloon pop | balloon | 0.4
Moon cheese | cheese | 0.4
Gravity tax | tax | 0.1
Harp | | 0.5
Cash register | ka ching | 0.4
Feather dusters | feathers | 0.3
Kite strings | kite | 0.4
`,
    },
  ],
};
