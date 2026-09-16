import { getTrainingProfile } from './training-profile.mjs';
const normalized = value => String(value || '').toLowerCase();
export function estimatedRank(rating) {
  if (rating < 1200) return 'newbie';
  if (rating < 1400) return 'pupil';
  if (rating < 1600) return 'specialist';
  if (rating < 1900) return 'expert';
  if (rating < 2100) return 'candidate master';
  if (rating < 2300) return 'master';
  if (rating < 2400) return 'international master';
  if (rating < 2600) return 'grandmaster';
  if (rating < 3000) return 'international grandmaster';
  return 'legendary grandmaster';
}
export function selectRatingView(data, study, estimate) {
  if (!data) return data;
  const selected = getTrainingProfile(data.user, study || {}).displayRatingMode === 'estimated';
  if (!selected || normalized(estimate?.handle) !== normalized(data.handle || data.user?.handle) || !Number.isFinite(estimate?.rating)) return {...data, user:{...data.user,ratingMode:'official'}, ratingMode:'official', estimatedPending:selected};
  const rating = estimate.rating;
  const ratings = normalized(data.ratingDistribution?.handle) === normalized(data.handle) ? data.ratingDistribution?.ratings : null;
  // A comparison with a cached active-user distribution, never an official rank.
  const standing = Array.isArray(ratings) && ratings.length ? {
    position: 1 + ratings.filter(value=>value>rating).length,
    total: ratings.length + 1,
    topPercent: (1 + ratings.filter(value=>value>rating).length) / (ratings.length+1) * 100,
    syncedAt: data.ratingDistribution.syncedAt, estimated:true,
  } : {estimated:true};
  return {...data, ratingMode:'estimated', officialUser:data.user, officialRatingHistory:data.ratingHistory,
    user:{...data.user,rating,rank:estimatedRank(rating),maxRating:Math.max(estimate.baseline,...estimate.entries.filter(e=>e.status==='counted').map(e=>e.newRating)),ratingMode:'estimated'},
    ratingStanding:standing,
    ratingHistory:estimate.entries.filter(e=>e.status==='counted').map(e=>({...e,handle:data.handle,estimated:true})),
  };
}
