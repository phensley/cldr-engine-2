#!/usr/bin/env node
/**
 * @phensley/cldr-generate CLI. Loads the consumer's .ts config by
 * registering the tsx loader, then runs the generator implementation
 * (src/cli.ts).
 */
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.js');
