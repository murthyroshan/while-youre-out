// Builds the Alexa skill package from source: the interaction model (one catch-all intent, so what
// the sitter says reaches the add-on in their own words, as it would with Alexa+) and the skill code,
// bundled into one file with no dependencies to install. Usage: node alexa/build.mjs
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// What people say, so Alexa's speech model learns the shape of a free sentence. The words reach the
// add-on as they were said; these are examples, not a list it must match.
const SAID = [
  'priya is babysitting tonight', 'dadi is looking after maya tonight', 'we are heading out', 'quiz me', 'skip', 'yes', 'no', 'done', 'next', 'next step', 'repeat that',
  'where is the epipen', 'where are her pyjamas', 'where is the first aid kit', 'where is the dog food kept', 'what is next', 'what time is bedtime', 'when is lights out', 'what time is dinner',
  "what's for dinner", 'what should the kids eat for dinner', 'can maya have a cookie', 'can she have the cookies on the counter', 'can she have some ice cream', 'is pad thai okay for her',
  'can she have a banana', 'she won’t eat her dinner', 'can we order dinner', 'order the mac and cheese', 'order the pizza', 'is our dinner here', 'how much tv can she watch',
  'can she watch one more episode', 'can she watch a scary movie', 'can her friend come over', 'can she stay up until nine', 'can i give her tylenol for her fever', 'she has a rash is it serious',
  'she bumped her head', 'maya is asleep', 'she fell asleep at eight ten', 'maya ate all her dinner', 'she is watching cartoons', 'we ran out of diapers', 'bruno ate a chocolate bar',
  'did bruno get his walk', 'someone is knocking should i open the door', 'there is a man at the door', 'who is at the door', 'the doorbell rang', 'emergency', 'help',
  "maya can't breathe", 'her lips are swelling', 'she is choking', 'i gave her the epipen', 'the paramedics are here', "it's over", 'call mom', 'call anita', 'ask the parents',
  'ask anita if she can stay up late', 'any answer from the parents', 'maya misses her mom', 'play the goodnight message', 'she won’t stop crying', 'how is it going', 'go home',
  'show the home screen', 'what can you do', 'thank you', 'pay priya', "what's the plan for tonight", 'the parents are home', 'end the handoff', 'start over', 'she speaks hindi',
  'what is the wifi password', 'when are the parents coming back', 'who do i call first', 'what do i do if she has an allergic reaction', 'how do i use the epipen', 'is it too cold in here',
  'what temperature should the thermostat be', 'can she have candy before bed', 'can she skip her bath tonight', 'we are out of milk', 'she took her bath', 'she brushed her teeth',
  'read her two stories', 'the smoke alarm is beeping', 'i smell gas', 'there is smoke in the kitchen', 'she swallowed a battery', "i can't find maya",
];

const MODEL = {
  interactionModel: {
    languageModel: {
      invocationName: 'while you are out',
      intents: [
        {
          name: 'UtteranceIntent',
          slots: [{ name: 'utterance', type: 'WhatWasSaid' }],
          samples: ['{utterance}', 'tell it {utterance}', 'ask it {utterance}', 'say {utterance}', '{utterance} please'],
        },
        { name: 'AMAZON.YesIntent', samples: [] },
        { name: 'AMAZON.NoIntent', samples: [] },
        { name: 'AMAZON.HelpIntent', samples: [] },
        { name: 'AMAZON.StopIntent', samples: [] },
        { name: 'AMAZON.CancelIntent', samples: [] },
        { name: 'AMAZON.NavigateHomeIntent', samples: [] },
        { name: 'AMAZON.FallbackIntent', samples: [] },
      ],
      types: [{ name: 'WhatWasSaid', values: SAID.map((v) => ({ name: { value: v.replace(/’/g, "'") } })) }],
    },
  },
};

// Hindi, as a grandparent or a nanny in India says it: in Devanagari, in Hinglish, and mixed with
// English. The add-on catches a Hindi emergency with its own rules; other questions are translated.
const SAID_HI = [
  'एपिपेन कहाँ है', 'एपीपेन कहां रखा है', 'क्या माया कुकी खा सकती है', 'क्या वह चॉकलेट खा सकती है', 'खाने में क्या है', 'रात के खाने में क्या है', 'अगला क्या है',
  'सोने का समय कब है', 'माया सो गई', 'माया ने खाना खा लिया', 'वह कार्टून देख रही है', 'दरवाज़े पर कोई है क्या मैं खोलूँ', 'कोई दरवाज़ा खटखटा रहा है',
  'आपातकाल', 'इमरजेंसी', 'मदद', 'माया साँस नहीं ले पा रही', 'उसके होंठ सूज रहे हैं', 'माया बेहोश हो गई', 'रसोई में आग लग गई', 'गैस की बदबू आ रही है',
  'माँ से पूछो', 'अनीता से पूछो कि क्या वह देर तक जाग सकती है', 'मम्मी को फ़ोन करो', 'माया को अपनी माँ की याद आ रही है', 'हो गया', 'अगला', 'फिर से बताओ', 'हाँ', 'नहीं', 'धन्यवाद',
  'epipen kahan hai', 'maya so gayi', 'kya main darwaza kholun', 'maya saans nahi le pa rahi', 'mummy ko phone karo', 'khane mein kya hai', 'agla kya hai', 'ho gaya',
];
const LOCALES = ['en-US', 'en-GB', 'en-IN', 'en-CA', 'en-AU', 'hi-IN'];
const modelFor = (locale) =>
  locale === 'hi-IN'
    ? { interactionModel: { languageModel: { ...MODEL.interactionModel.languageModel, types: [{ name: 'WhatWasSaid', values: [...SAID_HI, ...SAID].map((v) => ({ name: { value: v.replace(/’/g, "'") } })) }] } } }
    : MODEL;
mkdirSync(here('./skill-package/interactionModels/custom'), { recursive: true });
for (const locale of LOCALES) writeFileSync(here(`./skill-package/interactionModels/custom/${locale}.json`), `${JSON.stringify(modelFor(locale), null, 2)}\n`);

const SERVER = 'https://while-youre-out-wpj3.onrender.com';
const listing = {
  summary: "The parents' notes for whoever is looking after the kids, with safety enforced in code.",
  description:
    "While You're Out holds the parents' notes for tonight's babysitter, grandparent or nanny: what she's allergic to, where the EpiPen is, bedtime, the rules. It never says a food or medicine is safe, never reads private details aloud, and in an emergency reads the parents' own plan step by step while alerting them. This skill connects to the While You're Out demo add-on; each Alexa account gets its own demo house.",
  examplePhrases: ['Alexa, open while you are out', 'Alexa, ask while you are out where the EpiPen is', 'Alexa, tell while you are out Priya is babysitting tonight'],
  keywords: ['babysitter', 'babysitting', 'allergy', 'handoff', 'nanny', 'grandparent'],
};
writeFileSync(
  here('./skill-package/skill.json'),
  `${JSON.stringify(
    {
      manifest: {
        manifestVersion: '1.0',
        publishingInformation: {
          locales: Object.fromEntries(LOCALES.map((l) => [l, { name: "While You're Out", ...listing }])),
          isAvailableWorldwide: true,
          testingInstructions: "Say: Alexa, open while you are out. Then: Priya is babysitting tonight. Then: where's the EpiPen? Can Maya have a cookie? Someone is knocking, should I open the door? Emergency, she can't breathe. The Alexa app card links to the parent page for the same demo house.",
          category: 'ORGANIZERS_AND_ASSISTANTS',
          distributionCountries: [],
        },
        privacyAndCompliance: {
          allowsPurchases: false,
          usesPersonalInfo: false,
          isChildDirected: false,
          isExportCompliant: true,
          containsAds: false,
          locales: Object.fromEntries(LOCALES.map((l) => [l, { privacyPolicyUrl: `${SERVER}/privacy`, termsOfUseUrl: `${SERVER}/terms` }])),
        },
        apis: { custom: { interfaces: [{ type: 'ALEXA_PRESENTATION_APL' }] } },
      },
    },
    null,
    2,
  )}\n`,
);

await build({
  entryPoints: [here('./src/index.ts')],
  outfile: here('./lambda/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node16',
  format: 'cjs',
  minify: false,
  legalComments: 'none',
  banner: { js: "// Built by alexa/build.mjs from alexa/src. Don't edit: edit the source and rebuild." },
});
writeFileSync(here('./lambda/package.json'), `${JSON.stringify({ name: 'while-youre-out-alexa', version: '1.0.0', main: 'index.js', private: true, license: 'MIT' }, null, 2)}\n`);
console.log(`built alexa/lambda/index.js and the interaction model for ${LOCALES.join(', ')}`);
