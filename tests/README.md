Tests run offline against this repository's TypeScript source. `npm test` runs Vitest; `npm run typecheck` also checks test and fixture types.

The initial nine suites and BOM fixtures were adapted from [Spot-Bikes/build-queue-scripts at ca34f0c](https://github.com/Spot-Bikes/build-queue-scripts/tree/ca34f0c9132a764e311533a9b25e60c19c1c3973/tests). They test toolkit behavior rather than bike-specific workflows. Shared Apps Script mocks come from `@dougborg/gas-test-utils`; setup reinstalls them and resets toolkit configuration for each test. No credentials or real API calls are required.
