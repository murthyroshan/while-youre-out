// The Lambda entry point Alexa-hosted skills call (bundled into lambda/index.js by build.mjs).
import './polyfill';
import { handle, type AlexaRequest } from './skill';

export const handler = async (event: AlexaRequest) => {
  try {
    return await handle(event);
  } catch (e) {
    // Never a silent failure: a calm sentence for the person, and the reason in the Alexa app card
    // (which the developer console shows), so it can be fixed.
    console.error(e);
    const why = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return {
      version: '1.0',
      response: {
        outputSpeech: { type: 'PlainText', text: "Sorry, something went wrong on my side. Please try again." },
        card: { type: 'Simple', title: "While You're Out: error", content: why.slice(0, 500) },
        shouldEndSession: false,
      },
    };
  }
};
