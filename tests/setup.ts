import { installGasGlobals } from '@dougborg/gas-test-utils';
import { afterEach, beforeEach, vi } from 'vitest';
import {
  __resetConfigProviderForTests,
  PropertiesServiceConfigProvider,
  setConfigProvider
} from '../src/ConfigProvider.js';

beforeEach(() => {
  vi.restoreAllMocks();
  installGasGlobals({ properties: { KATANA_API_KEY: 'test-katana-api-key' } });
  setConfigProvider(new PropertiesServiceConfigProvider({ defaultLocationId: 160411 }));
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetConfigProviderForTests();
});

export { createMockResponse, resetAllMocks } from '@dougborg/gas-test-utils';
