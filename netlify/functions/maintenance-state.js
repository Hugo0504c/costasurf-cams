// Maintenance mode state for the edge function (/.netlify/functions/maintenance-state). Logic in shared/maintenance-state.js.
import state from '../shared/maintenance-state.js';
import { asV2 } from '../shared/lambda-adapter.mjs';

export default asV2(state.handler);
