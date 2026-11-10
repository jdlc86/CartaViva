import {createM2RestaurantCandidate} from './m2-restaurant-candidate.mjs';

// M3 is an explicit extension of the already validated M2 composition. It is
// kept as a separate opt-in factory so callers cannot mistake M3 management
// routes for the normal health-only server or silently omit their SQL pools.
export async function createM3RestaurantCandidate(options={}){
 if(!options||typeof options!=='object'||!options.management)
  throw Error('invalid_m3_restaurant_candidate');
 const candidate=await createM2RestaurantCandidate(options);
 if(candidate.mode!=='opt-in-h3-h6-m3-candidate'){
  await candidate.close();
  throw Error('invalid_m3_restaurant_candidate');
 }
 return candidate;
}
