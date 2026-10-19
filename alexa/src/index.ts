// The Lambda entry point Alexa-hosted skills call (bundled into lambda/index.js by build.mjs).
import { handle, type AlexaRequest } from './skill';

export const handler = async (event: AlexaRequest) => handle(event);
