import config from '../../../mushy.config.json';

export const NHA_TIEN_TRI_SLUG = config.slug || 'nha-tien-tri';

export function buildMiniAppNotificationData(data = {}) {
  const slug = NHA_TIEN_TRI_SLUG;

  return {
    type: 'mini_app',
    route: 'mini_app',
    action: 'open_mini_app',
    appSlug: slug,
    miniAppSlug: slug,
    mini_app_slug: slug,
    app_slug: slug,
    targetAppSlug: slug,
    target_app_slug: slug,
    slug,
    ...data,
  };
}
