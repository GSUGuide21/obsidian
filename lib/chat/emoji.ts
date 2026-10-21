// Emoji for the composer: a picker by category, and ":shortcode:" suggestions
// while typing. A hand-picked set of the ones people use (each with a
// shortcode, as most chat apps name them, and words to find it by), not
// every Unicode emoji: any emoji can still be typed or pasted.

export type Emoji = { emoji: string; name: string; keywords: string[] };

export type EmojiCategory = { id: string; label: string; emoji: Emoji[] };

/** "emoji shortcode keyword keyword…", one per line, per category. */
const DATA: [id: string, label: string, lines: string][] = [
  ["smileys", "Smileys", `
😀 grinning smile happy
😃 smiley happy joy
😄 smile happy joy laugh
😁 grin happy teeth
😆 laughing happy haha
😅 sweat_smile relief nervous
🤣 rofl laughing rolling
😂 joy laughing tears lol
🙂 slightly_smiling face
🙃 upside_down silly sarcasm
😉 wink flirt
😊 blush happy shy
😇 innocent angel halo
🥰 smiling_hearts love adore
😍 heart_eyes love crush
🤩 star_struck wow amazing
😘 kissing_heart kiss love
😋 yum delicious tasty
😛 tongue playful
😜 winking_tongue silly crazy
🤪 zany goofy wild
🤑 money_mouth rich
🤗 hugging hug
🤭 hand_over_mouth giggle oops
🤫 shushing quiet secret
🤔 thinking hmm wonder
🫡 salute respect
🤐 zipper_mouth secret quiet
🤨 raised_eyebrow skeptical
😐 neutral_face meh
😑 expressionless blank
😶 no_mouth speechless
🙄 eye_roll whatever
😏 smirk smug
😬 grimacing awkward yikes
😌 relieved calm
😔 pensive sad
😪 sleepy tired
🤤 drooling hungry
😴 sleeping zzz tired
😷 mask sick
🤒 thermometer sick ill
🤕 bandage hurt
🤢 nauseated sick gross
🤮 vomiting sick gross
🥵 hot heat sweating
🥶 cold freezing
🥴 woozy dizzy drunk
😵 dizzy_face confused
🤯 exploding_head mind_blown wow
🤠 cowboy yeehaw
🥳 partying party celebrate birthday
😎 sunglasses cool
🤓 nerd geek glasses
🧐 monocle curious inspect
😕 confused unsure
😟 worried concerned
🙁 slightly_frowning sad
😮 open_mouth surprised wow
😯 hushed surprised
😲 astonished shocked
😳 flushed embarrassed
🥺 pleading puppy_eyes please
😦 frowning shocked
😨 fearful scared
😰 anxious_sweat nervous
😢 cry sad tear
😭 sob crying sad
😱 scream scared shocked
😖 confounded frustrated
😣 persevere struggle
😞 disappointed sad
😓 sweat tired
😩 weary tired
😫 tired_face exhausted
🥱 yawning bored tired
😤 triumph huff proud
😡 rage angry mad
😠 angry mad
🤬 cursing swearing angry
😈 smiling_imp devil mischief
💀 skull dead lol
💩 poop
🤡 clown silly
👻 ghost spooky
👽 alien ufo
🤖 robot bot
😺 smiley_cat cat
`],
  ["people", "People & gestures", `
👋 wave hello hi bye
🤚 raised_back_of_hand stop
✋ raised_hand hand stop high_five
🖖 vulcan spock
👌 ok_hand ok perfect
🤌 pinched_fingers italian
✌️ v peace victory
🤞 crossed_fingers luck hope
🤟 love_you_gesture
🤘 metal rock
🤙 call_me shaka
👈 point_left left
👉 point_right right
👆 point_up up
👇 point_down down
☝️ point_up_2 one
👍 thumbsup yes like approve +1
👎 thumbsdown no dislike -1
✊ fist solidarity
👊 punch fist_bump
👏 clap applause bravo
🙌 raised_hands celebrate hooray
🫶 heart_hands love
👐 open_hands
🤝 handshake deal agreement
🙏 pray thanks please hope
✍️ writing write
💪 muscle strong flex
🧠 brain smart think
👀 eyes look see watching
👁️ eye see
🫠 melting embarrassed
🙋 raising_hand question me
🤷 shrug dunno whatever
🤦 facepalm ugh
🙇 bow sorry thanks
💁 tipping_hand info
🙆 ok_gesture
🙅 no_gesture
👶 baby
🧑‍💻 technologist developer coder
🧑‍🎨 artist
🧑‍🚀 astronaut space
🧑‍🍳 cook chef
🕺 dancer dance
💃 dancing dance party
👯 dancers party
🧘 lotus meditate calm
`],
  ["hearts", "Hearts & symbols", `
❤️ heart love red
🧡 orange_heart love
💛 yellow_heart love
💚 green_heart love
💙 blue_heart love
💜 purple_heart love
🖤 black_heart love
🤍 white_heart love
🤎 brown_heart love
💔 broken_heart sad heartbreak
❣️ heart_exclamation love
💕 two_hearts love
💖 sparkling_heart love
💗 heartpulse love
💯 100 hundred perfect score
💢 anger angry
💥 boom collision explode
💫 dizzy star
💦 sweat_drops water
💤 zzz sleep
✨ sparkles shiny magic new
⭐ star favorite
🌟 star2 glowing
🔥 fire lit hot
⚡ zap lightning electric
✅ white_check_mark done yes check
☑️ ballot_box_with_check done
✔️ heavy_check_mark check
❌ x no wrong cross
❎ negative_squared_cross
⭕ o circle
❗ exclamation important
❓ question what
‼️ bangbang
⚠️ warning caution
🚫 no_entry_sign forbidden
⛔ no_entry stop
🆗 ok
🆕 new
🆒 cool
🆘 sos help
➕ plus add
➖ minus
➡️ arrow_right next
⬅️ arrow_left back
⬆️ arrow_up up
⬇️ arrow_down down
🔁 repeat loop
🔄 arrows_counterclockwise refresh sync
♻️ recycle
🎵 musical_note music
🎶 notes music
💬 speech_balloon chat comment
💭 thought_balloon thinking
🗯️ anger_bubble
`],
  ["nature", "Animals & nature", `
🐶 dog puppy
🐱 cat kitten
🐭 mouse
🐹 hamster
🐰 rabbit bunny
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🐯 tiger
🦁 lion
🐮 cow
🐷 pig
🐸 frog
🐵 monkey_face
🙈 see_no_evil monkey
🙉 hear_no_evil monkey
🙊 speak_no_evil monkey
🐔 chicken
🐧 penguin
🐦 bird
🦉 owl
🦄 unicorn magic
🐝 bee honeybee
🦋 butterfly
🐌 snail slow
🐢 turtle slow
🐍 snake
🐙 octopus
🦈 shark
🐳 whale
🐬 dolphin
🦖 t_rex dinosaur
🌵 cactus desert
🌲 evergreen_tree tree
🌳 tree
🌴 palm_tree vacation beach
🌱 seedling grow plant new
🍀 four_leaf_clover luck
🍁 maple_leaf autumn fall
🌸 cherry_blossom flower spring
🌹 rose flower
🌻 sunflower flower
🌷 tulip flower
🌈 rainbow pride
☀️ sunny sun weather
🌤️ sun_behind_cloud weather
☁️ cloud weather
🌧️ rain weather
⛈️ thunderstorm weather
❄️ snowflake snow cold winter
☃️ snowman winter
🌊 ocean wave water sea
🌙 crescent_moon night
🌍 earth_africa world globe
🌎 earth_americas world globe
`],
  ["food", "Food & drink", `
🍎 apple fruit
🍌 banana fruit
🍉 watermelon fruit summer
🍇 grapes fruit
🍓 strawberry fruit
🍑 peach fruit
🍒 cherries fruit
🥑 avocado
🍅 tomato
🌶️ hot_pepper spicy
🥕 carrot vegetable
🌽 corn
🥐 croissant breakfast
🍞 bread
🧀 cheese
🥚 egg breakfast
🥓 bacon breakfast
🥞 pancakes breakfast
🍔 hamburger burger
🍟 fries
🍕 pizza
🌭 hotdog
🌮 taco
🌯 burrito
🥗 salad healthy
🍝 spaghetti pasta
🍜 ramen noodles
🍣 sushi
🍱 bento
🍿 popcorn movie
🍩 doughnut donut
🍪 cookie
🎂 birthday cake
🍰 cake dessert
🧁 cupcake
🍫 chocolate_bar
🍬 candy sweet
🍦 icecream dessert
☕ coffee tea morning
🍵 tea
🧋 bubble_tea boba
🥤 cup_with_straw soda drink
🍺 beer drink cheers
🍻 beers cheers
🍷 wine drink
🥂 champagne cheers celebrate
🍸 cocktail drink
🍾 bottle_with_popping_cork celebrate
`],
  ["activities", "Activities & travel", `
⚽ soccer football
🏀 basketball
🏈 football american
⚾ baseball
🎾 tennis
🏐 volleyball
🏓 ping_pong
🏆 trophy win award
🥇 first_place gold medal win
🥈 second_place silver
🥉 third_place bronze
🏅 medal
🎮 video_game gaming game
🕹️ joystick game
🎲 game_die dice
♟️ chess_pawn chess
🧩 jigsaw puzzle
🎯 dart target goal bullseye
🎳 bowling
🎨 art palette paint
🎬 clapper movie film
🎤 microphone sing karaoke
🎧 headphones music
🎸 guitar music
🎹 musical_keyboard piano
🥁 drum music
🎉 tada party celebrate congrats
🎊 confetti_ball party celebrate
🎈 balloon party birthday
🎁 gift present birthday
🎄 christmas_tree holiday
🎃 jack_o_lantern halloween
🚗 car drive
🚕 taxi
🚌 bus
🚲 bike bicycle
🛴 scooter
✈️ airplane flight travel
🚀 rocket launch ship fast
🛸 flying_saucer ufo
🚢 ship boat
🚦 traffic_light
🏠 house home
🏢 office building work
🏖️ beach vacation
⛰️ mountain
🏕️ camping
🗺️ map travel
🧳 luggage travel
`],
  ["objects", "Objects", `
💻 computer laptop
🖥️ desktop computer
⌨️ keyboard
🖱️ mouse computer
📱 iphone phone mobile
☎️ phone telephone call
🔋 battery
🔌 electric_plug
💡 bulb idea light
🔦 flashlight
🕯️ candle
📷 camera photo
🎥 movie_camera video
📺 tv television
📻 radio
⏰ alarm_clock time
⌛ hourglass time
⏳ hourglass_flowing_sand waiting
📅 date calendar
📆 calendar
📌 pushpin pin
📍 round_pushpin location
📎 paperclip attachment
✏️ pencil write edit
🖊️ pen write
📝 memo note write
📖 book read
📚 books library study
📒 ledger notebook
📁 file_folder folder
📂 open_file_folder folder
🗂️ card_index_dividers
📊 bar_chart stats chart
📈 chart_with_upwards_trend growth up
📉 chart_with_downwards_trend down
📋 clipboard
🗑️ wastebasket trash delete
🔒 lock locked secure private
🔓 unlock open
🔑 key password
🔨 hammer tool build
🔧 wrench tool fix
⚙️ gear settings
🧰 toolbox tools
🧪 test_tube science experiment
🔬 microscope science
🔭 telescope
💊 pill medicine
💰 moneybag money
💵 dollar money
💳 credit_card payment
📦 package box shipping
✉️ envelope email mail
📧 email mail
📣 mega announcement loud
📢 loudspeaker announcement
🔔 bell notification
🔕 no_bell mute
🏷️ label tag
🛒 shopping_cart
🎓 graduation school
👑 crown king queen
💎 gem diamond
🪄 magic_wand magic
`],
];

export const EMOJI_CATEGORIES: EmojiCategory[] = DATA.map(([id, label, lines]) => ({
  id,
  label,
  emoji: lines
    .trim()
    .split("\n")
    .map((line) => {
      const [emoji, name, ...keywords] = line.trim().split(/\s+/);
      return { emoji, name, keywords };
    }),
}));

export const ALL_EMOJI: Emoji[] = EMOJI_CATEGORIES.flatMap((category) => category.emoji);

/** A suggestion: a standard emoji (inserted as itself) or a group's custom one (inserted as ":name:"). */
export type EmojiSuggestion = { kind: "emoji"; emoji: string; name: string } | { kind: "custom"; name: string; url: string };

/**
 * Emoji matching what's typed after ":" — custom emoji first, then
 * standard ones whose shortcode starts with it, then whose shortcode or
 * keywords contain it.
 */
export function searchEmoji(query: string, custom: Record<string, string> = {}, limit = 8): EmojiSuggestion[] {
  const needle = query.toLowerCase().replace(/^:|:$/g, "");
  if (!needle) return [];
  const customs: EmojiSuggestion[] = Object.entries(custom)
    .filter(([name]) => name.includes(needle))
    .sort(([a], [b]) => Number(b.startsWith(needle)) - Number(a.startsWith(needle)) || a.localeCompare(b))
    .map(([name, url]) => ({ kind: "custom", name, url }));
  const rank = (e: Emoji) =>
    e.name === needle ? 0 : e.name.startsWith(needle) ? 1 : e.name.includes(needle) ? 2 : e.keywords.some((k) => k.startsWith(needle)) ? 3 : 4;
  const standard: EmojiSuggestion[] = ALL_EMOJI.map((e) => ({ e, rank: rank(e) }))
    .filter(({ rank }) => rank < 4)
    .sort((a, b) => a.rank - b.rank)
    .map(({ e }) => ({ kind: "emoji", emoji: e.emoji, name: e.name }));
  return [...customs, ...standard].slice(0, limit);
}

/** Emoji whose shortcode or keywords contain `query` (the picker's search). */
export function filterEmoji(query: string): Emoji[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return ALL_EMOJI;
  return ALL_EMOJI.filter((e) => e.name.includes(needle) || e.keywords.some((k) => k.includes(needle)));
}
