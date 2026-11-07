// OpenNext build config, read by `sst deploy` (infra/sst.config.ts, path '..').
//
// Streaming: the default OpenNext wrapper ("aws-lambda") buffers the whole response, so the owner shell
// (sidebar, header, skeletons) waited for the page's data queries before the first byte left the Lambda.
// "aws-lambda-streaming" sends each React chunk as soon as it renders, which is what lets the shell paint
// first and the data fill in after. SST reads the flag from the build output and sets the Function URL
// invoke mode to RESPONSE_STREAM; the converter stays the default "aws-apigw-v2" (the only one this wrapper accepts).
//
// Route preloading: on SST's warm ping (infra/sst.config.ts `warm`) the function also loads the Next route
// modules, so the first real request after a quiet spell does not pay for them. Only the streaming wrapper
// implements this event.
//
// Plain object, no type import: @opennextjs/aws is run through npx at deploy time and is not a dependency.
export default {
  default: {
    override: {
      wrapper: 'aws-lambda-streaming',
    },
    routePreloadingBehavior: 'onWarmerEvent',
  },
}
