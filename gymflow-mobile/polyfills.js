// Global polyfills that MUST be installed before any other module in the app is
// evaluated. Imported as the very first line of index.js.
//
// Hermes (React Native's JS engine) does not provide TextEncoder / TextDecoder.
// @supabase/realtime-js uses them to encode broadcast and heartbeat frames, so
// without these the realtime socket throws "Property 'TextDecoder' doesn't exist"
// on every heartbeat once a channel is subscribed.
import 'react-native-url-polyfill/auto';
import { TextEncoder, TextDecoder } from 'text-encoding';

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}
